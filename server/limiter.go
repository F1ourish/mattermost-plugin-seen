package main

import (
	"sync"
	"time"
)

type userBudget struct {
	tokens float64
	at     time.Time
}

// Best-effort per-process fairness, not durable receipt state or a cluster quota.
type userLimiter struct {
	mu    sync.Mutex
	users map[string]userBudget
	swept time.Time
}

func (l *userLimiter) allow(uid string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.users == nil {
		l.users = make(map[string]userBudget)
	}
	if now.Sub(l.swept) >= time.Minute {
		for id, b := range l.users {
			if now.Sub(b.at) >= 2*time.Minute {
				delete(l.users, id)
			}
		}
		l.swept = now
	}
	b, ok := l.users[uid]
	if !ok {
		if len(l.users) >= 10000 {
			return false
		}
		b = userBudget{120, now}
	}
	b.tokens = min(120, b.tokens+max(0, now.Sub(b.at).Seconds())*2)
	b.at = now
	allowed := b.tokens >= 1
	if allowed {
		b.tokens--
	}
	l.users[uid] = b
	return allowed
}
