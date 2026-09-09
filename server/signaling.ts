import { WebSocketServer, WebSocket } from 'ws'

type Client = WebSocket & { roomId?: string; peerId?: string }
type Message = { type: string; roomId?: string; peerId?: string; target?: string; payload?: unknown }

const port = Number(process.env.SIGNALING_PORT || 8787)
const rooms = new Map<string, Set<Client>>()
const server = new WebSocketServer({ port })

const send = (client: Client, message: unknown) => {
  if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message))
}

const peersInRoom = (roomId: string) => [...(rooms.get(roomId) || [])]

const leaveRoom = (client: Client) => {
  if (!client.roomId || !client.peerId) return
  const peers = rooms.get(client.roomId)
  peers?.delete(client)
  for (const peer of peers || []) send(peer, { type: 'peer-left', peerId: client.peerId })
  if (peers?.size === 0) rooms.delete(client.roomId)
  client.roomId = undefined
  client.peerId = undefined
}

server.on('connection', (socket) => {
  const client = socket as Client
  client.on('message', (raw) => {
    let message: Message
    try { message = JSON.parse(raw.toString()) } catch { return send(client, { type: 'error', message: 'Invalid signaling message.' }) }

    if (message.type === 'join' && message.roomId && message.peerId) {
      leaveRoom(client)
      const peers = peersInRoom(message.roomId)
      const room = rooms.get(message.roomId) || new Set<Client>()
      client.roomId = message.roomId
      client.peerId = message.peerId
      room.add(client)
      rooms.set(message.roomId, room)
      send(client, { type: 'room-peers', peers: peers.map((peer) => peer.peerId).filter(Boolean) })
      for (const peer of peers) send(peer, { type: 'peer-joined', peerId: message.peerId })
      return
    }

    if (message.type === 'signal' && message.target && client.roomId) {
      const target = peersInRoom(client.roomId).find((peer) => peer.peerId === message.target)
      if (target) send(target, { type: 'signal', from: client.peerId, payload: message.payload })
    }
  })
  client.on('close', () => leaveRoom(client))
})

console.log(`Signal signaling server listening on ws://localhost:${port}`)
