package cache

type CacheStats struct {
	EntryCount   int     `json:"entryCount"`
	EmbeddingDim int     `json:"embeddingDim"`
	Threshold    float64 `json:"threshold"`
	Model        string  `json:"model"`
}

type CacheEntry struct {
	Key             string `json:"key"`
	Prompt          string `json:"prompt"`
	ResponsePreview string `json:"responsePreview"`
	ResponseLength  int    `json:"responseLength"`
}

func (sc *SemanticCache) Stats() CacheStats {
	stats := CacheStats{
		EmbeddingDim: sc.dim,
		Threshold:    sc.threshold,
		Model:        "gemini-embedding-001",
	}
	if sc.client == nil {
		return stats
	}

	keys, _ := sc.client.Keys(sc.ctx, "prompt:*").Result()
	stats.EntryCount = len(keys)
	return stats
}

func (sc *SemanticCache) ListEntries(limit int) []CacheEntry {
	if sc.client == nil || limit <= 0 {
		return []CacheEntry{}
	}

	keys, err := sc.client.Keys(sc.ctx, "prompt:*").Result()
	if err != nil || len(keys) == 0 {
		return []CacheEntry{}
	}

	if len(keys) > limit {
		keys = keys[:limit]
	}

	entries := make([]CacheEntry, 0, len(keys))
	for _, key := range keys {
		vals, err := sc.client.HMGet(sc.ctx, key, "original_text", "response_text").Result()
		if err != nil || len(vals) < 2 {
			continue
		}

		prompt, _ := vals[0].(string)
		response, _ := vals[1].(string)
		if prompt == "" {
			continue
		}

		preview := response
		if len(preview) > 120 {
			preview = preview[:120] + "…"
		}

		entries = append(entries, CacheEntry{
			Key:             key,
			Prompt:          prompt,
			ResponsePreview: preview,
			ResponseLength:  len(response),
		})
	}
	return entries
}

func (sc *SemanticCache) ClearAll() int {
	if sc.client == nil {
		return 0
	}
	keys, _ := sc.client.Keys(sc.ctx, "prompt:*").Result()
	if len(keys) == 0 {
		return 0
	}
	sc.client.Del(sc.ctx, keys...)
	return len(keys)
}
