package main

import (
	"log"
	"net/http"
	"os"

	"aegismind-proxy/internal/api"
	"aegismind-proxy/internal/cache"
	"aegismind-proxy/internal/embeddings"
	"aegismind-proxy/internal/proxy"
	"aegismind-proxy/internal/telemetry"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	semanticCache := cache.NewSemanticCache()
	telStore := telemetry.NewStore(semanticCache.Client())

	workerURL := os.Getenv("WORKER_URL")
	if workerURL == "" {
		workerURL = "http://localhost:8000/v1/chat/completions"
	}

	proxyHandler := proxy.NewProxyHandler(
		semanticCache,
		workerURL,
		telStore,
		embeddings.NewClient(workerURL),
	)

	http.Handle("/v1/chat/completions", proxyHandler)
	http.Handle("/v1/metrics", &api.MetricsHandler{Telemetry: telStore})
	http.Handle("/v1/events", &api.EventsHandler{Telemetry: telStore})
	http.Handle("/v1/timeline", &api.TimelineHandler{Telemetry: telStore})
	http.Handle("/v1/cache/stats", &api.CacheStatsHandler{Cache: semanticCache})
	http.Handle("/v1/cache/entries", &api.CacheEntriesHandler{Cache: semanticCache})
	http.Handle("/v1/cache", &api.CacheClearHandler{Cache: semanticCache})
	http.Handle("/health", &api.HealthHandler{RedisOK: semanticCache.Client() != nil})

	log.Printf("AegisMind Data Plane running on http://localhost:%s\n", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Server startup failure: %v", err)
	}
}
