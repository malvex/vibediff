package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins in development
		return true
	},
}

// WSClient represents a connected WebSocket client
type WSClient struct {
	hub  *WSHub
	conn *websocket.Conn
	send chan []byte
}

// WSHub manages all WebSocket connections
type WSHub struct {
	clients    map[*WSClient]bool
	register   chan *WSClient
	unregister chan *WSClient
	broadcast  chan []byte
	done       chan bool
}

// NewWSHub creates a new WebSocket hub
func NewWSHub() *WSHub {
	return &WSHub{
		clients:    make(map[*WSClient]bool),
		register:   make(chan *WSClient),
		unregister: make(chan *WSClient),
		broadcast:  make(chan []byte, 256),
		done:       make(chan bool),
	}
}

// Run starts the WebSocket hub
func (h *WSHub) Run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
			if os.Getenv("VIBEDIFF_DEBUG") == "true" {
				log.Printf("WebSocket client connected. Total clients: %d", len(h.clients))
			}

		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				if os.Getenv("VIBEDIFF_DEBUG") == "true" {
					log.Printf("WebSocket client disconnected. Total clients: %d", len(h.clients))
				}
			}

		case message := <-h.broadcast:
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					// Client's send channel is full, close it
					delete(h.clients, client)
					close(client.send)
				}
			}

		case <-h.done:
			// Close all client connections
			for client := range h.clients {
				client.conn.Close()
				delete(h.clients, client)
			}
			if os.Getenv("VIBEDIFF_DEBUG") == "true" {
				log.Printf("WebSocket hub shutdown complete")
			}
			return
		}
	}
}

// Shutdown gracefully shuts down the WebSocket hub
func (h *WSHub) Shutdown() {
	close(h.done)
}

// NotifyChange sends a change notification to all connected clients
func (h *WSHub) NotifyChange(changeType string) {
	data := map[string]interface{}{
		"type":      changeType,
		"timestamp": time.Now().Unix(),
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		if os.Getenv("VIBEDIFF_DEBUG") == "true" {
			log.Printf("Error marshaling WebSocket data: %v", err)
		}
		return
	}

	select {
	case h.broadcast <- jsonData:
	default:
		if os.Getenv("VIBEDIFF_DEBUG") == "true" {
			log.Printf("WebSocket broadcast channel is full, skipping message")
		}
	}
}

// readPump pumps messages from the websocket connection to the hub
func (c *WSClient) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	if err := c.conn.SetReadDeadline(time.Now().Add(60 * time.Second)); err != nil {
		if os.Getenv("VIBEDIFF_DEBUG") == "true" {
			if os.Getenv("VIBEDIFF_DEBUG") == "true" {
				log.Printf("Failed to set read deadline: %v", err)
			}
		}
	}
	c.conn.SetPongHandler(func(string) error {
		if err := c.conn.SetReadDeadline(time.Now().Add(60 * time.Second)); err != nil {
			if os.Getenv("VIBEDIFF_DEBUG") == "true" {
				log.Printf("Failed to set read deadline: %v", err)
			}
		}
		return nil
	})

	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				if os.Getenv("VIBEDIFF_DEBUG") == "true" {
					log.Printf("WebSocket error: %v", err)
				}
			}
			break
		}
		// We don't process incoming messages for now
	}
}

// writePump pumps messages from the hub to the websocket connection
func (c *WSClient) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			if err := c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil {
				if os.Getenv("VIBEDIFF_DEBUG") == "true" {
					log.Printf("Failed to set write deadline: %v", err)
				}
				return
			}
			if !ok {
				// The hub closed the channel
				if err := c.conn.WriteMessage(websocket.CloseMessage, []byte{}); err != nil {
					if os.Getenv("VIBEDIFF_DEBUG") == "true" {
						log.Printf("Failed to write close message: %v", err)
					}
				}
				return
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			if err := c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil {
				if os.Getenv("VIBEDIFF_DEBUG") == "true" {
					log.Printf("Failed to set write deadline: %v", err)
				}
				return
			}
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// HandleWebSocket handles WebSocket connections
func (h *Handler) HandleWebSocket(hub *WSHub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			if os.Getenv("VIBEDIFF_DEBUG") == "true" {
				log.Printf("WebSocket upgrade error: %v", err)
			}
			return
		}

		client := &WSClient{
			hub:  hub,
			conn: conn,
			send: make(chan []byte, 256),
		}

		client.hub.register <- client

		// Send initial connection message
		initialMsg := map[string]interface{}{
			"type": "connected",
		}
		if data, err := json.Marshal(initialMsg); err == nil {
			client.send <- data
		}

		// Start goroutines for reading and writing
		go client.writePump()
		go client.readPump()
	}
}
