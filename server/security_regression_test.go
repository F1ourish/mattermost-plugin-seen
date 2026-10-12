package main

import (
	"encoding/json"
	"errors"
	"github.com/mattermost/mattermost/server/public/model"
	"strings"
	"sync"
	"testing"
	"time"
)

type hookKV struct {
	*fake
	before func()
}

func (h *hookKV) KVSetWithOptions(k string, v []byte, o model.PluginKVSetOptions) (bool, *model.AppError) {
	if o.Atomic && h.before != nil {
		f := h.before
		h.before = nil
		f()
	}
	return h.fake.KVSetWithOptions(k, v, o)
}
func TestDeletionWinsBeforeCAS(t *testing.T) {
	for _, existing := range []bool{false, true} {
		p, f := fixture()
		if existing {
			mark(p, c, postID)
		}
		h := &hookKV{fake: f}
		h.before = func() { f.posts[postID].DeleteAt = 1; p.MessageHasBeenDeleted(nil, f.posts[postID]) }
		p.repo.api = h
		w := mark(p, b, postID)
		if !strings.Contains(w.Body.String(), "unavailable") {
			t.Fatal(w.Body.String())
		}
		d, e := decode(f.data[key(postID)])
		if e != nil || !d.Deleted || len(d.Viewers) != 0 {
			t.Fatal("resurrected")
		}
		if list(p, a).Code != 404 {
			t.Fatal("deleted access")
		}
		if _, e = p.repo.add(postID, b, p.deadline(f.posts[postID])); !errors.Is(e, errDeleted) {
			t.Fatal(e)
		}
	}
}
func TestDeletionConcurrentRepositories(t *testing.T) {
	p, f := fixture()
	r2 := p.repo
	deadline := p.deadline(f.posts[postID])
	created := f.posts[postID].CreateAt
	var wg sync.WaitGroup
	for i := 0; i < 40; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, _ = r2.add(postID, b, deadline) }()
	}
	if e := p.repo.erase(postID, created); e != nil {
		t.Fatal(e)
	}
	wg.Wait()
	d, e := decode(f.data[key(postID)])
	if e != nil || !d.Deleted || len(d.Viewers) != 0 {
		t.Fatal("resurrected")
	}
	f.clock = f.clock.Add(100 * 24 * time.Hour)
	if _, e = r2.add(postID, b, created+365*86400000); !errors.Is(e, errDeleted) {
		t.Fatal(e)
	}
	if d.ExpiresAt < created+365*86400000 {
		t.Fatal("short tombstone")
	}
}
func TestTombstoneFailureAndDuplicateTimestamp(t *testing.T) {
	p, f := fixture()
	mark(p, b, postID)
	old := append([]byte{}, f.data[key(postID)]...)
	f.clock = f.clock.Add(time.Second)
	mark(p, b, postID)
	if string(old) != string(f.data[key(postID)]) {
		t.Fatal("timestamp changed")
	}
	f.failure = true
	if p.repo.erase(postID, f.posts[postID].CreateAt) == nil {
		t.Fatal("failure hidden")
	}
}
func TestRateLimitIsolationAndRefill(t *testing.T) {
	var l userLimiter
	now := time.Now()
	for i := 0; i < 120; i++ {
		if !l.allow(b, now) {
			t.Fatal(i)
		}
	}
	if l.allow(b, now) || !l.allow(c, now) || !l.allow(b, now.Add(time.Second)) {
		t.Fatal("budget")
	}
	for i := 0; i < 10001; i++ {
		l.allow(string(rune(i)), now)
	}
	if len(l.users) > 10000 {
		t.Fatal("unbounded memory")
	}
	if !l.allow("new", now.Add(3*time.Minute)) {
		t.Fatal("expiry")
	}
}
func TestViewersVersionChangesOnlyOnMutation(t *testing.T) {
	p, _ := fixture()
	version := func() string {
		var d map[string]any
		if e := json.Unmarshal(list(p, a).Body.Bytes(), &d); e != nil {
			t.Fatal(e)
		}
		return d["version"].(string)
	}
	empty := version()
	mark(p, b, postID)
	one := version()
	mark(p, b, postID)
	if one == empty || version() != one {
		t.Fatal("unstable version")
	}
	mark(p, c, postID)
	if version() == one {
		t.Fatal("missing change")
	}
}

type configurationFake struct {
	*fake
	raw string
}

func (f *configurationFake) LoadPluginConfiguration(dest any) error {
	return json.Unmarshal([]byte(f.raw), dest)
}
func TestConfigurationReloadAndValidation(t *testing.T) {
	p, f := fixture()
	config := &configurationFake{fake: f, raw: `{}`}
	p.API = config
	if e := p.OnConfigurationChange(); e != nil {
		t.Fatal(e)
	}
	if p.config.Load().RetentionDays != 90 || !p.config.Load().EnablePublic {
		t.Fatal("defaults")
	}
	for _, raw := range []string{`{"RetentionDays":1,"EnablePublic":false}`, `{"RetentionDays":365,"EnablePublic":true}`, `{"RetentionDays":30,"EnablePublic":false}`} {
		config.raw = raw
		if e := p.OnConfigurationChange(); e != nil {
			t.Fatal(e)
		}
		var want configuration
		_ = json.Unmarshal([]byte(raw), &want)
		if *p.config.Load() != want {
			t.Fatal("reload mismatch")
		}
	}
	previous := *p.config.Load()
	for _, raw := range []string{`{"RetentionDays":0}`, `{"RetentionDays":366}`, `{"RetentionDays":-1}`, `{"RetentionDays":1.5}`, `{"RetentionDays":"abc"}`} {
		config.raw = raw
		if e := p.OnConfigurationChange(); e == nil {
			t.Fatal("invalid accepted")
		}
		if *p.config.Load() != previous {
			t.Fatal("invalid value replaced active configuration")
		}
	}
}
