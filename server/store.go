package main

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
)

const maxViewers = 5000

var errContention = errors.New("receipt contention")
var errExpired = errors.New("receipt expired")
var errDeleted = errors.New("receipt deleted")

var errCapacity = errors.New("receipt capacity")

type kvAPI interface {
	KVGet(string) ([]byte, *model.AppError)
	KVSetWithOptions(string, []byte, model.PluginKVSetOptions) (bool, *model.AppError)
}
type document struct {
	State     string           `json:"-"`
	Deleted   bool             `json:"deleted,omitempty"`
	ExpiresAt int64            `json:"expires_at"`
	Viewers   map[string]int64 `json:"viewers"`
}
type receipt struct {
	UserID string `json:"user_id"`
	SeenAt int64  `json:"seen_at"`
}
type repository struct {
	api   kvAPI
	now   func() time.Time
	pause func(time.Duration)
}

func key(id string) string { return "v1:" + id }
func decode(data []byte) (document, error) {
	d := document{Viewers: map[string]int64{}}
	if len(data) > 0 {
		if err := json.Unmarshal(data, &d); err != nil {
			return d, err
		}
	}
	if d.Viewers == nil {
		d.Viewers = map[string]int64{}
	}
	if len(d.Viewers) > maxViewers {
		return d, errCapacity
	}
	return d, nil
}
func (s repository) read(id string, deadline int64) (document, error) {
	data, e := s.api.KVGet(key(id))
	if e != nil {
		return document{}, e
	}
	d, err := decode(data)
	if err != nil {
		return d, err
	}
	now := s.now().UnixMilli()
	if d.Deleted {
		return document{}, errDeleted
	}
	if now >= deadline || (d.ExpiresAt > 0 && now >= d.ExpiresAt) {
		return document{State: "expired", Viewers: map[string]int64{}}, nil
	}
	return d, nil
}

type writeResult string

const (
	recorded        writeResult = "recorded"
	alreadyRecorded writeResult = "already_recorded"
)

func (s repository) add(id, uid string, deadline int64) (writeResult, error) {
	return s.addContext(context.Background(), id, uid, deadline)
}
func (s repository) addContext(ctx context.Context, id, uid string, deadline int64) (writeResult, error) {
	for i := 0; i < 8; i++ {
		if err := ctx.Err(); err != nil {
			return "", err
		}
		now := s.now().UnixMilli()
		if now >= deadline {
			return "", errExpired
		}
		old, e := s.api.KVGet(key(id))
		if e != nil {
			return "", e
		}
		d, err := decode(old)
		if err != nil {
			return "", err
		}
		if d.Deleted {
			return "", errDeleted
		}
		if d.ExpiresAt > 0 && now >= d.ExpiresAt {
			return "", errExpired
		}
		if _, ok := d.Viewers[uid]; ok {
			return alreadyRecorded, nil
		}
		if len(d.Viewers) >= maxViewers {
			return "", errCapacity
		}
		if d.ExpiresAt == 0 || deadline < d.ExpiresAt {
			d.ExpiresAt = deadline
		}
		d.Viewers[uid] = now
		b, err := json.Marshal(d)
		if err != nil {
			return "", err
		}
		ttl := (d.ExpiresAt - now + 999) / 1000
		if err := ctx.Err(); err != nil {
			return "", err
		}
		ok, e := s.api.KVSetWithOptions(key(id), b, model.PluginKVSetOptions{Atomic: true, OldValue: old, ExpireInSeconds: ttl})
		if e != nil {
			return "", e
		}
		if ok {
			return recorded, nil
		}
		s.pause(time.Duration(i+1) * time.Millisecond)
	}
	return "", errContention
}
func ordered(d document, author string) []receipt {
	out := make([]receipt, 0, len(d.Viewers))
	for id, at := range d.Viewers {
		if id != author {
			out = append(out, receipt{id, at})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].SeenAt == out[j].SeenAt {
			return out[i].UserID < out[j].UserID
		}
		return out[i].SeenAt < out[j].SeenAt
	})
	return out
}

// erase overwrites the same CAS key with a durable, viewer-free tombstone.
// A blind SET is deliberate: deletion wins over any earlier viewer state.
// Writers with an old snapshot fail CAS; writers reading the tombstone stop.
func (s repository) erase(id string, createdAt int64) error {
	now := s.now().UnixMilli()
	// Cover every valid retention deadline (max 365 days), with a clock margin.
	horizon := max(createdAt+366*86400000, now+86400000)
	b, err := json.Marshal(document{Deleted: true, ExpiresAt: horizon})
	if err != nil {
		return err
	}
	ok, e := s.api.KVSetWithOptions(key(id), b, model.PluginKVSetOptions{ExpireInSeconds: (horizon - now + 999) / 1000})
	if e != nil {
		return e
	}
	if !ok {
		return errContention
	}
	return nil
}
