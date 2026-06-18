package cache

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"strconv"
	"strings"
)

const DefaultEmbeddingDim = 768

func EmbeddingDim() int {
	if v := os.Getenv("EMBEDDING_DIM"); v != "" {
		if dim, err := strconv.Atoi(v); err == nil && dim > 0 {
			return dim
		}
	}
	return DefaultEmbeddingDim
}

func SimilarityThreshold() float64 {
	// RediSearch cosine distance — lower is more similar.
	if v := os.Getenv("CACHE_DISTANCE_THRESHOLD"); v != "" {
		if threshold, err := strconv.ParseFloat(v, 64); err == nil {
			return threshold
		}
	}
	return 0.15
}

func promptKey(text string) string {
	hash := sha256.Sum256([]byte(strings.TrimSpace(strings.ToLower(text))))
	return "prompt:" + hex.EncodeToString(hash[:16])
}
