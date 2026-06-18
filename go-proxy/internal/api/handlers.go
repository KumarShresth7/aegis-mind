package api

import (
	"encoding/json"
	"net/http"

	"aegismind-proxy/internal/cache"
	"aegismind-proxy/internal/telemetry"
)

type CacheStatsHandler struct {
	Cache *cache.SemanticCache
}

func (h *CacheStatsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(h.Cache.Stats())
}

type CacheEntriesHandler struct {
	Cache *cache.SemanticCache
}

func (h *CacheEntriesHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(h.Cache.ListEntries(50))
}

type CacheClearHandler struct {
	Cache *cache.SemanticCache
}

func (h *CacheClearHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	removed := h.Cache.ClearAll()
	json.NewEncoder(w).Encode(map[string]int{"removed": removed})
}

type MetricsHandler struct {
	Telemetry *telemetry.Store
}

func (h *MetricsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	metrics := h.Telemetry.GetMetrics()
	json.NewEncoder(w).Encode(metrics)
}

type EventsHandler struct {
	Telemetry *telemetry.Store
}

func (h *EventsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	events := h.Telemetry.GetEvents(50)
	json.NewEncoder(w).Encode(events)
}

type TimelineHandler struct {
	Telemetry *telemetry.Store
}

func (h *TimelineHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	timeline := h.Telemetry.GetTimeline(30)
	json.NewEncoder(w).Encode(timeline)
}

type HealthHandler struct {
	RedisOK bool
}

func (h *HealthHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	status := "healthy"
	code := http.StatusOK
	if !h.RedisOK {
		status = "degraded"
	}

	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  status,
		"service": "aegismind-proxy",
		"redis":   h.RedisOK,
	})
}
