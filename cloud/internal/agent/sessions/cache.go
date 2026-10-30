package sessions

import (
	"sort"
	"time"
)

const terminalCacheCount = 1000
const terminalCacheBytes = 100 << 20
const terminalCacheTTL = 5 * time.Minute
const receiptCacheGrace = time.Minute

// Terminal result bodies are a short-lived UI cache. Encrypted uploads and
// minimal receipts remain owned by queue; eviction never replays a Tool.
func (e *Engine) pruneRunsLocked(now time.Time) {
	type entry struct {
		id string
		r  *running
	}
	terminal := []entry{}
	for id, r := range e.runs {
		if r.state.Status == "running" {
			continue
		}
		terminal = append(terminal, entry{id, r})
	}
	sort.Slice(terminal, func(i, j int) bool {
		if terminal[i].r.completedAt.Equal(terminal[j].r.completedAt) {
			return terminal[i].id < terminal[j].id
		}
		return terminal[i].r.completedAt.Before(terminal[j].r.completedAt)
	})
	evict := func(r *running) {
		if r.state.SnapshotJSON != "" {
			r.state.SnapshotJSON = ""
			r.state.Diagnostic = "result_evicted"
		}
	}
	bodies, bytes := 0, 0
	for _, entry := range terminal {
		r := entry.r
		if !now.Before(r.completedAt.Add(terminalCacheTTL)) || !r.recordedAt.IsZero() && !now.Before(r.recordedAt.Add(receiptCacheGrace)) {
			evict(r)
		}
		if r.state.SnapshotJSON != "" {
			bodies++
			bytes += len(r.state.SnapshotJSON)
		}
	}
	for _, entry := range terminal {
		if bodies <= terminalCacheCount && bytes <= terminalCacheBytes {
			break
		}
		r := entry.r
		if r.state.SnapshotJSON != "" {
			bytes -= len(r.state.SnapshotJSON)
			bodies--
			evict(r)
		}
	}
	for _, entry := range terminal[:max(0, len(terminal)-terminalCacheCount)] {
		delete(e.runs, entry.id)
	}
}
func (e *Engine) markRecorded(user, operation string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	for _, r := range e.runs {
		if r.state.UserID == user && r.state.OperationID == operation && r.recordedAt.IsZero() {
			r.recordedAt = e.now()
		}
	}
	e.pruneRunsLocked(e.now())
}
func (e *Engine) startCacheSweep() {
	e.cacheSweep.Do(func() {
		e.workers.Add(1)
		go func() {
			defer e.workers.Done()
			tick := time.NewTicker(time.Second)
			defer tick.Stop()
			for {
				select {
				case <-e.background.Done():
					return
				case <-tick.C:
					e.mu.Lock()
					e.pruneRunsLocked(e.now())
					e.mu.Unlock()
				}
			}
		}()
	})
}
