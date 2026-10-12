package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

const a = "aaaaaaaaaaaaaaaaaaaaaaaaaa"
const b = "bbbbbbbbbbbbbbbbbbbbbbbbbb"
const c = "cccccccccccccccccccccccccc"
const x = "xxxxxxxxxxxxxxxxxxxxxxxxxx"
const postID = "pppppppppppppppppppppppppp"
const channelID = "dddddddddddddddddddddddddd"

type event struct {
	data   map[string]any
	target model.WebsocketBroadcast
}
type fake struct {
	plugin.API
	mu        sync.Mutex
	data      map[string][]byte
	expiry    map[string]int64
	clock     time.Time
	posts     map[string]*model.Post
	users     map[string]*model.User
	members   map[string]bool
	allowed   bool
	ch        model.Channel
	events    []event
	conflicts int
	writes    int
	failure   bool
	postError *model.AppError
	userError *model.AppError
}

func appErr() *model.AppError { return model.NewAppError("test", "test", nil, "", 404) }
func fixture() (*Plugin, *fake) {
	f := &fake{data: map[string][]byte{}, expiry: map[string]int64{}, clock: time.Unix(1800000000, 0), posts: map[string]*model.Post{}, users: map[string]*model.User{}, members: map[string]bool{a: true, b: true, c: true}, allowed: true, ch: model.Channel{Id: channelID, Type: model.ChannelTypeDirect}}
	for _, id := range []string{a, b, c, x} {
		f.users[id] = &model.User{Id: id, Username: "name-" + id[:1], Email: "secret@example.test"}
	}
	f.posts[postID] = &model.Post{Id: postID, UserId: a, ChannelId: channelID, CreateAt: f.clock.UnixMilli()}
	p := &Plugin{slots: make(chan struct{}, 16)}
	p.API = f
	p.config.Store(&configuration{90, true})
	p.repo = repository{f, func() time.Time { return f.clock }, func(time.Duration) {}}
	return p, f
}
func (f *fake) GetPost(id string) (*model.Post, *model.AppError) {
	if f.postError != nil {
		return nil, f.postError
	}
	if p := f.posts[id]; p != nil {
		return p, nil
	}
	return nil, appErr()
}
func (f *fake) GetUser(id string) (*model.User, *model.AppError) {
	if f.userError != nil {
		return nil, f.userError
	}
	if u := f.users[id]; u != nil {
		return u, nil
	}
	return nil, appErr()
}
func (f *fake) GetUsersByIds(ids []string) ([]*model.User, *model.AppError) {
	panic("receipt API must not resolve viewer profiles")
}
func (f *fake) GetChannelMember(ch, id string) (*model.ChannelMember, *model.AppError) {
	if ch == channelID && f.members[id] {
		return &model.ChannelMember{UserId: id}, nil
	}
	return nil, appErr()
}
func (f *fake) HasPermissionToChannel(uid, ch string, perm *model.Permission) bool { return f.allowed }
func (f *fake) GetChannel(id string) (*model.Channel, *model.AppError)             { return &f.ch, nil }
func (f *fake) KVGet(k string) ([]byte, *model.AppError) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failure {
		return nil, appErr()
	}
	if f.expiry[k] > 0 && f.expiry[k] <= f.clock.UnixMilli() {
		delete(f.data, k)
	}
	return bytes.Clone(f.data[k]), nil
}
func (f *fake) KVSetWithOptions(k string, v []byte, o model.PluginKVSetOptions) (bool, *model.AppError) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failure {
		return false, appErr()
	}
	if f.conflicts > 0 {
		f.conflicts--
		return false, nil
	}
	if !o.Atomic {
		d, err := decode(v)
		if err != nil || !d.Deleted {
			panic("non-atomic receipt write")
		}
	}
	if o.Atomic && !bytes.Equal(f.data[k], o.OldValue) {
		return false, nil
	}
	f.data[k] = bytes.Clone(v)
	f.expiry[k] = f.clock.UnixMilli() + o.ExpireInSeconds*1000
	f.writes++
	return true, nil
}
func (f *fake) KVDelete(k string) *model.AppError { delete(f.data, k); return nil }
func (f *fake) PublishWebSocketEvent(_ string, data map[string]any, target *model.WebsocketBroadcast) {
	f.events = append(f.events, event{data, *target})
}
func (f *fake) LogWarn(string, ...any) {}
func call(p *Plugin, uid, method, path, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Mattermost-User-ID", uid)
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	p.ServeHTTP(nil, w, r)
	return w
}
func mark(p *Plugin, uid string, ids ...string) *httptest.ResponseRecorder {
	body, _ := json.Marshal(map[string]any{"post_ids": ids})
	return call(p, uid, "POST", "/api/v1/receipts/batch", string(body))
}
func list(p *Plugin, uid string) *httptest.ResponseRecorder {
	return call(p, uid, "GET", "/api/v1/viewers?post_id="+postID, "")
}
func TestReceiptFlowAndPrivacy(t *testing.T) {
	p, f := fixture()
	if w := mark(p, b, postID); w.Code != 200 {
		t.Fatal(w)
	}
	d, _ := p.repo.read(postID, p.deadline(f.posts[postID]))
	first := d.Viewers[b]
	if first == 0 {
		t.Fatal("not stored")
	}
	f.clock = f.clock.Add(time.Second)
	mark(p, b, postID)
	mark(p, a, postID)
	d, _ = p.repo.read(postID, p.deadline(f.posts[postID]))
	if len(d.Viewers) != 1 || d.Viewers[b] != first || f.writes != 1 {
		t.Fatal("duplicate/self changed state")
	}
	if len(f.events) != 1 || f.events[0].target.UserId != a || f.events[0].target.ChannelId != "" {
		t.Fatal("websocket disclosure")
	}
	ev, _ := json.Marshal(f.events[0].data)
	if string(ev) != `{"post_ids":["`+postID+`"]}` || bytes.Contains(ev, []byte(b)) {
		t.Fatal("viewer leaked in event")
	}
	if w := list(p, a); w.Code != 200 || strings.Contains(w.Body.String(), "secret@example") {
		t.Fatal(w)
	}
	for _, uid := range []string{b, c, x} {
		if w := list(p, uid); w.Code != 404 {
			t.Fatalf("non-author %s: %d", uid, w.Code)
		}
	}
	mark(p, x, postID)
	if f.writes != 1 {
		t.Fatal("outsider write")
	}
	f.members[a] = false
	if list(p, a).Code != 404 {
		t.Fatal("departed author access")
	}
}
func TestAuthValidation(t *testing.T) {
	p, f := fixture()
	if mark(p, "", postID).Code != 401 {
		t.Fatal("anonymous")
	}
	f.users[b].DeleteAt = 1
	if mark(p, b, postID).Code != 401 {
		t.Fatal("inactive")
	}
	f.users[b].DeleteAt = 0
	for _, body := range []string{`{}`, `{"post_ids":["bad"]}`, `{"post_ids":["` + postID + `"],"user_id":"` + a + `"}`, `{"post_ids":["` + postID + `"]} {}`, strings.Repeat(" ", 8193) + `{}`} {
		if w := call(p, b, "POST", "/api/v1/receipts/batch", body); w.Code != 400 {
			t.Fatalf("bad body accepted: %d", w.Code)
		}
	}
	ids := make([]string, 51)
	for i := range ids {
		ids[i] = postID
	}
	if mark(p, b, ids...).Code != 400 {
		t.Fatal("oversize")
	}
	for _, q := range []string{"&offset=-1", "&offset=5001", "&limit=51", "&limit=0", "&offset=no"} {
		if call(p, a, "GET", "/api/v1/viewers?post_id="+postID+q, "").Code != 400 {
			t.Fatal(q)
		}
	}
}
func TestChannelTypesAndPermissions(t *testing.T) {
	for _, kind := range []model.ChannelType{model.ChannelTypeDirect, model.ChannelTypeGroup, model.ChannelTypePrivate, model.ChannelTypeOpen} {
		t.Run(string(kind), func(t *testing.T) {
			p, f := fixture()
			f.ch.Type = kind
			mark(p, b, postID)
			if f.writes != 1 {
				t.Fatal("type rejected")
			}
			f.allowed = false
			if list(p, a).Code != 404 {
				t.Fatal("permission bypass")
			}
		})
	}
	p, f := fixture()
	f.ch.Type = model.ChannelTypeOpen
	p.config.Store(&configuration{90, false})
	mark(p, b, postID)
	if f.writes != 0 {
		t.Fatal("public disabled")
	}
}
func TestBatchMultipleAndDeleted(t *testing.T) {
	p, f := fixture()
	second := strings.Repeat("q", 26)
	f.posts[second] = &model.Post{Id: second, UserId: a, ChannelId: channelID, CreateAt: f.clock.UnixMilli()}
	mark(p, b, postID, second, postID)
	mark(p, c, postID)
	d, _ := p.repo.read(postID, p.deadline(f.posts[postID]))
	if len(d.Viewers) != 2 || f.writes != 3 {
		t.Fatal("batch/dedup")
	}
	if len(f.events) != 2 {
		t.Fatal("batch event not grouped")
	}
	f.posts[postID].DeleteAt = 1
	if list(p, a).Code != 404 {
		t.Fatal("deleted retrieval")
	}
	mark(p, b, strings.Repeat("z", 26))
	p.MessageHasBeenDeleted(nil, f.posts[postID])
	deleted, _ := decode(f.data[key(postID)])
	if !deleted.Deleted || len(deleted.Viewers) != 0 {
		t.Fatal("delete cleanup")
	}
}
func TestRetentionAndRestart(t *testing.T) {
	p, f := fixture()
	mark(p, b, postID)
	original := f.expiry[key(postID)]
	f.clock = f.clock.Add(24 * time.Hour)
	mark(p, c, postID)
	if f.expiry[key(postID)] != original {
		t.Fatal("sliding expiry")
	}
	p.repo = repository{f, func() time.Time { return f.clock }, func(time.Duration) {}}
	if !strings.Contains(list(p, a).Body.String(), b) {
		t.Fatal("restart lost KV")
	}
	f.clock = f.clock.Add(90 * 24 * time.Hour)
	mark(p, b, postID)
	if strings.Contains(list(p, a).Body.String(), b) || f.writes != 2 {
		t.Fatal("expired resurrected")
	}
}
func TestCASConcurrentAndFailure(t *testing.T) {
	p, f := fixture()
	var wg sync.WaitGroup
	errc := make(chan error, 30)
	for i := 0; i < 30; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			_, e := p.repo.add(postID, fmt.Sprintf("%026d", n), p.deadline(f.posts[postID]))
			errc <- e
		}(i)
	}
	wg.Wait()
	close(errc)
	success := 0
	for e := range errc {
		if e == nil {
			success++
		} else if e != errContention {
			t.Fatal(e)
		}
	}
	d, _ := p.repo.read(postID, p.deadline(f.posts[postID]))
	if len(d.Viewers) != success {
		t.Fatal("lost update")
	}
	f.conflicts = 9
	if _, e := p.repo.add(postID, b, p.deadline(f.posts[postID])); e != errContention {
		t.Fatal("unbounded retries")
	}
	f.failure = true
	if w := mark(p, b, postID); !strings.Contains(w.Body.String(), "retry") {
		t.Fatal("storage failure acknowledged")
	}
}
func TestMissingProfilesAndPagination(t *testing.T) {
	p, f := fixture()
	mark(p, b, postID)
	mark(p, c, postID)
	delete(f.users, b)
	f.users[c].DeleteAt = 1
	w := list(p, a)
	if w.Code != 200 || !strings.Contains(w.Body.String(), b) || !strings.Contains(w.Body.String(), c) {
		t.Fatal(w)
	}
	w = call(p, a, "GET", "/api/v1/viewers?post_id="+postID+"&limit=1", "")
	if !strings.Contains(w.Body.String(), `"has_more":true`) {
		t.Fatal(w.Body.String())
	}
}
func TestCapacityAndReduction(t *testing.T) {
	p, f := fixture()
	d := document{ExpiresAt: p.deadline(f.posts[postID]), Viewers: map[string]int64{}}
	for i := 0; i < maxViewers; i++ {
		d.Viewers[fmt.Sprintf("%026d", i)] = f.clock.UnixMilli()
	}
	f.data[key(postID)], _ = json.Marshal(d)
	if _, e := p.repo.add(postID, b, p.deadline(f.posts[postID])); e != errCapacity {
		t.Fatal("capacity")
	}
	f.clock = f.clock.Add(2 * 24 * time.Hour)
	p.config.Store(&configuration{1, true})
	if w := list(p, a); strings.Contains(w.Body.String(), `"count":5000`) {
		t.Fatal("reduction not immediate")
	}
}

