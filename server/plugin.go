package main

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

const maxBatch = 50

var validID = regexp.MustCompile(`^[a-z0-9]{26}$`)

type configuration struct {
	RetentionDays int
	EnablePublic  bool
}
type Plugin struct {
	plugin.MattermostPlugin
	config  atomic.Pointer[configuration]
	repo    repository
	slots   chan struct{}
	limiter userLimiter
}

func (p *Plugin) OnConfigurationChange() error {
	c := configuration{RetentionDays: 90, EnablePublic: true}
	if e := p.API.LoadPluginConfiguration(&c); e != nil {
		return e
	}
	if c.RetentionDays < 1 || c.RetentionDays > 365 {
		return errors.New("RetentionDays must be 1..365")
	}
	p.config.Store(&c)
	return nil
}
func (p *Plugin) OnActivate() error {
	if e := p.OnConfigurationChange(); e != nil {
		return e
	}
	p.repo = repository{p.API, time.Now, time.Sleep}
	p.slots = make(chan struct{}, 16)
	p.API.LogInfo("Seen plugin activated", "schema", "v1")
	return nil
}
func (p *Plugin) deadline(post *model.Post) int64 {
	return post.CreateAt + int64(p.config.Load().RetentionDays)*86400000
}

// Membership is required even for public channels; read-channel permission is
// additionally checked, avoiding role/guest/admin bypasses of membership.
type accessResult string

const (
	accessAllowed  accessResult = "allowed"
	accessDenied   accessResult = "denied"
	accessRetry    accessResult = "retry"
	accessDisabled accessResult = "disabled"
)

