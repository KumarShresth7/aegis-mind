package embeddings

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const defaultTaskType = "SEMANTIC_SIMILARITY"

type Client struct {
	baseURL    string
	httpClient *http.Client
}

type embedRequest struct {
	Text     string `json:"text"`
	TaskType string `json:"task_type"`
}

type embedResponse struct {
	Embedding []float64 `json:"embedding"`
}

func NewClient(workerURL string) *Client {
	base := os.Getenv("EMBEDDING_URL")
	if base == "" {
		base = deriveEmbeddingURL(workerURL)
	}
	return &Client{
		baseURL: strings.TrimRight(base, "/"),
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func deriveEmbeddingURL(workerURL string) string {
	// http://localhost:8000/v1/chat/completions -> http://localhost:8000/v1/embeddings
	if idx := strings.Index(workerURL, "/v1/"); idx > 0 {
		return workerURL[:idx] + "/v1/embeddings"
	}
	return "http://localhost:8000/v1/embeddings"
}

func (c *Client) EmbedQuery(text string) ([]float32, error) {
	return c.embed(text, defaultTaskType)
}

func (c *Client) EmbedDocument(text string) ([]float32, error) {
	return c.embed(text, defaultTaskType)
}

func (c *Client) embed(text, taskType string) ([]float32, error) {
	payload, err := json.Marshal(embedRequest{Text: text, TaskType: taskType})
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Post(c.baseURL, "application/json", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("embedding request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embedding API returned %d: %s", resp.StatusCode, string(body))
	}

	var parsed embedResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}

	if len(parsed.Embedding) == 0 {
		return nil, fmt.Errorf("embedding API returned empty vector")
	}

	out := make([]float32, len(parsed.Embedding))
	for i, v := range parsed.Embedding {
		out[i] = float32(v)
	}
	return out, nil
}
