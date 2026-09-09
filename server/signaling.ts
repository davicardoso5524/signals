import { createServer } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { WebSocketServer, WebSocket } from 'ws'

type Client = WebSocket & { roomId?: string; peerId?: string; userId?: string }
type Message = { type: string; roomId?: string; peerId?: string; target?: string; accessToken?: string; payload?: unknown }

const port = Number(process.env.PORT || process.env.SIGNALING_PORT || 8787)
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
const maxMessageBytes = 64 * 1024
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const rooms = new Map<string, Set<Client>>()
const httpServer = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    response.end(JSON.stringify({ status: 'ok' }))
    return
  }
  response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({ error: 'Not found' }))
})
const websocketServer = new WebSocketServer({ noServer: true, maxPayload: maxMessageBytes })

const send = (client: Client, message: unknown) => {
  if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message))
}

const peersInRoom = (roomId: string) => [...(rooms.get(roomId) || [])]

const leaveRoom = (client: Client) => {
  if (!client.roomId || !client.peerId) return
  const roomId = client.roomId
  const peers = rooms.get(roomId)
  peers?.delete(client)
  for (const peer of peers || []) send(peer, { type: 'peer-left', peerId: client.peerId })
  if (peers?.size === 0) rooms.delete(roomId)
  console.info('[SIGNAL] peer left', { roomId, userId: client.userId })
  client.roomId = undefined
  client.peerId = undefined
  client.userId = undefined
}

const reject = (client: Client, message: string) => { send(client, { type: 'error', message }); client.close(1008, message) }

const isSignalPayload = (payload: unknown): payload is { description?: unknown; candidate?: unknown } => {
  if (!payload || typeof payload !== 'object') return false
  const value = payload as Record<string, unknown>
  return (value.description === undefined || (typeof value.description === 'object' && value.description !== null)) && (value.candidate === undefined || (typeof value.candidate === 'object' && value.candidate !== null))
}

httpServer.on('upgrade', (request, socket, head) => {
  if (request.url !== '/') { socket.destroy(); return }
  websocketServer.handleUpgrade(request, socket, head, (client) => websocketServer.emit('connection', client, request))
})

websocketServer.on('connection', (socket) => {
  const client = socket as Client
  client.on('error', () => leaveRoom(client))
  client.on('message', async (raw) => {
    const rawText = raw.toString()
    if (Buffer.byteLength(rawText, 'utf8') > maxMessageBytes) { reject(client, 'Message too large.'); return }
    let message: Message
    try { message = JSON.parse(rawText) as Message } catch { reject(client, 'Invalid signaling message.'); return }
    if (!message || typeof message.type !== 'string') { reject(client, 'Invalid signaling message.'); return }

    if (message.type === 'join') {
      if (client.roomId) { reject(client, 'Already joined a room.'); return }
      if (!message.roomId || !uuidPattern.test(message.roomId) || !message.peerId || !uuidPattern.test(message.peerId) || typeof message.accessToken !== 'string' || !message.accessToken) { reject(client, 'Invalid signaling join.'); return }
      if (!supabaseUrl || !supabaseKey) { console.warn('[SIGNAL] Supabase server configuration is missing'); reject(client, 'Signaling authentication is unavailable.'); return }
      const authClient = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: `Bearer ${message.accessToken}` } } })
      const { data: userData, error: userError } = await authClient.auth.getUser(message.accessToken)
      if (userError || !userData.user) { console.warn('[SIGNAL] rejected invalid token'); reject(client, 'Signaling authentication failed.'); return }
      const { data: membership, error: membershipError } = await authClient.from('room_members').select('room_id').eq('room_id', message.roomId).eq('user_id', userData.user.id).maybeSingle()
      if (membershipError || !membership) { console.warn('[SIGNAL] rejected non-member join', { roomId: message.roomId }); reject(client, 'You are not a member of this room.'); return }
      if (peersInRoom(message.roomId).some((peer) => peer.peerId === message.peerId)) { reject(client, 'Peer connection already exists.'); return }
      const peers = peersInRoom(message.roomId)
      const room = rooms.get(message.roomId) || new Set<Client>()
      client.roomId = message.roomId
      client.peerId = message.peerId
      client.userId = userData.user.id
      room.add(client)
      rooms.set(message.roomId, room)
      console.info('[SIGNAL] authorized room join', { roomId: message.roomId, userId: userData.user.id })
      send(client, { type: 'room-peers', peers: peers.map((peer) => peer.peerId).filter(Boolean) })
      for (const peer of peers) send(peer, { type: 'peer-joined', peerId: message.peerId })
      return
    }

    if (message.type === 'signal') {
      if (!client.roomId || !client.peerId || !client.userId || message.roomId !== client.roomId || message.peerId !== client.peerId || !message.target || !uuidPattern.test(message.target) || !isSignalPayload(message.payload)) { reject(client, 'Invalid signaling message.'); return }
      const target = peersInRoom(client.roomId).find((peer) => peer.peerId === message.target)
      if (target) send(target, { type: 'signal', from: client.peerId, payload: message.payload })
      return
    }

    reject(client, 'Unknown signaling message.')
  })
  client.on('close', () => leaveRoom(client))
})

httpServer.listen(port, () => console.info(`[SIGNAL] Signaling server listening on port ${port}`))
