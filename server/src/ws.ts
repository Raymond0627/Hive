import type { ServerMessage } from '@hive/shared'
import type { WebSocket } from 'ws'

const clients = new Set<WebSocket>()

export const addClient = (socket: WebSocket) => clients.add(socket)
export const removeClient = (socket: WebSocket) => clients.delete(socket)
export const clientCount = () => clients.size

export function broadcast(message: ServerMessage): void {
  const text = JSON.stringify(message)
  for (const client of clients) {
    if (client.readyState === 1) client.send(text)
  }
}
