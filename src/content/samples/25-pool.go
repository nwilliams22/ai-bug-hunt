package ingest

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type Result struct {
	ID  string
	Err error
}

// Process runs fn over every id with at most `workers` in flight,
// and returns the results once all of them are done.
func Process(ctx context.Context, ids []string, workers int, fn func(string) error) []Result {
	jobs := make(chan string)
	results := make(chan Result)
	var wg sync.WaitGroup
	seen := 0

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go worker(ctx, wg, jobs, results, fn)
	}

	go func() {
		for _, id := range ids {
			jobs <- id
		}
		close(jobs)
	}()

	out := make([]Result, 0, len(ids))
	for r := range results {
		out = append(out, r)
		seen++
	}

	wg.Wait()
	fmt.Printf("processed %d of %d\n", seen, len(ids))
	return out
}

func worker(
	ctx context.Context,
	wg sync.WaitGroup,
	jobs <-chan string,
	results chan<- Result,
	fn func(string) error,
) {
	defer wg.Done()
	for id := range jobs {
		done := make(chan error, 1)
		go func() { done <- fn(id) }()

		select {
		case err := <-done:
			results <- Result{ID: id, Err: err}
		case <-time.After(5 * time.Second):
			results <- Result{ID: id, Err: fmt.Errorf("timeout on %s", id)}
		}
	}
}
