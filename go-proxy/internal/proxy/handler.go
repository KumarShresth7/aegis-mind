package proxy

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"aegismind-proxy/internal/cache"
	"aegismind-proxy/internal/embeddings"
	"aegismind-proxy/internal/telemetry"
)

type ProxyHandler struct {
	Client      *http.Client
	CacheClient *cache.SemanticCache
	WorkerURL   string
	Telemetry   *telemetry.Store
	Embeddings  *embeddings.Client
}

type ChatCompletionRequest struct {
	Model    string                   `json:"model"`
	Messages []map[string]interface{} `json:"messages"`
	Stream   bool                     `json:"stream"`
}

func NewProxyHandler(cacheClient *cache.SemanticCache, workerURL string, tel *telemetry.Store, embedClient *embeddings.Client) *ProxyHandler {
	return &ProxyHandler{
		Client: &http.Client{
			Timeout: 60 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: false},
			},
		},
		CacheClient: cacheClient,
		WorkerURL:   workerURL,
		Telemetry:   tel,
		Embeddings:  embedClient,
	}
}

func extractPromptText(messages []map[string]interface{}) string {
	if len(messages) == 0 {
		return ""
	}
	content, ok := messages[len(messages)-1]["content"]
	if !ok {
		return ""
	}
	if s, ok := content.(string); ok {
		return s
	}
	return fmt.Sprintf("%v", content)
}

func parseSSEContent(chunk []byte) string {
	var sb strings.Builder
	for _, line := range bytes.Split(chunk, []byte("\n")) {
		if !bytes.HasPrefix(line, []byte("data: ")) {
			continue
		}
		payload := bytes.TrimSpace(line[6:])
		if bytes.Equal(payload, []byte("[DONE]")) {
			continue
		}

		var parsed struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			} `json:"choices"`
		}
		if err := json.Unmarshal(payload, &parsed); err != nil {
			continue
		}
		for _, choice := range parsed.Choices {
			if choice.Delta.Content != "" {
				sb.WriteString(choice.Delta.Content)
			}
			if choice.Message.Content != "" {
				sb.WriteString(choice.Message.Content)
			}
		}
	}
	return sb.String()
}

func parseJSONContent(body []byte) string {
	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return ""
	}
	var sb strings.Builder
	for _, choice := range parsed.Choices {
		sb.WriteString(choice.Message.Content)
	}
	return sb.String()
}

func (ph *ProxyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	start := time.Now()

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("[Proxy Error] Failed to read request body: %v", err)
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	r.Body.Close()
	r.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

	var reqPayload ChatCompletionRequest
	if err := json.Unmarshal(bodyBytes, &reqPayload); err != nil {
		log.Printf("[Proxy Error] JSON unmarshal failed: %v", err)
		http.Error(w, "Invalid JSON structure", http.StatusBadRequest)
		return
	}

	promptText := extractPromptText(reqPayload.Messages)
	if promptText != "" {
		log.Printf("[Go Proxy] Inbound Prompt: %s | Model: %s | Stream: %v", promptText, reqPayload.Model, reqPayload.Stream)
	}

	if promptText != "" && ph.Embeddings != nil {
		queryVector, err := ph.Embeddings.EmbedQuery(promptText)
		if err != nil {
			log.Printf("[Embedding] Query embed failed, skipping cache: %v", err)
		} else {
			cachedResponse, distance, matchedPrompt, hit := ph.CacheClient.CheckCache(queryVector)
			if hit {
				latencyMs := time.Since(start).Milliseconds()
				ph.Telemetry.RecordCacheHit(latencyMs, distance, matchedPrompt)

				log.Printf("[Go Proxy] Serving from Cache (similarity distance=%.4f)", distance)
				w.Header().Set("Content-Type", "text/event-stream")
				w.Header().Set("X-AegisMind-Cache", "HIT")
				w.Header().Set("X-AegisMind-Similarity", fmt.Sprintf("%.4f", distance))
				w.Header().Set("X-AegisMind-Latency-Ms", fmt.Sprintf("%d", latencyMs))

				mockChunk := fmt.Sprintf(`{"choices":[{"delta":{"content":%s}}]}`, jsonString(cachedResponse))
				fmt.Fprintf(w, "data: %s\n\n", mockChunk)
				fmt.Fprintf(w, "data: [DONE]\n\n")

				if flusher, ok := w.(http.Flusher); ok {
					flusher.Flush()
				}
				return
			}
		}
	}

	log.Println("[Go Proxy] Cache Miss. Forwarding to worker...")
	w.Header().Set("X-AegisMind-Cache", "MISS")

	req, err := http.NewRequest(http.MethodPost, ph.WorkerURL, bytes.NewBuffer(bodyBytes))
	if err != nil {
		log.Printf("[Proxy Error] Outbound creation failed: %v", err)
		http.Error(w, "Internal proxy error", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := ph.Client.Do(req)
	if err != nil {
		log.Printf("[Proxy Error] Upstream communication failed: %v", err)
		http.Error(w, "Bad gateway", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for k, v := range resp.Header {
		for _, val := range v {
			w.Header().Add(k, val)
		}
	}

	latencyMs := time.Since(start).Milliseconds()
	ph.Telemetry.RecordRequest(false, latencyMs)
	w.Header().Set("X-AegisMind-Latency-Ms", fmt.Sprintf("%d", latencyMs))
	w.WriteHeader(resp.StatusCode)

	var responseBuilder strings.Builder

	if reqPayload.Stream {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Streaming unsupported by platform container", http.StatusInternalServerError)
			return
		}

		buffer := make([]byte, 1024)
		for {
			n, err := resp.Body.Read(buffer)
			if n > 0 {
				chunk := buffer[:n]
				responseBuilder.WriteString(parseSSEContent(chunk))
				if _, wErr := w.Write(chunk); wErr != nil {
					log.Printf("[Proxy Warning] Client disconnected early from stream")
					return
				}
				flusher.Flush()
			}
			if err == io.EOF {
				break
			}
			if err != nil {
				log.Printf("[Proxy Error] Stream chunk reading error: %v", err)
				return
			}
		}
	} else {
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			log.Printf("[Proxy Error] Response body read failed: %v", err)
			return
		}
		fullText := parseJSONContent(body)
		if fullText == "" {
			fullText = string(body)
		}
		responseBuilder.WriteString(fullText)
		if _, err := w.Write(body); err != nil {
			log.Printf("[Proxy Error] Response body copy failed: %v", err)
			return
		}
	}

	if fullResponse := strings.TrimSpace(responseBuilder.String()); fullResponse != "" && promptText != "" && ph.Embeddings != nil {
		docVector, err := ph.Embeddings.EmbedDocument(promptText)
		if err != nil {
			log.Printf("[Embedding] Document embed failed, response not cached: %v", err)
		} else {
			ph.CacheClient.Store(promptText, fullResponse, docVector)
		}
	}
}

func jsonString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}
