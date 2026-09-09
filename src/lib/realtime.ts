import { getIceServers, getIceTransportPolicy } from './ice'

type SignalPayload = { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }

type RealtimeEvents = {
  status: (status: string) => void
  participants: (count: number) => void
  remoteAudio: (stream: MediaStream, peerId: string) => void
  remoteVideo: (stream: MediaStream, peerId: string) => void
}

type PeerState = {
  connection: RTCPeerConnection
  videoTransceiver: RTCRtpTransceiver
  pendingCandidates: RTCIceCandidateInit[]
  makingOffer: boolean
  ignoreOffer: boolean
  isSettingRemoteAnswerPending: boolean
  polite: boolean
  remoteStreams: Set<MediaStream>
}

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || (import.meta.env.DEV ? 'ws://127.0.0.1:8787' : '')
const devLog = (scope: string, message: string, detail?: unknown) => {
  if (import.meta.env.DEV) console.info(`[${scope}] ${message}`, detail ?? '')
}

export class RealtimeRoom {
  private socket: WebSocket | null = null
  private peers = new Map<string, PeerState>()
  private localStream: MediaStream | null = null
  private screenStream: MediaStream | null = null
  private events: RealtimeEvents
  private roomId = ''
  private peerId = crypto.randomUUID()
  private connectedPeers = new Set<string>()

  constructor(events: RealtimeEvents) { this.events = events }

