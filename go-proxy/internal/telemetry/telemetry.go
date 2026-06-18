package telemetry

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	countersKey  = "telemetry:counters"
	eventsKey    = "telemetry:events"
	maxEvents    = 100
	costPerToken = 0.000002 // ~$2 per 1M tokens
	avgTokensHit = 1500
)

type Event struct {
	Type      string            `json:"type"`
	Message   string            `json:"message"`
	Detail    string            `json:"detail,omitempty"`
	Timestamp string            `json:"timestamp"`
	Metadata  map[string]string `json:"metadata,omitempty"`
}

type Metrics struct {
	TotalRequests   int64   `json:"totalRequests"`
	CacheHits       int64   `json:"cacheHits"`
	CacheMisses     int64   `json:"cacheMisses"`
	PIIBlocked      int64   `json:"piiBlocked"`
	AvgLatencyMs    float64 `json:"avgLatencyMs"`
	TokensSaved     int64   `json:"tokensSaved"`
	EstimatedCost   float64 `json:"estimatedCostSaved"`
	CacheHitRate    float64 `json:"cacheHitRate"`
	ActiveTenants   int     `json:"activeTenants"`
}

type TimelinePoint struct {
	Time          string `json:"time"`
	TotalRequests int64  `json:"totalRequests"`
	CacheHits     int64  `json:"cacheHits"`
}

type Store struct {
	client *redis.Client
	ctx    context.Context
}

func NewStore(client *redis.Client) *Store {
	return &Store{client: client, ctx: context.Background()}
}

func (s *Store) enabled() bool {
	return s != nil && s.client != nil
}

