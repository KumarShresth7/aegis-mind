package cache

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"log"
	"os"
	"strconv"

	"github.com/redis/go-redis/v9"
)

type SemanticCache struct {
	client    *redis.Client
	ctx       context.Context
	threshold float64
	dim       int
}

func NewSemanticCache() *SemanticCache {
	ctx := context.Background()
	addr := os.Getenv("REDIS_ADDR")
	if addr == "" {
		addr = "localhost:6379"
	}

	client := redis.NewClient(&redis.Options{Addr: addr})

	if _, err := client.Ping(ctx).Result(); err != nil {
		log.Printf("[Redis] Unavailable, semantic cache disabled: %v", err)
		return &SemanticCache{ctx: ctx, threshold: SimilarityThreshold(), dim: EmbeddingDim()}
	}

	log.Println("[Redis] Connected to Semantic Vector Store.")
	cache := &SemanticCache{
		client:    client,
		ctx:       ctx,
		threshold: SimilarityThreshold(),
		dim:       EmbeddingDim(),
	}
	cache.InitializeIndex()
	return cache
}

func (sc *SemanticCache) Client() *redis.Client {
	if sc == nil {
		return nil
	}
	return sc.client
}

func (sc *SemanticCache) InitializeIndex() {
	if sc.client == nil {
		return
	}

	if os.Getenv("RECREATE_CACHE_INDEX") == "true" {
		if err := sc.client.Do(sc.ctx, "FT.DROPINDEX", "idx:prompts", "DD").Err(); err != nil {
			log.Printf("[Redis] Index drop skipped (may not exist): %v", err)
		} else {
			log.Println("[Redis] Dropped legacy index for recreation.")
		}
	}

	schema := []interface{}{
		"FT.CREATE", "idx:prompts",
		"ON", "HASH",
		"PREFIX", "1", "prompt:",
		"SCHEMA",
		"original_text", "TEXT",
		"response_text", "TEXT",
		"embedding", "VECTOR", "FLAT", "6",
		"TYPE", "FLOAT32",
		"DIM", sc.dim,
		"DISTANCE_METRIC", "COSINE",
	}

	err := sc.client.Do(sc.ctx, schema...).Err()
	if err != nil && err.Error() != "Index already exists" {
		log.Printf("[Redis] Warning on index creation: %v", err)
	} else if err == nil {
		log.Printf("[Redis] Vector index 'idx:prompts' created (dim=%d, threshold=%.2f)", sc.dim, sc.threshold)
	}
}

func (sc *SemanticCache) CheckCache(vector []float32) (response string, distance float64, matchedPrompt string, hit bool) {
	if sc.client == nil || len(vector) == 0 {
		return "", 0, "", false
	}

	vectorBytes := float32ArrayToBytes(vector)

	query := []interface{}{
		"FT.SEARCH", "idx:prompts", "*=>[KNN 1 @embedding $query_vec AS similarity]",
		"PARAMS", "2", "query_vec", vectorBytes,
		"RETURN", "3", "similarity", "response_text", "original_text",
		"DIALECT", "2",
	}

	raw, err := sc.client.Do(sc.ctx, query...).Result()
	if err != nil {
		log.Printf("[Redis] Search error: %v", err)
		return "", 0, "", false
	}

	distance, cachedResponse, originalText, found := parseFTSearchResult(raw)
	if !found {
		return "", 0, "", false
	}

	if distance <= sc.threshold {
		log.Printf("[Cache HIT] Semantic match (distance=%.4f) matched: %q", distance, truncate(originalText, 60))
		return cachedResponse, distance, originalText, true
	}

	log.Printf("[Cache NEAR-MISS] Closest distance=%.4f (threshold=%.2f) text=%q", distance, sc.threshold, truncate(originalText, 60))
	return "", distance, originalText, false
}

func parseFTSearchResult(raw interface{}) (distance float64, responseText, originalText string, ok bool) {
	switch v := raw.(type) {
	case map[interface{}]interface{}:
		return parseMapSearchResult(v)
	case []interface{}:
		return parseSliceSearchResult(v)
	default:
		log.Printf("[Redis] Unexpected FT.SEARCH result type: %T", raw)
		return 0, "", "", false
	}
}

func parseMapSearchResult(m map[interface{}]interface{}) (float64, string, string, bool) {
	total := toInt64(m["total_results"])
	if total == 0 {
		return 0, "", "", false
	}

	results, ok := m["results"].([]interface{})
	if !ok || len(results) == 0 {
		return 0, "", "", false
	}

	first, ok := results[0].(map[interface{}]interface{})
	if !ok {
		return 0, "", "", false
	}

	attrs, ok := first["extra_attributes"].(map[interface{}]interface{})
	if !ok {
		// Fallback: RESP2-style fields in values array
		if values, ok := first["values"].([]interface{}); ok {
			return parseFieldPairs(values)
		}
		return 0, "", "", false
	}

	distance := toFloat64(attrs["similarity"])
	responseText := toString(attrs["response_text"])
	originalText := toString(attrs["original_text"])
	return distance, responseText, originalText, true
}

func parseSliceSearchResult(res []interface{}) (float64, string, string, bool) {
	if len(res) < 3 {
		return 0, "", "", false
	}
	if toInt64(res[0]) == 0 {
		return 0, "", "", false
	}
	return parseFieldPairs(res[2])
}

func parseFieldPairs(fields interface{}) (float64, string, string, bool) {
	pairs, ok := fields.([]interface{})
	if !ok || len(pairs) < 2 {
		return 0, "", "", false
	}

	var distance float64
	var responseText string
	var originalText string

	for i := 0; i+1 < len(pairs); i += 2 {
		key := toString(pairs[i])
		val := toString(pairs[i+1])
		switch key {
		case "similarity":
			distance = toFloat64(val)
		case "response_text":
			responseText = val
		case "original_text":
			originalText = val
		}
	}

	return distance, responseText, originalText, responseText != ""
}

func toString(v interface{}) string {
	switch x := v.(type) {
	case string:
		return x
	case []byte:
		return string(x)
	default:
		if v == nil {
			return ""
		}
		return fmt.Sprint(v)
	}
}

func toInt64(v interface{}) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case int:
		return int64(x)
	case string:
		n, _ := strconv.ParseInt(x, 10, 64)
		return n
	default:
		return 0
	}
}

func toFloat64(v interface{}) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case float32:
		return float64(x)
	case string:
		f, _ := strconv.ParseFloat(x, 64)
		return f
	default:
		return 0
	}
}

func (sc *SemanticCache) Store(originalText, responseText string, vector []float32) {
	if sc.client == nil || originalText == "" || responseText == "" || len(vector) == 0 {
		return
	}

	key := promptKey(originalText)
	vectorBytes := float32ArrayToBytes(vector)

	if err := sc.client.HSet(sc.ctx, key,
		"original_text", originalText,
		"response_text", responseText,
		"embedding", vectorBytes,
	).Err(); err != nil {
		log.Printf("[Redis] Store error: %v", err)
		return
	}

	log.Printf("[Cache STORE] Saved response for %q", truncate(originalText, 60))
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

func float32ArrayToBytes(floats []float32) []byte {
	buf := new(bytes.Buffer)
	err := binary.Write(buf, binary.LittleEndian, floats)
	if err != nil {
		log.Printf("[Cache Error] Failed converting vector to bytes: %v", err)
	}
	return buf.Bytes()
}
