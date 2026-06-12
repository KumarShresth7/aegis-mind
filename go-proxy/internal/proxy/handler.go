package proxy

import (
	"bytes"
	"crypto/tls"
	"io"
	"log"
	"net/http"
	"time"
)

type ProxyHandler struct {
	Client *http.Client
}

type ChatCompletionRequest struct {
	Model string `json:"model"`
	Messages []map[string]interface{} `json:"messages"`
	Stream bool `json:"stream"`
}

func NewProxyHandler() *ProxyHandler {
	return &ProxyHandler{
		Client: &http.Client{
			Timeout: 60 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: false},
			},
		}
	}
}

func (ph *ProxyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
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

	if len(reqPayload.Messages) > 0 {
		lastMsg := reqPayload.Messages[len(reqPayload.Messages)-1]["content"]
		log.Printf("[Go Proxy] Inbound Prompt: %v | Model: %s | Stream: %v", lastMsg, reqPayload.Model, reqPayload.Stream)
	}

	upstreamURL := "https://api.openai.com/v1/chat/completions"
	req, err := http.NewRequest(http.MethodPost, upstreamURL, bytes.NewBuffer(bodyBytes))
	if err != nil {
		log.Printf("[Proxy Error] Outbound creation failed: %v", err)
		http.Error(w, "Internal proxy error", http.StatusInternalServerError)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", r.Header.Get("Authorization"))

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
	w.WriteHeader(resp.StatusCode)

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
				_, wErr := w.Write(buffer[:n])
				if wErr != nil {
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
		_, err := io.Copy(w, resp.Body)
		if err != nil {
			log.Printf("[Proxy Error] Response body copy failed: %v", err)
			return
		}
	}
}