  async connect(roomId: string, accessToken: string) {
    if (!SIGNALING_URL) throw new Error('VITE_SIGNALING_URL is required for production')
    this.roomId = roomId
    this.events.status('Connecting to signaling')
    devLog('SIGNAL', 'connecting', { roomId })
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(SIGNALING_URL)
      this.socket = socket
      socket.onopen = () => { socket.send(JSON.stringify({ type: 'join', roomId, peerId: this.peerId, accessToken })); devLog('SIGNAL', 'join sent', { roomId }); resolve() }
      socket.onerror = () => reject(new Error('Signaling connection failed'))
      socket.onclose = () => { devLog('SIGNAL', 'socket closed', { roomId }); this.events.status('Signaling disconnected') }
      socket.onmessage = (event) => { void this.handleMessage(JSON.parse(event.data)) }
    })
  }

  setLocalStream(stream: MediaStream) {
    this.localStream = stream
    for (const state of this.peers.values()) this.addAudioTracks(state.connection, stream)
    devLog('WEBRTC', 'local microphone stream set')
  }

  setScreenStream(stream: MediaStream | null) {
    this.screenStream = stream
    const videoTrack = stream?.getVideoTracks()[0] || null
    for (const [peerId, state] of this.peers) {
      void state.videoTransceiver.sender.replaceTrack(videoTrack).then(() => {
        devLog('SCREEN', videoTrack ? 'local screen track added' : 'local screen track removed', { peerId })
      }).catch((error) => devLog('SCREEN', 'failed to replace local screen track', { peerId, error: error instanceof Error ? error.message : 'unknown error' }))
    }
  }

  close() {
    for (const [peerId, state] of this.peers) {
      state.pendingCandidates.length = 0
      state.remoteStreams.clear()
      state.connection.ontrack = null
      state.connection.onicecandidate = null
      state.connection.onnegotiationneeded = null
      state.connection.close()
      devLog('WEBRTC', 'peer connection closed', { peerId })
    }
    this.peers.clear()
    this.connectedPeers.clear()
    this.events.participants(1)
    this.socket?.close()
    this.socket = null
    this.roomId = ''
  }

  private addAudioTracks(connection: RTCPeerConnection, stream: MediaStream) {
    for (const track of stream.getAudioTracks()) if (!connection.getSenders().some((sender) => sender.track?.id === track.id)) connection.addTrack(track, stream)
  }

  private createPeer(peerId: string, initiator: boolean) {
    const existing = this.peers.get(peerId)
    if (existing) return existing
    const connection = new RTCPeerConnection({ iceServers: getIceServers(), iceTransportPolicy: getIceTransportPolicy() })
    const state: PeerState = {
      connection,
      videoTransceiver: connection.addTransceiver('video', { direction: 'sendrecv' }),
      pendingCandidates: [],
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      polite: this.peerId > peerId,
      remoteStreams: new Set(),
    }
    this.peers.set(peerId, state)
    devLog('WEBRTC', 'peer created', { peerId, polite: state.polite })
    if (this.localStream) this.addAudioTracks(connection, this.localStream)
    if (this.screenStream) void state.videoTransceiver.sender.replaceTrack(this.screenStream.getVideoTracks()[0] || null)
    connection.onicecandidate = (event) => { if (event.candidate) { devLog('ICE', `peer ${peerId} candidate type=${event.candidate.type || 'unknown'}`); this.sendSignal(peerId, { candidate: event.candidate.toJSON() }) } }
    connection.onnegotiationneeded = () => { void this.negotiate(peerId, state) }
    connection.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track])
      state.remoteStreams.add(stream)
      if (event.track.kind === 'audio') { devLog('WEBRTC', 'remote audio track received', { peerId }); this.events.remoteAudio(stream, peerId) }
      if (event.track.kind === 'video') { devLog('SCREEN', 'remote screen track received', { peerId }); this.events.remoteVideo(stream, peerId) }
      event.track.onended = () => state.remoteStreams.delete(stream)
    }
    connection.onconnectionstatechange = () => {
      devLog('WEBRTC', `peer ${peerId} connectionState=${connection.connectionState}`)
      if (connection.connectionState === 'connected') { this.connectedPeers.add(peerId); this.events.participants(this.connectedPeers.size + 1); this.events.status('P2P connected') }
      if (connection.connectionState === 'failed') this.events.status('P2P connection failed')
    }
    connection.oniceconnectionstatechange = () => devLog('ICE', `peer ${peerId} iceConnectionState=${connection.iceConnectionState}`)
    connection.onsignalingstatechange = () => devLog('WEBRTC', `peer ${peerId} signalingState=${connection.signalingState}`)
    if (initiator) devLog('WEBRTC', 'peer marked as initial offer candidate', { peerId, polite: state.polite })
    return state
  }

  private async negotiate(peerId: string, state: PeerState) {
    const connection = state.connection
    if (state.makingOffer || connection.signalingState !== 'stable') return
    try {
      state.makingOffer = true
      await connection.setLocalDescription()
      if (connection.localDescription) { devLog('WEBRTC', 'sending description', { peerId, type: connection.localDescription.type }); this.sendSignal(peerId, { description: connection.localDescription }) }
    } catch (error) {
      devLog('WEBRTC', 'negotiation failed', { peerId, error: error instanceof Error ? error.message : 'unknown error' })
    } finally { state.makingOffer = false }
  }

  private async flushCandidates(state: PeerState, peerId: string) {
    const candidates = state.pendingCandidates.splice(0)
    for (const candidate of candidates) {
      try { await state.connection.addIceCandidate(candidate); devLog('ICE', 'queued candidate applied', { peerId }) }
      catch (error) { devLog('ICE', 'queued candidate failed', { peerId, error: error instanceof Error ? error.message : 'unknown error' }) }
    }
  }

  private sendSignal(target: string, payload: SignalPayload) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'signal', roomId: this.roomId, peerId: this.peerId, target, payload })) }

  private async handleMessage(message: { type: string; peers?: string[]; peerId?: string; from?: string; payload?: SignalPayload }) {
    if (message.type === 'room-peers') { for (const peerId of message.peers || []) this.createPeer(peerId, true); this.events.participants((message.peers?.length || 0) + 1); this.events.status(message.peers?.length ? 'Negotiating P2P' : 'Waiting for another peer'); return }
    if (message.type === 'peer-joined' && message.peerId) { this.createPeer(message.peerId, false); this.events.participants(this.peers.size + 1); return }
    if (message.type === 'peer-left' && message.peerId) { const state = this.peers.get(message.peerId); state?.connection.close(); state?.pendingCandidates.splice(0); state?.remoteStreams.clear(); this.peers.delete(message.peerId); this.connectedPeers.delete(message.peerId); this.events.participants(this.connectedPeers.size + 1); devLog('WEBRTC', 'peer left and state cleared', { peerId: message.peerId }); return }
    if (message.type !== 'signal' || !message.from || !message.payload) return
    const state = this.createPeer(message.from, false)
    const connection = state.connection
    const description = message.payload.description
    if (description) {
      state.ignoreOffer = false
      const readyForOffer = !state.makingOffer && (connection.signalingState === 'stable' || state.isSettingRemoteAnswerPending)
      const offerCollision = description.type === 'offer' && !readyForOffer
      state.ignoreOffer = !state.polite && offerCollision
      if (state.ignoreOffer) { devLog('WEBRTC', 'ignored colliding offer', { peerId: message.from }); return }
      try {
        if (offerCollision && state.polite) await connection.setLocalDescription({ type: 'rollback' })
        state.isSettingRemoteAnswerPending = description.type === 'answer'
        await connection.setRemoteDescription(description)
        state.isSettingRemoteAnswerPending = false
        devLog('WEBRTC', 'remote description applied', { peerId: message.from, type: description.type })
        await this.flushCandidates(state, message.from)
        if (description.type === 'offer') {
          await connection.setLocalDescription()
          if (connection.localDescription) this.sendSignal(message.from, { description: connection.localDescription })
        }
      } catch (error) {
        state.isSettingRemoteAnswerPending = false
        devLog('WEBRTC', 'remote description failed', { peerId: message.from, error: error instanceof Error ? error.message : 'unknown error' })
      }
    }
    const candidate = message.payload.candidate
    if (candidate) {
      if (state.ignoreOffer) return
      if (connection.remoteDescription) {
        try { await connection.addIceCandidate(candidate); devLog('ICE', 'remote candidate applied', { peerId: message.from }) }
        catch (error) { devLog('ICE', 'remote candidate failed', { peerId: message.from, error: error instanceof Error ? error.message : 'unknown error' }) }
      } else { state.pendingCandidates.push(candidate); devLog('ICE', 'remote candidate queued', { peerId: message.from }) }
    }
  }
}
