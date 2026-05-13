import { createContext, useContext, useState, useCallback } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'

interface WebSocketContextType {
  lastUpdate: number
  triggerUpdate: () => void
  lastCommentUpdate: number
}

// Exported so consumers that need to tolerate a missing provider can
// call useContext(WebSocketContext) directly. Most consumers should
// prefer useWebSocketUpdates below, which throws on misuse.
export const WebSocketContext = createContext<WebSocketContextType | null>(null)

export function WebSocketProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [lastUpdate, setLastUpdate] = useState(Date.now())
  const [lastCommentUpdate, setLastCommentUpdate] = useState(Date.now())

  const triggerUpdate = useCallback(() => {
    setLastUpdate(Date.now())
  }, [])

  const triggerCommentUpdate = useCallback(() => {
    setLastCommentUpdate(Date.now())
  }, [])

  // Set up WebSocket connection at root level
  useWebSocket(triggerUpdate, triggerCommentUpdate)

  return (
    <WebSocketContext.Provider value={{ lastUpdate, triggerUpdate, lastCommentUpdate }}>
      {children}
    </WebSocketContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWebSocketUpdates(): WebSocketContextType {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocketUpdates must be used within WebSocketProvider')
  }
  return context
}
