package main

import (
	"log"
	"net/http"
	"os"
	"aegismind-proxy/internal/proxy"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	proxyHandler := proxy.NewProxyHandler()

	http.Handle("/v1/chat/completions", proxyHandler)
	log.Printf("AegisMind Data Plane running on http://localhost:%s\n", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Server startup failure: %v", err)
	}
}