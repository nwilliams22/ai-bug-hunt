package rates

import (
	"context"
	"log"
	"sync"
	"time"
)

// Table holds the FX quotes served to request handlers. A background
// goroutine refreshes it on the TTL; a request that finds the table stale
// refreshes it inline rather than serving an out-of-date rate.
type Table struct {
	mu      sync.RWMutex
	quotes  map[string]float64
	fetched time.Time
	ttl     time.Duration
	fetch   func(context.Context) (map[string]float64, error)
}

func New(ttl time.Duration, fetch func(context.Context) (map[string]float64, error)) *Table {
	return &Table{
		quotes: make(map[string]float64),
		ttl:    ttl,
		fetch:  fetch,
	}
}

// Start begins the background refresh loop.
func (t *Table) Start(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(t.ttl)
		for range ticker.C {
			t.refresh(ctx)
		}
	}()
}

func (t *Table) refresh(ctx context.Context) {
	fresh, err := t.fetch(ctx)
	if err != nil {
		log.Printf("rates: refresh failed: %v", err)
		return
	}

	t.mu.Lock()
	for code, rate := range fresh {
		t.quotes[code] = rate
	}
	t.fetched = time.Now()
	t.mu.Unlock()
}

// Quote returns the rate for code, refreshing the table first if it is stale.
func (t *Table) Quote(ctx context.Context, code string) (float64, bool) {
	t.mu.RLock()
	stale := time.Since(t.fetched) > t.ttl
	quotes := t.quotes
	t.mu.RUnlock()

	if stale {
		t.refresh(ctx)
		t.mu.RLock()
		quotes = t.quotes
		t.mu.RUnlock()
	}

	rate, ok := quotes[code]
	return rate, ok
}
