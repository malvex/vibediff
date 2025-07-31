package main

import (
	"context"
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"

	"github.com/malvex/vibediff/internal/git"
	"github.com/malvex/vibediff/internal/handlers"
	"github.com/malvex/vibediff/internal/review"
	"github.com/malvex/vibediff/internal/watcher"
)

// Version information
var (
	Version   = "dev"
	CommitSHA = "unknown"
	BuildDate = "unknown"
)

//go:embed all:web/dist
var webFiles embed.FS

func main() {
	// Parse command line flags
	var (
		host    = flag.String("host", "localhost", "Host to bind the server to")
		port    = flag.Int("port", 8888, "Port to bind the server to")
		debug   = flag.Bool("debug", false, "Enable debug logging")
		version = flag.Bool("version", false, "Show version information")
		format  = flag.String("format", "text", "Output format for review comments (text or json)")
	)
	flag.Parse()

	// Validate format flag
	if *format != "text" && *format != "json" {
		fmt.Fprintf(os.Stderr, "Invalid format: %s. Must be 'text' or 'json'\n", *format)
		os.Exit(1)
	}

	// Handle version flag
	if *version {
		fmt.Printf("VibeDiff version %s\n", Version)
		fmt.Printf("Commit: %s\n", CommitSHA)
		fmt.Printf("Built: %s\n", BuildDate)
		os.Exit(0)
	}

	// Configure logging
	log.SetOutput(os.Stderr)
	if *debug {
		os.Setenv("VIBEDIFF_DEBUG", "true")
	}

	reviewStore := review.NewStore()

	gitService := git.NewService()
	handler := handlers.NewHandler(gitService, reviewStore)
	handler.SetFormat(*format)

	// Create WebSocket hub
	wsHub := handlers.NewWSHub()
	go wsHub.Run()

	// Start file watcher
	gitWatcher := watcher.NewGitWatcher(wsHub)
	gitWatcher.Start()

	r := mux.NewRouter()

	r.HandleFunc("/api/diff", handler.GetDiff).Methods("GET")
	r.HandleFunc("/api/diff/{file:.+}/full", handler.GetFullFileWithDiff).Methods("GET")
	r.HandleFunc("/api/diff/{file:.+}", handler.GetFileDiff).Methods("GET")
	r.HandleFunc("/api/review/comment", handler.AddComment).Methods("POST")
	r.HandleFunc("/api/review/comments", handler.GetComments).Methods("GET")
	r.HandleFunc("/api/review/comment/{id}", handler.DeleteComment).Methods("DELETE")

	// WebSocket endpoint for live updates
	r.HandleFunc("/api/ws", handler.HandleWebSocket(wsHub)).Methods("GET")

	// Serve static assets from React build
	webFS, err := fs.Sub(webFiles, "web/dist")
	if err != nil {
		log.Fatal("Failed to create sub filesystem:", err)
	}
	r.PathPrefix("/assets/").Handler(http.FileServer(http.FS(webFS)))
	r.PathPrefix("/themes/").Handler(http.FileServer(http.FS(webFS)))

	// API routes for file content
	r.HandleFunc("/api/file", handler.GetFileContent).Methods("GET")

	// Catch-all route for React app (must be last)
	r.PathPrefix("/").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Serve index.html for all non-API routes (React routing)
		indexHTML, err := webFiles.ReadFile("web/dist/index.html")
		if err != nil {
			// Fallback to file system in development
			if _, err := os.Stat("web/dist/index.html"); err == nil {
				http.ServeFile(w, r, "web/dist/index.html")
				return
			}
			http.Error(w, "Application not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if _, err := w.Write(indexHTML); err != nil {
			log.Printf("Failed to write response: %v", err)
		}
	})

	addr := fmt.Sprintf("%s:%d", *host, *port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	go func() {
		fmt.Fprintf(os.Stderr, "Starting VibeDiff server on http://%s\n", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed to start: %v", err)
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	fmt.Fprintln(os.Stderr, "\nShutting down server...")

	// First stop accepting new connections and file watching
	gitWatcher.Stop()
	wsHub.Shutdown()

	// Give WebSocket connections time to close gracefully
	time.Sleep(100 * time.Millisecond)

	// Create shutdown context with reasonable timeout
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Shutdown HTTP server
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("Server shutdown error: %v", err)
	}

	comments := reviewStore.GetAllComments()
	if len(comments) > 0 {
		if *format == "json" {
			output, err := json.MarshalIndent(comments, "", "  ")
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error marshaling comments: %v\n", err)
			} else {
				fmt.Println(string(output))
			}
		}
		// For text format, comments are already printed when added
	} else {
		if *format != "json" {
			fmt.Fprintln(os.Stderr, "\nNo review comments were added.")
		}
	}
}