func TestViewersContainsOnlyReceiptFields(t *testing.T) {
	p, _ := fixture()
	mark(p, b, postID)
	w := list(p, a)
	if w.Code != 200 {
		t.Fatal(w)
	}
	var response struct {
		Viewers []map[string]json.RawMessage `json:"viewers"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Viewers) != 1 {
		t.Fatal(w.Body.String())
	}
	row := response.Viewers[0]
	if len(row) != 2 || string(row["user_id"]) != `"`+b+`"` || len(row["seen_at"]) == 0 {
		t.Fatal(row)
	}
}

func TestExpiredStoredReceiptIsNotSuccess(t *testing.T) {
	p, f := fixture()
	f.data[key(postID)] = []byte(fmt.Sprintf(`{"expires_at":%d,"viewers":{}}`, f.clock.UnixMilli()-1))
	w := mark(p, b, postID)
	if !strings.Contains(w.Body.String(), `"expired"`) || f.writes != 0 || len(f.events) != 0 {
		t.Fatal(w.Body.String())
	}
	if w = list(p, a); w.Code != 200 || !strings.Contains(w.Body.String(), `"state":"expired"`) {
		t.Fatal(w.Body.String())
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := p.repo.addContext(ctx, postID, b, p.deadline(f.posts[postID])); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}
func TestTransientAccessFailures(t *testing.T) {
	p, f := fixture()
	f.postError = model.NewAppError("test", "test", nil, "", 503)
	if w := mark(p, b, postID); !strings.Contains(w.Body.String(), `"retry"`) {
		t.Fatal(w.Body.String())
	}
	if w := list(p, a); w.Code != 503 {
		t.Fatal(w.Code)
	}
	f.postError = appErr()
	if w := mark(p, b, postID); !strings.Contains(w.Body.String(), `"unavailable"`) {
		t.Fatal(w.Body.String())
	}
	f.userError = model.NewAppError("test", "test", nil, "", 503)
	if w := mark(p, b, postID); w.Code != 503 {
		t.Fatal(w.Code)
	}
	if f.writes != 0 {
		t.Fatal("unexpected write")
	}
}

func TestCancellationDuringCASContention(t *testing.T) {
	p, f := fixture()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	f.conflicts = 2
	p.repo.pause = func(time.Duration) { cancel() }
	_, err := p.repo.addContext(ctx, postID, b, p.deadline(f.posts[postID]))
	if !errors.Is(err, context.Canceled) || f.writes != 0 || f.conflicts != 1 {
		t.Fatalf("err=%v writes=%d conflicts=%d", err, f.writes, f.conflicts)
	}
}
