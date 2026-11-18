import type { ServerMessage } from '@hive/shared'
import { useStudioStore } from '../store/useStudioStore'

let socket: WebSocket | null = null
let retry: number | undefined

function scheduleRetry(): void {
  window.clearTimeout(retry)
  retry = window.setTimeout(connectSocket, 2000)
}

/** Send a client intent, if the channel is open. */
export function sendMessage(message: unknown): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message))
  }
}

/** Connect to the simulation channel, reconnecting whenever it drops. */
export function connectSocket(): void {
  if (socket) return
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  socket = new WebSocket(`${protocol}://${window.location.host}/ws`)

  socket.onopen = () => useStudioStore.getState().setSocket('online')
  socket.onmessage = (event) => {
    try {
      useStudioStore.getState().applyServerMessage(JSON.parse(event.data) as ServerMessage)
    } catch {
      // Ignore malformed frames; the next snapshot will resync.
    }
  }
  socket.onclose = () => {
    socket = null
    useStudioStore.getState().setSocket('offline')
    scheduleRetry()
  }
  socket.onerror = () => socket?.close()
}