func (s *Store) RecordRequest(cacheHit bool, latencyMs int64) {
	if !s.enabled() {
		return
	}

	pipe := s.client.Pipeline()
	pipe.HIncrBy(s.ctx, countersKey, "total_requests", 1)
	if cacheHit {
		pipe.HIncrBy(s.ctx, countersKey, "cache_hits", 1)
		pipe.HIncrBy(s.ctx, countersKey, "tokens_saved", avgTokensHit)
	} else {
		pipe.HIncrBy(s.ctx, countersKey, "cache_misses", 1)
	}

	bucket := time.Now().UTC().Format("200601021504")
	pipe.HIncrBy(s.ctx, fmt.Sprintf("telemetry:bucket:%s", bucket), "total", 1)
	if cacheHit {
		pipe.HIncrBy(s.ctx, fmt.Sprintf("telemetry:bucket:%s", bucket), "hits", 1)
	}
	pipe.Expire(s.ctx, fmt.Sprintf("telemetry:bucket:%s", bucket), 2*time.Hour)

	latKey := "telemetry:latency"
	pipe.HIncrBy(s.ctx, latKey, "count", 1)
	pipe.HIncrBy(s.ctx, latKey, "sum", latencyMs)
	pipe.Expire(s.ctx, latKey, 24*time.Hour)

	if _, err := pipe.Exec(s.ctx); err != nil {
		log.Printf("[Telemetry] RecordRequest error: %v", err)
	}

	if cacheHit {
		s.pushEvent(Event{
			Type:      "cache_hit",
			Message:   fmt.Sprintf("Cache Hit: Semantic Match (%.0fms)", float64(latencyMs)),
			Detail:    "Latency: " + fmt.Sprintf("%dms", latencyMs),
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
	}
}

func (s *Store) RecordCacheHit(latencyMs int64, distance float64, matchedPrompt string) {
	if !s.enabled() {
		return
	}

	pipe := s.client.Pipeline()
	pipe.HIncrBy(s.ctx, countersKey, "total_requests", 1)
	pipe.HIncrBy(s.ctx, countersKey, "cache_hits", 1)
	pipe.HIncrBy(s.ctx, countersKey, "tokens_saved", avgTokensHit)

	bucket := time.Now().UTC().Format("200601021504")
	pipe.HIncrBy(s.ctx, fmt.Sprintf("telemetry:bucket:%s", bucket), "total", 1)
	pipe.HIncrBy(s.ctx, fmt.Sprintf("telemetry:bucket:%s", bucket), "hits", 1)
	pipe.Expire(s.ctx, fmt.Sprintf("telemetry:bucket:%s", bucket), 2*time.Hour)

	latKey := "telemetry:latency"
	pipe.HIncrBy(s.ctx, latKey, "count", 1)
	pipe.HIncrBy(s.ctx, latKey, "sum", latencyMs)
	pipe.Expire(s.ctx, latKey, 24*time.Hour)
	pipe.Exec(s.ctx)

	preview := matchedPrompt
	if len(preview) > 60 {
		preview = preview[:60] + "…"
	}

	s.pushEvent(Event{
		Type:    "cache_hit",
		Message: fmt.Sprintf("Cache HIT · distance %.4f", distance),
		Detail:  fmt.Sprintf("Matched: %q · %dms", preview, latencyMs),
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Metadata: map[string]string{
			"distance": fmt.Sprintf("%.4f", distance),
			"latency":  fmt.Sprintf("%d", latencyMs),
		},
	})
}

func (s *Store) RecordPIIBlock(entityType, redactedPreview string) {
	if !s.enabled() {
		return
	}

	if err := s.client.HIncrBy(s.ctx, countersKey, "pii_blocked", 1).Err(); err != nil {
		log.Printf("[Telemetry] RecordPIIBlock error: %v", err)
	}

	s.pushEvent(Event{
		Type:      "pii_blocked",
		Message:   redactedPreview,
		Detail:    "Entity: " + entityType,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Metadata:  map[string]string{"entity": entityType},
	})
}

func (s *Store) pushEvent(event Event) {
	if !s.enabled() {
		return
	}

	data, err := json.Marshal(event)
	if err != nil {
		return
	}

	pipe := s.client.Pipeline()
	pipe.LPush(s.ctx, eventsKey, string(data))
	pipe.LTrim(s.ctx, eventsKey, 0, maxEvents-1)
	if _, err := pipe.Exec(s.ctx); err != nil {
		log.Printf("[Telemetry] pushEvent error: %v", err)
	}
}

func (s *Store) GetMetrics() Metrics {
	m := Metrics{ActiveTenants: 1}

	if !s.enabled() {
		return m
	}

	counters, err := s.client.HGetAll(s.ctx, countersKey).Result()
	if err != nil {
		return m
	}

	m.TotalRequests = parseInt64(counters["total_requests"])
	m.CacheHits = parseInt64(counters["cache_hits"])
	m.CacheMisses = parseInt64(counters["cache_misses"])
	m.PIIBlocked = parseInt64(counters["pii_blocked"])
	m.TokensSaved = parseInt64(counters["tokens_saved"])

	if m.TotalRequests > 0 {
		m.CacheHitRate = float64(m.CacheHits) / float64(m.TotalRequests) * 100
	}
	m.EstimatedCost = float64(m.TokensSaved) * costPerToken

	lat, _ := s.client.HGetAll(s.ctx, "telemetry:latency").Result()
	latCount := parseInt64(lat["count"])
	latSum := parseInt64(lat["sum"])
	if latCount > 0 {
		m.AvgLatencyMs = float64(latSum) / float64(latCount)
	}

	return m
}

func (s *Store) GetEvents(limit int) []Event {
	if !s.enabled() || limit <= 0 {
		return []Event{}
	}

	raw, err := s.client.LRange(s.ctx, eventsKey, 0, int64(limit-1)).Result()
	if err != nil {
		return []Event{}
	}

	events := make([]Event, 0, len(raw))
	for _, item := range raw {
		var e Event
		if json.Unmarshal([]byte(item), &e) == nil {
			events = append(events, e)
		}
	}
	return events
}

func (s *Store) GetTimeline(minutes int) []TimelinePoint {
	if minutes <= 0 {
		minutes = 30
	}

	points := make([]TimelinePoint, 0, minutes)
	now := time.Now().UTC()

	if !s.enabled() {
		for i := minutes - 1; i >= 0; i-- {
			t := now.Add(-time.Duration(i) * time.Minute)
			points = append(points, TimelinePoint{
				Time: t.Format("15:04"),
			})
		}
		return points
	}

	for i := minutes - 1; i >= 0; i-- {
		t := now.Add(-time.Duration(i) * time.Minute)
		bucket := t.Format("200601021504")
		vals, _ := s.client.HGetAll(s.ctx, fmt.Sprintf("telemetry:bucket:%s", bucket)).Result()
		points = append(points, TimelinePoint{
			Time:          t.Format("15:04"),
			TotalRequests: parseInt64(vals["total"]),
			CacheHits:     parseInt64(vals["hits"]),
		})
	}
	return points
}

func parseInt64(s string) int64 {
	var n int64
	fmt.Sscanf(s, "%d", &n)
	return n
}