func apiAccessError(e *model.AppError) accessResult {
	if e != nil && (e.StatusCode == 401 || e.StatusCode == 403 || e.StatusCode == 404) {
		return accessDenied
	}
	return accessRetry
}
func (p *Plugin) accessible(uid, id string, own bool) (*model.Post, accessResult) {
	post, e := p.API.GetPost(id)
	if e != nil {
		return nil, apiAccessError(e)
	}
	if post == nil || post.DeleteAt != 0 || strings.HasPrefix(post.Type, "system_") || post.UserId == "" {
		return nil, accessDenied
	}
	if own && post.UserId != uid {
		return nil, accessDenied
	}
	if _, e = p.API.GetChannelMember(post.ChannelId, uid); e != nil {
		return nil, apiAccessError(e)
	}
	if !p.API.HasPermissionToChannel(uid, post.ChannelId, model.PermissionReadChannel) {
		return nil, accessDenied
	}
	ch, e := p.API.GetChannel(post.ChannelId)
	if e != nil {
		return nil, apiAccessError(e)
	}
	if ch == nil || ch.DeleteAt != 0 {
		return nil, accessDenied
	}
	if ch.Type == model.ChannelTypeOpen && !p.config.Load().EnablePublic {
		return post, accessDisabled
	}
	return post, accessAllowed
}
func jsonResponse(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int) {
	jsonResponse(w, status, map[string]string{"error": http.StatusText(status)})
}
func batch(w http.ResponseWriter, r *http.Request) ([]string, error) {
	if strings.Split(r.Header.Get("Content-Type"), ";")[0] != "application/json" {
		return nil, errors.New("json required")
	}
	var b struct {
		PostIDs []string `json:"post_ids"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if e := d.Decode(&b); e != nil {
		return nil, e
	}
	if e := d.Decode(new(any)); e != io.EOF {
		return nil, errors.New("trailing data")
	}
	if len(b.PostIDs) == 0 || len(b.PostIDs) > maxBatch {
		return nil, errors.New("batch limit")
	}
	out := []string{}
	seen := map[string]bool{}
	for _, id := range b.PostIDs {
		if !validID.MatchString(id) {
			return nil, errors.New("invalid ID")
		}
		if !seen[id] {
			out = append(out, id)
			seen[id] = true
		}
	}
	return out, nil
}
func (p *Plugin) ServeHTTP(_ *plugin.Context, w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	uid := r.Header.Get("Mattermost-User-ID")
	if !validID.MatchString(uid) {
		fail(w, 401)
		return
	}
	if !p.limiter.allow(uid, time.Now()) {
		w.Header().Set("Retry-After", "1")
		fail(w, 429)
		return
	}
	select {
	case p.slots <- struct{}{}:
		defer func() { <-p.slots }()
	default:
		w.Header().Set("Retry-After", "2")
		fail(w, 429)
		return
	}
	u, e := p.API.GetUser(uid)
	if e != nil && apiAccessError(e) == accessRetry {
		fail(w, 503)
		return
	}
	if e != nil || u == nil || u.DeleteAt != 0 || u.IsBot {
		fail(w, 401)
		return
	}
	switch r.URL.Path {
	case "/api/v1/receipts/batch", "/api/v1/summaries":
		if r.Method != http.MethodPost {
			fail(w, 405)
			return
		}
		ids, err := batch(w, r)
		if err != nil {
			fail(w, 400)
			return
		}
		if r.URL.Path == "/api/v1/receipts/batch" {
			p.mark(w, r, uid, ids)
		} else {
			p.summaries(w, uid, ids)
		}
	case "/api/v1/viewers":
		if r.Method != http.MethodGet {
			fail(w, 405)
			return
		}
		p.viewers(w, r, uid)
	default:
		fail(w, 404)
	}
}
func (p *Plugin) mark(w http.ResponseWriter, r *http.Request, uid string, ids []string) {
	statuses := map[string]string{}
	events := map[string][]string{}
	for _, id := range ids {
		if r.Context().Err() != nil {
			return
		}
		post, access := p.accessible(uid, id, false)
		if access == accessRetry {
			statuses[id] = "retry"
			continue
		}
		if access != accessAllowed {
			statuses[id] = "unavailable"
			continue
		}
		if post.UserId == uid {
			statuses[id] = "self"
			continue
		}
		if p.repo.now().UnixMilli() >= p.deadline(post) {
			statuses[id] = "expired"
			continue
		}
		result, e := p.repo.addContext(r.Context(), id, uid, p.deadline(post))
		if e != nil {
			if errors.Is(e, errDeleted) {
				statuses[id] = "unavailable"
			} else if errors.Is(e, errExpired) {
				statuses[id] = "expired"
			} else if errors.Is(e, errCapacity) {
				statuses[id] = "capacity"
			} else {
				statuses[id] = "retry"
				p.API.LogWarn("Seen receipt write failed", "operation", "kv_cas", "category", writeCategory(e))
			}
			continue
		}
		statuses[id] = "ok"
		if result == recorded {
			events[post.UserId] = append(events[post.UserId], id)
		}
	}
	for author, changed := range events {
		allowed := []string{}
		for _, id := range changed {
			if _, access := p.accessible(author, id, true); access == accessAllowed {
				allowed = append(allowed, id)
			}
		}
		if len(allowed) > 0 {
			p.API.PublishWebSocketEvent("changed", map[string]any{"post_ids": allowed}, &model.WebsocketBroadcast{UserId: author})
		}
	}
	jsonResponse(w, 200, map[string]any{"results": statuses})
}

func writeCategory(err error) string {
	if errors.Is(err, errContention) {
		return "contention"
	}
	return "kv_failure"
}

type summary struct {
	State     string `json:"state"`
	Count     int    `json:"count"`
	Saturated bool   `json:"saturated"`
}

func (p *Plugin) summaries(w http.ResponseWriter, uid string, ids []string) {
	out := map[string]summary{}
	for _, id := range ids {
		post, access := p.accessible(uid, id, true)
		if access == accessRetry {
			fail(w, 503)
			return
		}
		if access == accessDisabled {
			out[id] = summary{State: "disabled"}
			continue
		}
		if access != accessAllowed {
			continue
		}
		d, e := p.repo.read(id, p.deadline(post))
		if errors.Is(e, errDeleted) {
			continue
		}
		if e != nil {
			p.API.LogWarn("Seen summary read failed", "operation", "kv_get")
			fail(w, 503)
			return
		}
		n := len(d.Viewers)
		if _, exists := d.Viewers[uid]; exists {
			n--
		}
		state := "tracked"
		if d.State == "expired" {
			state = "expired"
		}
		out[id] = summary{State: state, Count: n, Saturated: n >= maxViewers}
	}
	jsonResponse(w, 200, map[string]any{"summaries": out})
}

func (p *Plugin) viewers(w http.ResponseWriter, r *http.Request, uid string) {
	q := r.URL.Query()
	id := q.Get("post_id")
	offset, limit := 0, 50
	var e error
	if q.Has("offset") {
		offset, e = strconv.Atoi(q.Get("offset"))
		if e != nil {
			fail(w, 400)
			return
		}
	}
	if q.Has("limit") {
		limit, e = strconv.Atoi(q.Get("limit"))
		if e != nil {
			fail(w, 400)
			return
		}
	}
	if !validID.MatchString(id) || offset < 0 || offset > maxViewers || limit < 1 || limit > 50 {
		fail(w, 400)
		return
	}
	post, access := p.accessible(uid, id, true)
	if access == accessRetry {
		fail(w, 503)
		return
	}
	if access == accessDisabled {
		jsonResponse(w, 200, map[string]any{"state": "disabled", "viewers": []receipt{}, "count": 0, "next_offset": 0, "has_more": false, "saturated": false})
		return
	}
	if access != accessAllowed {
		fail(w, 404)
		return
	}
	d, err := p.repo.read(id, p.deadline(post))
	if errors.Is(err, errDeleted) {
		fail(w, 404)
		return
	}
	if err != nil {
		fail(w, 503)
		return
	}
	all := ordered(d, uid)
	offset = min(offset, len(all))
	end := min(offset+limit, len(all))
	out := append([]receipt{}, all[offset:end]...)
	state := "tracked"
	if d.State == "expired" {
		state = "expired"
	}
	versionData, _ := json.Marshal(d)
	version := fmt.Sprintf("%x", sha256.Sum256(versionData))
	jsonResponse(w, 200, map[string]any{"version": version, "state": state, "viewers": out, "count": len(all), "next_offset": end, "has_more": end < len(all), "saturated": len(all) >= maxViewers})
}
func (p *Plugin) MessageHasBeenDeleted(_ *plugin.Context, post *model.Post) {
	if post != nil {
		if e := p.repo.erase(post.Id, post.CreateAt); e != nil {
			p.API.LogWarn("Seen deletion cleanup failed", "operation", "kv_tombstone")
		}
	}
}
