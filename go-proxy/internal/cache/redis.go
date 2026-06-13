package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"github.com/redis/go-redis/v9"
)

type SemanticCache struct {
	client *redis.Client
	ctx    context.Context
}

func NewSemanticCache() *SemanticCache {
	client := redis.NewClient(&redis.Options{
		Addr: "localhost:6379", // Points to your local Docker container
	})

	ctx := context.Background()
	_, err := client.Ping(ctx).Result()

	if err != nil {
		log.Fatalf("[Redis] Failed to connect: %v", err)
	}
	log.Println("[Redis] Connected to Semantic Vector Store.")

	cache := &SemanticCache{client: client, ctx: ctx}
	cache.InitializeIndex()
	return cache
}

func (sc *SemanticCache) InitializeIndex() {
	schema := []interface{}{
		"FT.CREATE", "idx:prompts",
		"ON", "HASH",
		"PREFIX", "1", "prompt:",
		"SCHEMA",
		"original_text", "TEXT",
		"response_text", "TEXT",
		"embedding", "VECTOR", "FLAT", "6", 
		"TYPE", "FLOAT32", 
		"DIM", "1536", 
		"DISTANCE_METRIC", "COSINE",
	}

	err := sc.client.Do(sc.ctx, schema...).Err()
	if err != nil && err.Error() != "Index already exists" {
		log.Printf("[Redis] Warning on index creation (might exist): %v", err)
	} else if err == nil {
		log.Println("[Redis] Vector Index 'idx:prompts' created successfully.")
	}
}

func (sc *SemanticCache) CheckCache(vector []float32) (string, bool){
	vectorBytes := float32ArrayToBytes(vector)

	query := []interface{}{
		"FT.SEARCH", "idx:prompts", "*=>[KNN 1 @embedding $query_vec AS similarity]",
		"PARAMS", "2", "query_vec", vectorBytes,
		"RETURN", "2", "similarity", "response_text",
		"DIALECT", "2",
	}

	res, err := sc.client.Do(sc.ctx, query...).Slice()
	if err != nil {
		log.Printf("[Redis] Search error: %v", err)
		return "", false
	}

	if len(res) > 1 && res[0].(int64) > 0 {
		props := res[2].([]interface{})
		var similarity float64
		var cachedResponse string

		for i := 0; i < len(props); i += 2 {
			key := props[i].(string)
			if key == "similarity" {
				fmt.Sscanf(props[i+1].(string), "%f", &similarity)
			} else if key == "response_text" {
				cachedResponse = props[i+1].(string)
			}
		}

		if similarity < 0.05 {
			log.Printf("[Cache HIT] Semantic match found! Distance: %f", similarity)
			return cachedResponse, true
		}
	}

	return "", false
}

func float32ArrayToBytes(floats []float32) []byte {
	// Implementation omitted for brevity - uses encoding/binary to convert
	// the float array into a byte slice to pass into the Redis query.
	// You can use standard `binary.Write` here.
	return []byte{} 
}