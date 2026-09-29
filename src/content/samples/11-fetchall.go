func fetchAll(urls []string) map[string]int {
	results := make(map[string]int)
	var wg sync.WaitGroup

	for _, u := range urls {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resp, err := http.Get(u)
			if err != nil {
				return
			}
			defer resp.Body.Close()
			results[u] = resp.StatusCode
		}()
	}

	wg.Wait()
	return results
}
