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

