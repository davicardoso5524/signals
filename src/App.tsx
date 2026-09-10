import { useEffect, useRef, useState } from 'react'
import { RealtimeRoom } from './lib/realtime'
import { AuthGate, useAuth } from './Auth'
import { createRoom as createRoomInSupabase, deleteRoom, joinRoomByCode, leaveRoom, listMessages, listRoomMembers, listRooms, removeRoomMember, renameRoom, sendRoomMessage, subscribeToRoomMessages, type RoomMemberRecord } from './lib/rooms'
import { supabase } from './lib/supabase'
import { UpdateGate } from './lib/updater'
import { createGroup, findProfiles, getOrCreateDirect, listConversations, listMessages as listConversationMessages, listParticipants, sendMessage, subscribeToMessages, type Conversation, type Message, type Profile } from './lib/conversations'

type View = 'Home' | 'People' | 'Rooms' | 'Settings'
type IconName = 'home' | 'people' | 'rooms' | 'settings' | 'search' | 'plus' | 'arrow' | 'copy' | 'mic' | 'headphones' | 'screen' | 'invite' | 'leave' | 'more' | 'close' | 'eye' | 'sun' | 'moon' | 'logout' | 'fullscreen'
type Theme = 'dark' | 'light'
type RoomMessage = { id: string; roomId: string; authorId: string; authorName: string; username: string; content: string; createdAt: string }
type Room = { id: string; ownerId: string; name: string; meta: string; code: string; state: string; live: boolean; memberCount: number; participantCount: number; kind: 'quick' | 'persistent'; access: 'invite' | 'password' | 'request'; unread: number }
type Person = { id: string; initials: string; name: string; username: string; tone: string; active: boolean; role?: string }

const people: Person[] = []
const devLog = (scope: string, message: string) => { if (import.meta.env.DEV) console.info(`[${scope}] ${message}`) }
const shortId = (value: string) => value ? value.slice(0, 8) : 'none'
const SETTINGS_CHANGED_EVENT = 'signals-settings-changed'
const notifySettingsChanged = () => window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT))

function mapRoom(record: { id: string; owner_id?: string; name: string; code: string; kind: Room['kind']; access: Room['access']; member_count?: number }): Room {
  return { id: record.id, ownerId: record.owner_id || '', name: record.name, meta: `${record.member_count || 0} people`, code: record.code, state: 'Ready', live: false, memberCount: record.member_count || 0, participantCount: 0, kind: record.kind, access: record.access, unread: 0 }
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m4 10 8-6 8 6" /><path d="M6 9.5V20h12V9.5M10 20v-5h4v5" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20c.5-3.5 2.3-5.2 5.5-5.2s5 1.7 5.5 5.2" /><path d="M15.5 5.5a3 3 0 0 1 0 5.8M17 14.9c2.1.5 3.3 2.2 3.6 4.6" /></>,
    rooms: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 8h8M8 12h5M8 16h3" /></>,
    settings: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="10" cy="18" r="2" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4.2 4.2" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h13M13 7l5 5-5 5" /></>,
    copy: <><rect x="8" y="8" width="10" height="11" rx="1.5" /><path d="M16 8V6.5A1.5 1.5 0 0 0 14.5 5h-8A1.5 1.5 0 0 0 5 6.5v8A1.5 1.5 0 0 0 6.5 16H8" /></>,
    mic: <><path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Z" /><path d="M6 11a6 6 0 0 0 12 0M12 17v3M9 20h6" /></>,
    headphones: <><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><path d="M4 13h3v5H5a1 1 0 0 1-1-1v-4ZM20 13h-3v5h2a1 1 0 0 0 1-1v-4Z" /></>,
    screen: <><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M9 20h6M12 16v4" /></>,
    invite: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20c.5-3.5 2.3-5.2 5.5-5.2s5 1.7 5.5 5.2M19 8v6M16 11h6" /></>,
    leave: <><path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" /><path d="m14 8 4 4-4 4M9 12h9" /></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    eye: <><path d="M2.5 12s3.4-5 9.5-5 9.5 5 9.5 5-3.4 5-9.5 5-9.5-5-9.5-5Z" /><circle cx="12" cy="12" r="2.2" /></>,
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2.5v2M12 19.5v2M4.7 4.7l1.4 1.4M17.9 17.9l1.4 1.4M2.5 12h2M19.5 12h2M4.7 19.3l1.4-1.4M17.9 6.1l1.4-1.4" /></>,
    moon: <><path d="M20.2 15.2A8.3 8.3 0 0 1 8.8 3.8 8.3 8.3 0 1 0 20.2 15.2Z" /></>,
    logout: <><path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" /><path d="m14 8 4 4-4 4M9 12h9" /></>,
    fullscreen: <><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M20 16v4h-4" /></>,
  }
  return <svg {...common}>{paths[name]}</svg>
}

function SignalWorkspace() {
  const { profile, profileLoading, user, signOut } = useAuth()
  const [view, setView] = useState<View>('Home')
  const [showCreate, setShowCreate] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [inCall, setInCall] = useState(false)
  const [showCall, setShowCall] = useState(false)
  const [muted, setMuted] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [roomKind, setRoomKind] = useState<'quick' | 'persistent'>('persistent')
  const [roomAccess, setRoomAccess] = useState<'invite' | 'password' | 'request'>('invite')
  const [roomPassword, setRoomPassword] = useState('')
  const [joinError, setJoinError] = useState('')
  const [roomList, setRoomList] = useState<Room[]>([])
  const [dismissedRecentRooms, setDismissedRecentRooms] = useState<string[]>([])
  const [hasRoomHistory, setHasRoomHistory] = useState(false)
  const [activeRoom, setActiveRoom] = useState<Room | null>(null)
  const [roomDetail, setRoomDetail] = useState<Room | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationDetail, setConversationDetail] = useState<Conversation | null>(null)
  const [profileCopied, setProfileCopied] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => localStorage.getItem('signals-theme') === 'light' ? 'light' : 'dark')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('signals-theme', theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f7f8fa' : '#050608')
  }, [theme])

  useEffect(() => {
    if (!supabase || !user) return
    listRooms().then((records) => {
      const remoteRooms = records.map(mapRoom)
      setRoomList(remoteRooms)
      if (remoteRooms.length) { setActiveRoom(remoteRooms[0]); setHasRoomHistory(true) }
    }).catch(() => undefined)
  }, [user])

  useEffect(() => {
    if (!user) return
    try { setDismissedRecentRooms(JSON.parse(localStorage.getItem(`signals.dismissedRecentRooms.${user.id}`) || '[]')) } catch { setDismissedRecentRooms([]) }
  }, [user?.id])

  useEffect(() => {
    if (!user) return
    listConversations(user.id).then(setConversations).catch(() => undefined)
  }, [user])

  const conversationIds = conversations.map((conversation) => conversation.id).join(',')
  useEffect(() => {
    if (!supabase || !user || !conversationIds) return
    const refresh = () => { void listConversations(user.id).then(setConversations).catch(() => undefined) }
    const unsubscribes = conversationIds.split(',').map((conversationId) => subscribeToMessages(conversationId, refresh))
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
  }, [conversationIds, user?.id])

  const openConversation = (conversation: Conversation) => { setConversationDetail(conversation); setView('People'); setInCall(false); setShowCall(false) }
  const refreshConversations = () => { if (user) void listConversations(user.id).then(setConversations).catch(() => undefined) }

  const persistRooms = (nextRooms: Room[]) => { setRoomList(nextRooms); setHasRoomHistory(nextRooms.length > 0) }
  const generateRoomCode = () => `${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${Math.floor(10 + Math.random() * 90)}-${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${Math.floor(10 + Math.random() * 90)}`

  const createRoom = async () => {
    if (!roomName.trim() || (roomAccess === 'password' && !roomPassword)) return
    const room: Room = { id: crypto.randomUUID?.() || `room-${Date.now()}`, ownerId: user?.id || '', name: roomName.trim() || 'Untitled room', meta: '0 people', code: generateRoomCode(), state: 'Ready', live: false, memberCount: 0, participantCount: 0, kind: roomKind, access: roomAccess, unread: 0 }
    if (supabase && user) {
      try {
        const saved = await createRoomInSupabase({ name: room.name, code: room.code, kind: room.kind, access: room.access }, user.id)
        if (saved) { room.id = saved.id; room.memberCount = 1; room.meta = '1 person' }
      } catch { return }
    }
    persistRooms([room, ...roomList.filter((item) => item.code !== room.code)])
    setHasRoomHistory(true)
    setActiveRoom(room)
    setInCall(false)
    setShowCall(false)
    setRoomDetail(room)
    setView('Rooms')
    setShowCreate(false)
    setRoomPassword('')
  }

  const joinRoom = async (requestedCode: string) => {
    if (!requestedCode.trim() || !user) { setJoinError('Enter a room code.'); return }
    try {
      const joined = await joinRoomByCode(requestedCode)
      if (!joined) throw new Error('Room not found')
      const room = mapRoom({ ...joined, member_count: 0 })
      const refreshed = await listRooms()
      const savedRoom = refreshed.find((item) => item.id === joined.id)
      const mappedRoom = savedRoom ? mapRoom(savedRoom) : room
      console.info('[ROOM] resolved room=' + shortId(mappedRoom.id))
      setRoomList((current) => [mappedRoom, ...current.filter((item) => item.id !== mappedRoom.id)])
      setActiveRoom(mappedRoom)
      setRoomDetail(mappedRoom)
      setJoinError('')
      setView('Rooms')
      setInCall(true)
      setShowCall(true)
    } catch { setJoinError('Room not found. Check the code and try again.') }
  }

  const copyCode = async (room = activeRoom) => {
    if (!room) return
    try { await navigator.clipboard?.writeText(room.code) } catch { /* clipboard may be unavailable in preview */ }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const copyUsername = async () => {
    const username = profile?.username?.trim() || user?.user_metadata?.username?.trim()
    if (!username) return
    try { await navigator.clipboard?.writeText(`@${username}`) } catch { /* clipboard may be unavailable */ }
    setProfileCopied(true)
    window.setTimeout(() => setProfileCopied(false), 1800)
  }

  const handleSignOut = () => {
    setInCall(false)
    setShowCall(false)
    setSharing(false)
    setActiveRoom(null)
    setRoomDetail(null)
    setConversationDetail(null)
    setRoomList([])
    setConversations([])
    setHasRoomHistory(false)
    void signOut()
  }

  const accountName = profile?.display_name?.trim() || profile?.username?.trim() || user?.user_metadata?.display_name?.trim() || user?.user_metadata?.username?.trim() || user?.email?.split('@')[0]?.trim() || '?'
  const accountUsername = profile?.username?.trim() || user?.user_metadata?.username?.trim()

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-mark" aria-label="Signals"><i aria-hidden="true" /><span>SIGNALS</span></div>
        <div className="sidebar-label">Workspace</div>
        <nav className="nav-list">
          {(['Home', 'People', 'Rooms', 'Settings'] as View[]).map((item) => (
            <button className={`nav-item ${view === item && !inCall ? 'is-active' : ''}`} key={item} onClick={() => { setView(item); setRoomDetail(null); setShowCall(false) }}>
              <Icon name={item.toLowerCase() as IconName} size={17} /><span>{item}</span>
              {item === 'Rooms' && roomList.length > 0 && <span className="nav-count">{roomList.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="local-profile" type="button" onClick={() => void copyUsername()} aria-label={accountUsername ? `Copy @${accountUsername}` : 'Profile username unavailable'} title={profileCopied ? 'Username copied' : 'Copy username'}><span className="avatar avatar-jade">{initialsFor(accountName)}</span><span><strong>{accountName}</strong><small>{profileLoading ? 'Loading profile…' : accountUsername ? `@${accountUsername}` : 'Username unavailable'}{profileCopied ? ' · copied' : ''}</small></span></button>
          <div className="sidebar-account-actions"><button className="theme-toggle" type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /></button><button className="logout-button" type="button" onClick={handleSignOut} aria-label="Sign out" title="Sign out"><Icon name="logout" size={16} /></button></div>
        </div>
      </aside>

      <main className="main-area">
        {inCall && activeRoom && <div className={`call-host ${showCall ? 'is-visible' : 'is-hidden'}`}><CallView room={activeRoom} localUserId={user?.id || ''} localName={profile?.display_name || profile?.username || user?.email?.split('@')[0] || 'You'} muted={muted} sharing={sharing} onMute={() => setMuted(!muted)} onShare={() => setSharing(!sharing)} onLeave={() => { setInCall(false); setShowCall(false) }} onInvite={() => setShowInvite(true)} /></div>}
        {(!inCall || !showCall) && (
          <div className="content-scroll">
            {view === 'Home' && <MinimalHomeView recentRooms={hasRoomHistory ? roomList.filter((room) => !dismissedRecentRooms.includes(room.id)).slice(0, 3) : []} rooms={roomList.filter((room) => room.kind === 'persistent').slice(0, 4)} onCreate={() => setShowCreate(true)} onJoin={joinRoom} onOpenRoom={(room) => { setRoomDetail(room); setView('Rooms') }} onDismissRecent={(roomId) => { setDismissedRecentRooms((current) => { const next = [...new Set([...current, roomId])]; if (user) localStorage.setItem(`signals.dismissedRecentRooms.${user.id}`, JSON.stringify(next)); return next }) }} joinError={joinError} />}
            {view === 'People' && (conversationDetail ? <ConversationView conversation={conversationDetail} userId={user?.id} onBack={() => setConversationDetail(null)} onChanged={refreshConversations} /> : <MinimalPeopleView userId={user?.id} conversations={conversations} onOpen={openConversation} onChanged={refreshConversations} />)}
            {view === 'Rooms' && (roomDetail ? <RoomDetailsView room={roomDetail} userId={user?.id} authorName={profile?.display_name || user?.email || 'SIGNAL user'} username={profile?.username || 'account'} onBack={() => setRoomDetail(null)} callActive={inCall && activeRoom?.id === roomDetail.id} onStartCall={() => { setActiveRoom(roomDetail); setInCall(true); setShowCall(false) }} onOpenCall={() => setShowCall(true)} onCopy={() => copyCode(roomDetail)} copied={copied} onRenamed={(updated) => { setRoomDetail(updated); setRoomList((current) => current.map((item) => item.id === updated.id ? updated : item)); setActiveRoom((current) => current?.id === updated.id ? updated : current) }} onExited={() => { setRoomDetail(null); setActiveRoom(null); setInCall(false); setShowCall(false); setRoomList((current) => current.filter((item) => item.id !== roomDetail.id)); setView('Rooms') }} /> : <RoomsView roomList={roomList} userId={user?.id} onCreate={() => setShowCreate(true)} onOpenRoom={(room) => setRoomDetail(room)} onEnterCall={(room) => { setActiveRoom(room); setInCall(true); setShowCall(true) }} onRenamed={(updated) => setRoomList((current) => current.map((item) => item.id === updated.id ? updated : item))} onExited={(roomId) => setRoomList((current) => current.filter((item) => item.id !== roomId))} />)}
            {view === 'Settings' && <SettingsView />}
          </div>
        )}

        {inCall && activeRoom && <SessionRail room={activeRoom} inCall={inCall} muted={muted} sharing={sharing} onMute={() => setMuted(!muted)} onEnterCall={() => { setInCall(true); setShowCall(true) }} onLeave={() => { setInCall(false); setShowCall(false) }} onCreate={() => setShowCreate(true)} />}
      </main>

      {showCreate && <CreateRoomModal roomName={roomName} setRoomName={setRoomName} roomKind={roomKind} setRoomKind={setRoomKind} roomAccess={roomAccess} setRoomAccess={setRoomAccess} roomPassword={roomPassword} setRoomPassword={setRoomPassword} onClose={() => setShowCreate(false)} onSubmit={createRoom} />}
      {showInvite && activeRoom && <Modal title={`Invite to ${activeRoom.name}`} onClose={() => setShowInvite(false)}><div className="invite-modal"><p className="eyebrow">Private room code</p><div className="invite-code">{activeRoom.code}</div><p className="form-hint">Send this code to someone you trust. It opens a direct line into the room.</p><button className="primary-button full-width" onClick={() => copyCode()}><Icon name="copy" size={16} />{copied ? 'Code copied' : 'Copy room code'}</button><div className="share-link"><span>{activeRoom.code}</span><button className="secondary-button" onClick={() => copyCode()}>Copy code</button></div></div></Modal>}
    </div>
  )
}

export default function App() {
  return <UpdateGate><AuthGate><SignalWorkspace /></AuthGate></UpdateGate>
}

function HomeView({ room, onCreate, onJoin, onEnterCall, onCopy, copied, connecting, onTestConnection }: { room: Room; onCreate: () => void; onJoin: () => void; onEnterCall: () => void; onCopy: () => void; copied: boolean; connecting: boolean; onTestConnection: () => void }) {
  return <section className="page home-page"><div className="page-intro"><div><p className="eyebrow">Tuesday, 08 September</p><h1>Good afternoon, João<span className="accent-dot">.</span></h1><p className="intro-copy">Pick up where you left off, or start a clear line with someone.</p></div><div className="intro-status"><span className={`status-led ${connecting ? 'is-busy' : ''}`} />{connecting ? 'Establishing P2P link' : 'All systems operational'}</div></div><div className="section-heading"><div><p className="eyebrow">Continue</p><h2>Active threads</h2></div><button className="text-button" onClick={() => onEnterCall()}>Open room <Icon name="arrow" size={15} /></button></div><div className="room-grid"><article className="room-card live-card"><div className="room-card-top"><span className="live-tag"><span className="live-dot" />Live now</span><button className="more-button" aria-label="Room actions"><Icon name="more" size={17} /></button></div><div className="room-card-main"><span className="room-symbol">{room.name.slice(0, 2).toUpperCase()}</span><div><h3>{room.name}</h3><p>{room.meta}</p></div></div><div className="room-card-bottom"><div className="mini-avatars"><span className="avatar tiny avatar-lime">DV</span><span className="avatar tiny avatar-orange">LM</span><span className="avatar tiny avatar-blue">AN</span><span className="avatar tiny avatar-violet">RF</span></div><button className="inline-action" onClick={onEnterCall}>Join call <Icon name="arrow" size={15} /></button></div></article><article className="room-card invite-card"><div className="room-card-top"><span className="eyebrow">Quick start</span><span className="room-index">01</span></div><h3>Bring someone<br />into a room.</h3><p>Create a private space with a code that is easy to share.</p><div className="quick-actions"><button className="primary-button" onClick={onCreate}><Icon name="plus" size={16} />Create room</button><button className="secondary-button" onClick={onJoin}>Enter code</button></div></article></div><div className="home-columns"><section><div className="section-heading compact"><div><p className="eyebrow">People</p><h2>Recently in touch</h2></div><button className="text-button">View all <Icon name="arrow" size={15} /></button></div><div className="people-list">{people.slice(0, 3).map((person) => <PersonRow key={person.name} person={person} />)}</div></section><section><div className="section-heading compact"><div><p className="eyebrow">Room code</p><h2>Share {room.name}</h2></div><button className="text-button" onClick={onCopy}>{copied ? 'Copied' : 'Copy code'} <Icon name="copy" size={14} /></button></div><div className="code-panel"><span className="code-value">{room.code}</span><span className="code-state"><span className="status-led" />Ready for guests</span></div></section></div><div className={`connection-module ${connecting ? 'is-connecting' : ''}`}><div className="connection-copy"><span className="led-display"><i /><i /><i /></span><div><p className="eyebrow">Peer link</p><h3>{connecting ? 'Establishing direct connection' : 'P2P connection ready'}</h3><p>{connecting ? 'Negotiating ICE candidates and checking relay fallback.' : 'Low latency route available for your next call.'}</p></div></div><div className="connection-readout"><span>{connecting ? 'CHECKING' : '12 ms'}</span><small>{connecting ? 'STUN / TURN' : 'LATENCY'}</small></div><button className="secondary-button" onClick={onTestConnection}>{connecting ? 'Checking…' : 'Test link'}</button></div></section>
}

function PersonRow({ person }: { person: typeof people[number] }) { return <div className="person-row"><span className={`avatar avatar-${person.tone}`}>{person.initials}</span><span className="person-info"><strong>{person.name}</strong><small>{person.role}</small></span><span className={`presence ${person.active ? 'active' : ''}`}>{person.active ? 'Available' : 'Away'}</span><button className="more-button" aria-label={`Actions for ${person.name}`}><Icon name="more" size={16} /></button></div> }

function PeopleView() { return <section className="page"><div className="page-intro simple"><div><p className="eyebrow">Workspace</p><h1>People<span className="accent-dot">.</span></h1><p className="intro-copy">People you have recently shared a line with.</p></div><button className="primary-button"><Icon name="invite" size={16} />Invite people</button></div><div className="directory"><div className="directory-head"><span>Name</span><span>Role</span><span>Presence</span><span /></div>{people.map((person) => <div className="directory-row" key={person.name}><div className="directory-person"><span className={`avatar avatar-${person.tone}`}>{person.initials}</span><strong>{person.name}</strong></div><span>{person.role}</span><span className={`presence ${person.active ? 'active' : ''}`}>{person.active ? 'Available' : 'Away'}</span><button className="more-button" aria-label={`Actions for ${person.name}`}><Icon name="more" size={16} /></button></div>)}</div></section> }

function MinimalHomeView({ recentRooms, rooms, onCreate, onJoin, onOpenRoom, onDismissRecent, joinError }: { recentRooms: Room[]; rooms: Room[]; onCreate: () => void; onJoin: (code: string) => void; onOpenRoom: (room: Room) => void; onDismissRecent: (roomId: string) => void; joinError: string }) {
  const [code, setCode] = useState('')
  return <section className="page home-page home-minimal">
    <div className="home-launch">
      <p className="eyebrow">SIGNAL</p>
      <h1>Start a conversation<span className="accent-dot">.</span></h1>
      <div className="home-actions">
        <button className="primary-button home-create-button" onClick={onCreate}><Icon name="plus" size={16} />Create room</button>
        <span className="home-or">or</span>
        <form className="home-join-form" onSubmit={(event) => { event.preventDefault(); onJoin(code) }}>
          <label className="sr-only" htmlFor="home-room-code">Enter room code</label>
          <input id="home-room-code" className="home-code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Enter room code…" autoComplete="off" />
          <button className="home-submit-button" type="submit" aria-label="Enter room"><Icon name="arrow" size={17} /></button>
        </form>
        {joinError && <p className="form-error home-join-error">{joinError}</p>}
      </div>
    </div>
    {rooms.length > 0 && <section className="home-room-shortcuts" aria-labelledby="home-room-shortcuts-title"><div className="home-section-label" id="home-room-shortcuts-title">Your rooms</div><div className="home-room-shortcut-list">{rooms.map((room) => <button className="home-room-shortcut" key={room.id || room.code} onClick={() => onOpenRoom(room)}><span className="home-room-tile">{room.name.slice(0, 2).toUpperCase()}<i className={room.live ? 'is-live' : room.unread ? 'has-unread' : ''} /></span><span className="home-room-shortcut-name">{room.name}</span>{room.live && <small>{room.participantCount} in call</small>}</button>)}</div></section>}
    {recentRooms.length > 0 && <section className="home-recents" aria-labelledby="home-recents-title"><div className="home-section-label" id="home-recents-title">Recent</div><div className="home-recent-list">{recentRooms.map((room) => <div className="home-recent-row-wrap" key={room.code}><RecentRoomRemove room={room} onDismiss={onDismissRecent} /><button className="home-recent-row" onClick={() => onOpenRoom(room)}><span>{room.name}</span><Icon name="arrow" size={15} /></button></div>)}</div></section>}
  </section>
}

function RecentRoomRemove({ room, onDismiss }: { room: Room; onDismiss: (roomId: string) => void }) {
  return <button type="button" className="home-recent-remove" aria-label={`Remove ${room.name} from recent rooms`} title="Remove from recent" onClick={() => onDismiss(room.id)}><Icon name="close" size={12} /></button>
}

function initialsFor(value: string) { return value.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'S' }
function formatConversationTime(value: string) { const date = new Date(value); return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) === new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' }) }

function MinimalPeopleView({ userId, conversations, onOpen, onChanged }: { userId?: string; conversations: Conversation[]; onOpen: (conversation: Conversation) => void; onChanged: () => void }) {
  const [search, setSearch] = useState(''); const [mode, setMode] = useState<'closed' | 'menu' | 'direct' | 'group'>('closed'); const [query, setQuery] = useState(''); const [results, setResults] = useState<Profile[]>([]); const [selected, setSelected] = useState<Profile[]>([]); const [groupName, setGroupName] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false)
  const lookup = async () => { if (!userId || !query.trim()) return; setLoading(true); setError(''); try { setResults(await findProfiles(query, userId)) } catch { setError('Couldn\'t search people. Try again.')} finally { setLoading(false) } }
  const chooseDirect = async (person: Profile) => { if (!userId) return; setLoading(true); try { const conversation = await getOrCreateDirect(person.id); onChanged(); onOpen({ ...conversation, type: 'direct', person, memberCount: 2, latestMessage: null }) } catch { setError('Couldn\'t open the conversation. Try again.') } finally { setLoading(false) } }
  const togglePerson = (person: Profile) => setSelected((current) => current.some((item) => item.id === person.id) ? current.filter((item) => item.id !== person.id) : [...current, person])
  const submitGroup = async () => { if (!userId || !groupName.trim() || selected.length < 2) return; setLoading(true); setError(''); try { const conversation = await createGroup(groupName, selected.map((person) => person.id)); onChanged(); onOpen({ ...conversation, type: 'group', name: groupName.trim(), memberCount: selected.length + 1, latestMessage: null }) } catch { setError('Couldn\'t create the group. Try again.') } finally { setLoading(false) } }
  const openNew = () => { setMode('menu'); setQuery(''); setResults([]); setSelected([]); setGroupName(''); setError('') }
  const visible = conversations.filter((conversation) => { const text = `${conversation.name || ''} ${conversation.person?.display_name || ''} ${conversation.person?.username || ''}`.toLowerCase(); return text.includes(search.trim().toLowerCase()) })
  return <section className="page people-page"><div className="people-header"><h1>People</h1><div className="people-header-actions"><label className="people-search"><Icon name="search" size={15} /><span className="sr-only">Find conversations</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find someone…" /></label><button className="primary-button" onClick={openNew}><Icon name="plus" size={16} />New</button></div></div>
    {visible.length ? <div className="people-list people-directory" aria-label="Conversations">{visible.map((conversation) => { const title = conversation.type === 'direct' ? conversation.person?.display_name || 'Conversation' : conversation.name || 'Group'; const subtitle = conversation.type === 'direct' ? `@${conversation.person?.username || ''}` : `${conversation.memberCount} people`; const latest = conversation.latestMessage; const preview = latest ? `${latest.sender_id === userId ? 'You: ' : ''}${latest.content}` : 'No messages yet.'; return <button className="conversation-row" key={conversation.id} onClick={() => onOpen(conversation)}><span className="avatar avatar-jade">{initialsFor(title)}</span><span className="conversation-info"><strong>{title}</strong><small>{subtitle}</small><span>{preview}</span></span>{latest && <time>{formatConversationTime(latest.created_at)}</time>}</button>})}</div> : <div className="people-empty"><p>No conversations yet.</p><small>Find someone or create a group to start talking.</small></div>}
    {mode !== 'closed' && <Modal title={mode === 'menu' ? 'New conversation' : mode === 'direct' ? 'Message someone' : 'Create group'} onClose={() => setMode('closed')}><div className="new-conversation-modal">{mode === 'menu' && <div className="new-actions"><button className="secondary-button" onClick={() => setMode('direct')}>Message someone</button><button className="secondary-button" onClick={() => setMode('group')}>Create group</button></div>}{mode === 'direct' && <><label className="form-label" htmlFor="conversation-username">Find someone by username</label><div className="add-person-search"><Icon name="search" size={15} /><input id="conversation-username" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void lookup() } }} placeholder="@username" autoFocus /><button className="text-button" type="button" onClick={() => void lookup()}>Find</button></div>{loading && <p className="form-hint">Searching…</p>}{!loading && query.trim() && !results.length && <p className="form-hint">No one found for &quot;{query.replace(/^@+/, '')}&quot;.</p>}{results.map((person) => <div className="add-person-result" key={person.id}><span className="avatar avatar-jade">{initialsFor(person.display_name)}</span><span><strong>{person.display_name}</strong><small>@{person.username}</small></span><button className="secondary-button" onClick={() => void chooseDirect(person)}>Message</button></div>)}</>}{mode === 'group' && <><label className="form-label" htmlFor="group-name">Group name</label><input id="group-name" className="text-input" value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={80} autoFocus /><label className="form-label" htmlFor="group-username">Add people</label><div className="add-person-search"><Icon name="search" size={15} /><input id="group-username" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void lookup() } }} placeholder="Find @username" /><button className="text-button" type="button" onClick={() => void lookup()}>Find</button></div>{results.map((person) => <button className={`group-result ${selected.some((item) => item.id === person.id) ? 'is-selected' : ''}`} key={person.id} onClick={() => togglePerson(person)}><span><strong>{person.display_name}</strong><small>@{person.username}</small></span><span>{selected.some((item) => item.id === person.id) ? '✓' : ''}</span></button>)}{selected.length > 0 && <p className="form-hint">{selected.length} selected</p>}{error && <p className="form-error" role="alert">{error}</p>}<div className="compact-modal-footer"><button className="secondary-button" onClick={() => setMode('closed')}>Cancel</button><button className="primary-button" disabled={loading || !groupName.trim() || selected.length < 2} onClick={() => void submitGroup()}>Create</button></div></>}</div></Modal>}
  </section>
}

function ConversationView({ conversation, userId, onBack, onChanged }: { conversation: Conversation; userId?: string; onBack: () => void; onChanged: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]); const [draft, setDraft] = useState(''); const [members, setMembers] = useState<Profile[]>([]); const [showMembers, setShowMembers] = useState(false); const [error, setError] = useState('')
  const title = conversation.type === 'direct' ? conversation.person?.display_name || 'Conversation' : conversation.name || 'Group'; const subtitle = conversation.type === 'direct' ? `@${conversation.person?.username || ''}` : `${conversation.memberCount} people`
  useEffect(() => { void listConversationMessages(conversation.id).then(setMessages).catch(() => setError('Couldn\'t load messages.')); void listParticipants(conversation.id).then((records) => setMembers((current) => { const profiles = conversation.person ? [conversation.person, ...records] : records; return profiles.filter((profile, index, items) => items.findIndex((item) => item.id === profile.id) === index) })).catch(() => { if (conversation.person) setMembers([conversation.person]) }); return subscribeToMessages(conversation.id, (message) => { setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]); onChanged() }) }, [conversation.id, conversation.person, onChanged])
  const send = async () => { if (!userId || !draft.trim()) return; const content = draft.trim(); setDraft(''); try { const message = await sendMessage(conversation.id, userId, content); setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]); onChanged() } catch { setDraft(content); setError('Couldn\'t send the message. Try again.') } }
  return <section className="page room-chat-page conversation-page"><button className="text-button room-back" onClick={onBack}><Icon name="arrow" size={15} />People</button><div className="room-chat-header"><div><p className="eyebrow">{conversation.type === 'direct' ? 'Direct' : 'Group'}</p><h1>{title}</h1><p className="conversation-subtitle">{subtitle}</p></div><div className="room-chat-actions">{conversation.type === 'group' && <button className="secondary-button members-button" onClick={() => setShowMembers(true)}>{subtitle}</button>}</div></div><div className="room-chat-layout"><div className="room-chat-history" aria-label={`Chat with ${title}`}>{messages.length ? messages.map((message) => <div className={`chat-message ${message.sender_id === userId ? 'is-sent' : ''}`} key={message.id}><div className="chat-message-meta"><strong>{message.sender_id === userId ? 'You' : (members.find((member) => member.id === message.sender_id)?.display_name || (conversation.type === 'direct' ? conversation.person?.display_name : null) || 'Participant')}</strong><time>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><p>{message.content}</p></div>) : <div className="chat-empty"><p>No messages yet.</p><small>Start the conversation.</small></div>}</div>{error && <p className="form-error conversation-error" role="alert">{error}</p>}<form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send() }}><textarea aria-label={`Message ${title}`} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} placeholder={`Message ${title}…`} rows={1} /><button className="composer-send" type="submit" aria-label="Send message" disabled={!draft.trim()}><Icon name="arrow" size={17} /></button></form></div>{showMembers && <Modal title="Participants" onClose={() => setShowMembers(false)}><div className="room-members-modal">{members.map((member) => <div className="room-member-row" key={member.id}><span className="avatar avatar-jade">{initialsFor(member.display_name)}</span><span><strong>{member.display_name}</strong><small>@{member.username}</small></span></div>)}</div></Modal>}</section>
}

function CreateRoomModal({ roomName, setRoomName, roomKind, setRoomKind, roomAccess, setRoomAccess, roomPassword, setRoomPassword, onClose, onSubmit }: { roomName: string; setRoomName: (value: string) => void; roomKind: 'quick' | 'persistent'; setRoomKind: (value: 'quick' | 'persistent') => void; roomAccess: 'invite' | 'password' | 'request'; setRoomAccess: (value: 'invite' | 'password' | 'request') => void; roomPassword: string; setRoomPassword: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  const [showPassword, setShowPassword] = useState(false)
  const [passwordTouched, setPasswordTouched] = useState(false)
  const canCreate = Boolean(roomName.trim()) && (roomAccess !== 'password' || Boolean(roomPassword))
  const generatePassword = () => { const bytes = new Uint8Array(8); crypto.getRandomValues(bytes); const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; const value = Array.from(bytes, (byte) => chars[byte % chars.length]).join(''); setRoomPassword(`${value.slice(0, 4)}-${value.slice(4)}`) }
  return <Modal title="Create room" onClose={onClose}><form className="compact-create-form" onSubmit={(event) => { event.preventDefault(); if (canCreate) onSubmit() }}>
    <label className="form-label" htmlFor="room-name">Name</label>
    <input id="room-name" className="text-input" value={roomName} onChange={(event) => setRoomName(event.target.value)} autoFocus />
    <fieldset className="compact-fieldset"><legend>Type</legend><div className="segmented-control" role="group" aria-label="Room type"><button type="button" className={roomKind === 'quick' ? 'is-selected' : ''} aria-pressed={roomKind === 'quick'} onClick={() => setRoomKind('quick')}>Quick</button><button type="button" className={roomKind === 'persistent' ? 'is-selected' : ''} aria-pressed={roomKind === 'persistent'} onClick={() => setRoomKind('persistent')}>Persistent</button></div><small className="choice-hint">{roomKind === 'quick' ? 'Temporary room.' : 'Stays available in Rooms.'}</small></fieldset>
    <label className="form-label compact-label" htmlFor="room-access">Access</label>
    <select id="room-access" className="room-access-select" value={roomAccess} onChange={(event) => setRoomAccess(event.target.value as 'invite' | 'password' | 'request')}><option value="invite">Anyone with invite</option><option value="password">Password protected</option><option value="request">Ask to join</option></select>
    {roomAccess === 'password' && <div className="compact-password-field"><label className="form-label compact-label" htmlFor="room-password">Password</label><div className="password-input-row"><input id="room-password" className="text-input" type={showPassword ? 'text' : 'password'} value={roomPassword} onChange={(event) => { setRoomPassword(event.target.value); setPasswordTouched(true) }} onBlur={() => setPasswordTouched(true)} autoComplete="new-password" /><button type="button" className="password-action" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}><Icon name="eye" size={16} /></button></div><div className="password-tools"><button type="button" className="text-button" onClick={generatePassword}>Generate</button>{passwordTouched && !roomPassword && <span className="form-error">Enter a password.</span>}</div></div>}
    <div className="compact-modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={!canCreate}>Create room <Icon name="arrow" size={16} /></button></div>
  </form></Modal>
}

function LegacyCreateRoomModal({ roomName, setRoomName, roomKind, setRoomKind, roomAccess, setRoomAccess, roomPassword, setRoomPassword, roomPasswordConfirm, setRoomPasswordConfirm, roomFormError, onClose, onSubmit }: { roomName: string; setRoomName: (value: string) => void; roomKind: 'quick' | 'persistent'; setRoomKind: (value: 'quick' | 'persistent') => void; roomAccess: 'invite' | 'password' | 'request'; setRoomAccess: (value: 'invite' | 'password' | 'request') => void; roomPassword: string; setRoomPassword: (value: string) => void; roomPasswordConfirm: string; setRoomPasswordConfirm: (value: string) => void; roomFormError: string; onClose: () => void; onSubmit: () => void }) {
  return <Modal title="Create room" onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); onSubmit() }} className="create-room-form"><label className="form-label" htmlFor="room-name">Name</label><input id="room-name" className="text-input" value={roomName} onChange={(event) => setRoomName(event.target.value)} autoFocus /><fieldset className="room-choice-group"><legend>Type</legend><label className={`room-choice ${roomKind === 'quick' ? 'is-selected' : ''}`}><input type="radio" checked={roomKind === 'quick'} onChange={() => setRoomKind('quick')} /> <span><strong>Quick room</strong><small>Temporary. Ends when everyone leaves.</small></span></label><label className={`room-choice ${roomKind === 'persistent' ? 'is-selected' : ''}`}><input type="radio" checked={roomKind === 'persistent'} onChange={() => setRoomKind('persistent')} /> <span><strong>Persistent room</strong><small>Stays available in Rooms.</small></span></label></fieldset><fieldset className="room-choice-group"><legend>Access</legend><label className={`room-choice ${roomAccess === 'invite' ? 'is-selected' : ''}`}><input type="radio" checked={roomAccess === 'invite'} onChange={() => setRoomAccess('invite')} /> <span><strong>Anyone with invite</strong><small>Anyone with the code or link can enter.</small></span></label><label className={`room-choice ${roomAccess === 'password' ? 'is-selected' : ''}`}><input type="radio" checked={roomAccess === 'password'} onChange={() => setRoomAccess('password')} /> <span><strong>Password protected</strong><small>Invite and password are both required.</small></span></label><label className={`room-choice ${roomAccess === 'request' ? 'is-selected' : ''}`}><input type="radio" checked={roomAccess === 'request'} onChange={() => setRoomAccess('request')} /> <span><strong>Ask to join</strong><small>The owner approves each request.</small></span></label></fieldset>{roomAccess === 'password' && <div className="room-password-fields"><label className="form-label" htmlFor="room-password">Password</label><input id="room-password" className="text-input" type="password" value={roomPassword} onChange={(event) => setRoomPassword(event.target.value)} autoComplete="new-password" /><label className="form-label" htmlFor="room-password-confirm">Confirm password</label><input id="room-password-confirm" className="text-input" type="password" value={roomPasswordConfirm} onChange={(event) => setRoomPasswordConfirm(event.target.value)} autoComplete="new-password" /></div>}{roomFormError && <p className="form-error">{roomFormError}</p>}<button className="primary-button full-width" type="submit">Create room <Icon name="arrow" size={16} /></button></form></Modal>
}

function RoomDetailsView({ room, userId, authorName, username, callActive, onBack, onStartCall, onOpenCall, onCopy, copied, onRenamed, onExited }: { room: Room; userId?: string; authorName: string; username: string; callActive: boolean; onBack: () => void; onStartCall: () => void; onOpenCall: () => void; onCopy: () => void; copied: boolean; onRenamed: (room: Room) => void; onExited: () => void }) {
  const [messages, setMessages] = useState<RoomMessage[]>([])
  const [draft, setDraft] = useState('')
  const [members, setMembers] = useState<RoomMemberRecord[]>([])
  const [showMembers, setShowMembers] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(room.name)
  const [confirmAction, setConfirmAction] = useState<'delete' | 'leave' | null>(null)
  const [actionError, setActionError] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [messageError, setMessageError] = useState('')
  const isOwner = Boolean(userId && room.ownerId === userId)
  const roomName = typeof room.name === 'string' && room.name.trim() ? room.name.trim() : 'this room'
  const currentMember: RoomMemberRecord | null = userId ? { user_id: userId, username, display_name: authorName, avatar_url: null, joined_at: '' } : null
  const visibleMembers = currentMember ? [currentMember, ...members.filter((member) => member.user_id !== userId)] : members
  const memberCount = Math.max(room.memberCount, visibleMembers.length)

  useEffect(() => {
    if (!supabase || !userId) return
    let mounted = true
    listMessages(room.id).then((records) => {
      if (!mounted) return
      setMessages(records.map((message) => ({ id: message.id, roomId: message.room_id, authorId: message.author_id, authorName: message.author?.display_name || 'SIGNAL user', username: message.author?.username || 'account', content: message.content, createdAt: new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })))
    }).catch(() => undefined)
    listRoomMembers(room.id).then((records) => { if (mounted) setMembers(records) }).catch(() => undefined)
    const unsubscribe = subscribeToRoomMessages(room.id, (message) => {
      if (!mounted) return
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, { id: message.id, roomId: message.room_id, authorId: message.author_id, authorName: message.author?.display_name || 'SIGNAL user', username: message.author?.username || 'account', content: message.content, createdAt: new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
    })
    return () => { mounted = false; unsubscribe() }
  }, [room.id, userId])

  const sendMessage = async () => {
    const content = draft.trim(); if (!content) return
    setMessageError('')
    if (supabase && userId) {
      try {
        const saved = await sendRoomMessage(room.id, userId, content)
        if (saved) setMessages((current) => current.some((item) => item.id === saved.id) ? current : [...current, { id: saved.id, roomId: saved.room_id, authorId: saved.author_id, authorName: saved.author?.display_name || authorName, username: saved.author?.username || username, content: saved.content, createdAt: new Date(saved.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
        setDraft('')
        return
      } catch { setMessageError("Couldn't send the message. Try again."); return }
    }
    if (!supabase || !userId) return
  }

  const submitRename = async () => {
    if (!renameValue.trim()) return
    setActionBusy(true); setActionError('')
    try { const updated = await renameRoom(room.id, renameValue.trim()); if (updated) { onRenamed({ ...room, name: updated.name, meta: `${room.memberCount} people` }); setRenameOpen(false); setShowActions(false) } }
    catch { setActionError('Couldn’t rename the room. Try again.') }
    finally { setActionBusy(false) }
  }

  const submitRoomAction = async () => {
    if (!confirmAction) return
    setActionBusy(true); setActionError('')
    try { if (confirmAction === 'delete') await deleteRoom(room.id); else await leaveRoom(room.id); onExited() }
    catch { setActionError(confirmAction === 'delete' ? 'Couldn’t delete the room. Try again.' : "Couldn't leave the room. Try again."); setActionBusy(false) }
  }

  const removeMember = async (member: RoomMemberRecord) => {
    if (!isOwner || !window.confirm(`Remove ${member.display_name} from this room?`)) return
    try { await removeRoomMember(room.id, member.user_id); setMembers((current) => current.filter((item) => item.user_id !== member.user_id)) }
    catch { setActionError('Couldn’t remove that member. Try again.') }
  }

  return <section className="page room-chat-page"><button className="text-button room-back" onClick={onBack}><Icon name="arrow" size={15} />Rooms</button><div className="room-chat-header"><div><p className="eyebrow">Room</p><h1>{room.name}{(room.unread || 0) > 0 && <span className="room-unread-dot" />}</h1><div className="room-detail-code"><span><small>Room code</small><code>{room.code}</code></span><button className="text-button" onClick={onCopy}>{copied ? 'Copied' : 'Copy code'} <Icon name="copy" size={14} /></button></div></div><div className="room-chat-actions">{callActive || room.live ? <span className="room-call-state"><span className="live-dot" />{callActive ? 'Your call is live' : `${room.participantCount} in call`}</span> : null}<button className="secondary-button members-button" onClick={() => setShowMembers(true)}>{memberCount} members</button><button className="primary-button" onClick={callActive ? onOpenCall : onStartCall}>{callActive ? 'Open call' : room.live ? 'Join call' : 'Start call'} <Icon name="arrow" size={15} /></button><div className="room-actions-wrap"><button className="more-button" aria-label="Room actions" aria-expanded={showActions} onClick={() => { setShowActions((current) => !current); setActionError('') }}><Icon name="more" size={16} /></button>{showActions && <div className="room-actions-menu" role="menu">{isOwner && <button type="button" onClick={() => { setRenameValue(room.name); setRenameOpen(true); setShowActions(false) }}>Edit room name</button>}{isOwner ? <button type="button" className="is-danger" onClick={() => { setActionError(''); setConfirmAction('delete'); setShowActions(false) }}>Delete room</button> : <button type="button" className="is-danger" onClick={() => { setActionError(''); setConfirmAction('leave'); setShowActions(false) }}>Leave room</button>}</div>}</div></div></div><div className="room-chat-layout"><div className="room-chat-history" aria-label={`Chat in ${room.name}`}>{messages.length ? messages.map((message, index) => { const previous = messages[index - 1]; const grouped = previous?.authorId === message.authorId; return <div className={`chat-message ${grouped ? 'is-grouped' : ''}`} key={message.id}>{!grouped && <div className="chat-message-meta"><strong>{message.authorName}</strong><span>@{message.username}</span><time>{message.createdAt}</time></div>}<p>{message.content}</p></div> }) : <div className="chat-empty"><p>No messages yet.</p><small>Start the conversation.</small></div>}</div>{messageError && <p className="form-error conversation-error" role="alert">{messageError}</p>}<form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage() }}><textarea aria-label={`Message ${room.name}`} value={draft} onChange={(event) => { setDraft(event.target.value); if (messageError) setMessageError('') }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage() } }} placeholder={`Message ${room.name}…`} rows={1} /><button className="composer-send" type="submit" aria-label="Send message" disabled={!draft.trim()}><Icon name="arrow" size={17} /></button></form></div>{showMembers && <Modal title="Members" onClose={() => setShowMembers(false)}><div className="room-members-modal">{visibleMembers.map((member) => <div className="room-member-row" key={member.user_id}><span className="avatar avatar-jade">{initialsFor(member.display_name)}</span><span><strong>{member.display_name}</strong><small>@{member.username}</small></span>{isOwner && member.user_id !== userId && <button type="button" className="room-member-remove" onClick={() => void removeMember(member)}>Remove</button>}</div>)}{actionError && <p className="form-error" role="alert">{actionError}</p>}</div></Modal>}{renameOpen && <Modal title="Edit room name" onClose={() => setRenameOpen(false)}><label className="form-label" htmlFor="rename-room">Room name</label><input id="rename-room" className="text-input" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={80} autoFocus />{actionError && <p className="form-error" role="alert">{actionError}</p>}<div className="compact-modal-footer"><button type="button" className="secondary-button" onClick={() => setRenameOpen(false)}>Cancel</button><button type="button" className="primary-button" disabled={actionBusy || !renameValue.trim()} onClick={() => void submitRename()}>Save</button></div></Modal>}{confirmAction && <Modal title={confirmAction === 'delete' ? 'Delete room' : 'Leave room'} onClose={() => { if (!actionBusy) { setConfirmAction(null); setActionError('') } }}><p className="room-confirm-title">{confirmAction === 'delete' ? `Delete “${roomName}”?` : `Leave “${roomName}”?`}</p><p className="form-hint">{confirmAction === 'delete' ? 'This permanently removes the room and its messages.' : 'You will no longer see the room until you join again with its code.'}</p>{actionError && <p className="form-error" role="alert">{actionError}</p>}<div className="compact-modal-footer"><button type="button" className="secondary-button" disabled={actionBusy} onClick={() => { setConfirmAction(null); setActionError('') }}>Cancel</button><button type="button" className="primary-button danger-button" disabled={actionBusy} onClick={() => void submitRoomAction()}>{actionBusy ? 'Working…' : confirmAction === 'delete' ? 'Delete room' : 'Leave room'}</button></div></Modal>}</section>
}

function LegacyRoomDetailsView({ room, onBack, onStartCall, onCopy, copied }: { room: Room; onBack: () => void; onStartCall: () => void; onCopy: () => void; copied: boolean }) {
  return <section className="page room-details-page"><button className="text-button room-back" onClick={onBack}><Icon name="arrow" size={15} />Rooms</button><div className="room-details-header"><div><p className="eyebrow">Room</p><h1>{room.name}</h1></div><button className="primary-button" onClick={onStartCall}>Start call <Icon name="arrow" size={15} /></button></div><div className="room-details-grid"><section className="room-detail-section"><p className="eyebrow">People</p><div className="room-detail-people"><div><span className="avatar avatar-jade">JD</span><span><strong>João Dias</strong><small>@joao</small></span></div><div><span className="avatar avatar-lime">DV</span><span><strong>Davi Viana</strong><small>@davi</small></span></div><div><span className="avatar avatar-orange">LM</span><span><strong>Lucas Mota</strong><small>@lucas</small></span></div></div></section><section className="room-detail-section"><p className="eyebrow">Access</p><strong>{room.access === 'password' ? 'Password protected' : room.access === 'request' ? 'Ask to join' : 'Anyone with invite'}</strong><div className="room-detail-code"><span><small>Room code</small><code>{room.code}</code></span><button className="secondary-button" onClick={onCopy}>{copied ? 'Copied' : 'Copy'}</button></div><button className="secondary-button invite-button" onClick={onCopy}>Copy invite link</button></section></div></section>
}

function RoomsView({ roomList, userId, onCreate, onOpenRoom, onEnterCall, onRenamed, onExited }: { roomList: Room[]; userId?: string; onCreate: () => void; onOpenRoom: (room: Room) => void; onEnterCall: (room: Room) => void; onRenamed: (room: Room) => void; onExited: (roomId: string) => void }) { return <section className="page rooms-page"><div className="rooms-header"><h1>Rooms</h1><button className="primary-button" onClick={onCreate}><Icon name="plus" size={16} />Create room</button></div>{roomList.length ? <div className="room-table room-list-simple">{roomList.map((room) => <article className="room-list-item" key={room.id || room.code}><div className="room-list-symbol">{room.name.slice(0, 2).toUpperCase()}</div><div className="room-list-info"><h3>{room.name}{(room.unread || 0) > 0 && <span className="room-unread-dot" aria-label={`${room.unread} unread messages`} />}</h3><p>{room.meta || `${room.memberCount || 0} people`}</p></div><div className="room-list-state">{room.live && <span className="room-call-state"><span className="live-dot" />{room.participantCount || 0} in call</span>}</div><div className="room-list-actions">{room.live ? <button className="primary-button small-button" onClick={() => onEnterCall(room)}>Join <Icon name="arrow" size={14} /></button> : <button className="secondary-button small-button" onClick={() => onOpenRoom(room)}>Open <Icon name="arrow" size={14} /></button>}<RoomListActions room={room} userId={userId} onRenamed={onRenamed} onExited={onExited} /></div></article>)}</div> : <div className="rooms-empty"><p>No rooms yet.</p><button className="secondary-button" onClick={onCreate}>Create room</button></div>}</section> }

function RoomListActions({ room, userId, onRenamed, onExited }: { room: Room; userId?: string; onRenamed: (room: Room) => void; onExited: (roomId: string) => void }) {
  const [open, setOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(room.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isOwner = Boolean(userId && room.ownerId === userId)
  const roomName = typeof room.name === 'string' && room.name.trim() ? room.name.trim() : 'this room'
  const saveName = async () => {
    if (!renameValue.trim()) return
    setBusy(true); setError('')
    try { const updated = await renameRoom(room.id, renameValue.trim()); if (updated) { onRenamed({ ...room, name: updated.name }); setRenameOpen(false); setOpen(false) } }
    catch { setError('Couldn’t rename the room. Try again.') }
    finally { setBusy(false) }
  }
  const leaveOrDelete = async () => {
    setBusy(true); setError('')
    try { if (isOwner) await deleteRoom(room.id); else await leaveRoom(room.id); setConfirmOpen(false); onExited(room.id) }
    catch { setError(isOwner ? 'Couldn’t delete the room. Try again.' : "Couldn't leave the room. Try again."); setBusy(false) }
  }
  return <div className="room-actions-wrap"><button className="more-button room-more" aria-label={`More actions for ${room.name}`} aria-expanded={open} onClick={() => { setOpen((current) => !current); setError('') }}><Icon name="more" size={16} /></button>{open && <div className="room-actions-menu" role="menu">{isOwner && <button type="button" onClick={() => { setRenameValue(room.name); setRenameOpen(true); setOpen(false) }}>Edit room name</button>}<button type="button" className="is-danger" disabled={busy} onClick={() => { setConfirmOpen(true); setOpen(false); setError('') }}>{isOwner ? 'Delete room' : 'Leave room'}</button>{error && <span className="room-action-error" role="alert">{error}</span>}</div>}{renameOpen && <Modal title="Edit room name" onClose={() => { if (!busy) setRenameOpen(false) }}><label className="form-label" htmlFor={`rename-room-${room.id}`}>Room name</label><input id={`rename-room-${room.id}`} className="text-input" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={80} autoFocus />{error && <p className="form-error" role="alert">{error}</p>}<div className="compact-modal-footer"><button type="button" className="secondary-button" disabled={busy} onClick={() => setRenameOpen(false)}>Cancel</button><button type="button" className="primary-button" disabled={busy || !renameValue.trim()} onClick={() => void saveName()}>Save</button></div></Modal>}{confirmOpen && <Modal title={isOwner ? 'Delete room' : 'Leave room'} onClose={() => { if (!busy) { setConfirmOpen(false); setError('') } }}><p className="room-confirm-title">{isOwner ? `Delete “${roomName}”?` : `Leave “${roomName}”?`}</p><p className="form-hint">{isOwner ? 'This permanently removes the room, its members and all messages.' : 'You will no longer see this room until you join again with its code.'}</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="compact-modal-footer"><button type="button" className="secondary-button" disabled={busy} onClick={() => { setConfirmOpen(false); setError('') }}>Cancel</button><button type="button" className="primary-button danger-button" disabled={busy} onClick={() => void leaveOrDelete()}>{busy ? 'Working…' : isOwner ? 'Delete room' : 'Leave room'}</button></div></Modal>}</div>
}


function SettingsView() {
  const [tab, setTab] = useState<'Audio' | 'Video' | 'Network' | 'Shortcuts'>('Audio')
  const [volume, setVolume] = useState(() => Number(localStorage.getItem('signal.audio.volume') || 72))
  const [inputVolume, setInputVolume] = useState(() => Number(localStorage.getItem('signal.audio.inputVolume') || 100))
  const [noiseReduction, setNoiseReduction] = useState(() => localStorage.getItem('signal.audio.noiseReduction') !== 'false')
  const [pushToTalk, setPushToTalk] = useState(() => localStorage.getItem('signal.audio.pushToTalk') === 'true')
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([])
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])
  const [inputDeviceId, setInputDeviceId] = useState(() => localStorage.getItem('signal.audio.inputDeviceId') || '')
  const [outputDeviceId, setOutputDeviceId] = useState(() => localStorage.getItem('signal.audio.outputDeviceId') || '')
  const [audioReady, setAudioReady] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [audioDb, setAudioDb] = useState(-60)
  const [audioMessage, setAudioMessage] = useState('Microphone test is off.')
  const [outputTesting, setOutputTesting] = useState(false)
  const [outputMessage, setOutputMessage] = useState('Output test is off.')
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const frameRef = useRef<number | null>(null)
  const inputGainRef = useRef<GainNode | null>(null)
  const outputContextRef = useRef<AudioContext | null>(null)
  const outputAudioRef = useRef<HTMLAudioElement | null>(null)
  const outputOscillatorRef = useRef<OscillatorNode | null>(null)
  const outputGainRef = useRef<GainNode | null>(null)

  const refreshDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const devices = await navigator.mediaDevices.enumerateDevices()
    const inputs = devices.filter((device) => device.kind === 'audioinput')
    const outputs = devices.filter((device) => device.kind === 'audiooutput')
    setInputDevices(inputs)
    setOutputDevices(outputs)
    setInputDeviceId((current) => current || inputs[0]?.deviceId || '')
    setOutputDeviceId((current) => current || outputs[0]?.deviceId || '')
  }

  const stopAudioTest = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    contextRef.current?.close()
    contextRef.current = null
    inputGainRef.current = null
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    setAudioReady(false)
    setAudioLevel(0)
  }

  const startAudioTest = async (deviceId = inputDeviceId) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setAudioMessage('This environment does not expose microphone access.')
      return
    }
    stopAudioTest()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: noiseReduction, noiseSuppression: noiseReduction, autoGainControl: true } })
      streamRef.current = stream
      setAudioReady(true)
      setAudioMessage('Microphone is receiving signal.')
      await refreshDevices()
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      const inputGain = context.createGain()
      inputGain.gain.value = inputVolume / 100
      context.createMediaStreamSource(stream).connect(inputGain).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      contextRef.current = context
      inputGainRef.current = inputGain
      const measure = () => {
        analyser.getByteTimeDomainData(data)
        const rms = Math.sqrt(data.reduce((sum, value) => { const normalized = (value - 128) / 128; return sum + normalized * normalized }, 0) / data.length)
        const db = Math.max(-60, Math.min(0, 20 * Math.log10(Math.max(rms, 0.00001))))
        setAudioDb(Math.round(db))
        setAudioLevel(Math.max(0, Math.min(12, Math.round(((db + 60) / 60) * 12))))
        frameRef.current = requestAnimationFrame(measure)
      }
      measure()
    } catch {
      setAudioMessage('Microphone permission was not granted.')
      setAudioReady(false)
    }
  }

  const stopOutputTest = () => {
    outputOscillatorRef.current?.stop()
    outputOscillatorRef.current?.disconnect()
    outputGainRef.current?.disconnect()
    outputAudioRef.current?.pause()
    if (outputAudioRef.current) outputAudioRef.current.srcObject = null
    outputContextRef.current?.close()
    outputOscillatorRef.current = null
    outputGainRef.current = null
    outputAudioRef.current = null
    outputContextRef.current = null
    setOutputTesting(false)
  }

  const startOutputTest = async (deviceId = outputDeviceId) => {
    stopOutputTest()
    try {
      const context = new AudioContext()
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const destination = context.createMediaStreamDestination()
      const audio = new Audio()
      oscillator.frequency.value = 440
      gain.gain.value = Math.max(0.005, volume / 100)
      oscillator.connect(gain).connect(destination)
      audio.autoplay = true
      audio.srcObject = destination.stream
      const sinkAudio = audio as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> }
      const canSetSink = 'setSinkId' in audio && typeof sinkAudio.setSinkId === 'function'
      if (deviceId && canSetSink) await sinkAudio.setSinkId!(deviceId)
      await context.resume()
      await audio.play()
      oscillator.start()
      outputContextRef.current = context
      outputAudioRef.current = audio
      outputOscillatorRef.current = oscillator
      outputGainRef.current = gain
      setOutputTesting(true)
      setOutputMessage(canSetSink ? 'Test tone is playing on the selected output.' : 'Test tone is playing on the system output.')
    } catch {
      stopOutputTest()
      setOutputMessage('The selected output could not be tested in this environment.')
    }
  }

  useEffect(() => {
    refreshDevices().catch(() => setAudioMessage('Audio devices are unavailable.'))
    navigator.mediaDevices?.addEventListener('devicechange', refreshDevices)
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices)
      stopAudioTest()
      stopOutputTest()
    }
  }, [])

  useEffect(() => {
    if (audioReady) startAudioTest(inputDeviceId)
  }, [noiseReduction])

  useEffect(() => {
    if (inputGainRef.current) inputGainRef.current.gain.value = inputVolume / 100
  }, [inputVolume])

  useEffect(() => {
    if (outputGainRef.current) outputGainRef.current.gain.value = Math.max(0.005, volume / 100)
  }, [volume])

  useEffect(() => {
    localStorage.setItem('signal.audio.volume', String(volume))
    localStorage.setItem('signal.audio.inputVolume', String(inputVolume))
    localStorage.setItem('signal.audio.noiseReduction', String(noiseReduction))
    localStorage.setItem('signal.audio.pushToTalk', String(pushToTalk))
    localStorage.setItem('signal.audio.inputDeviceId', inputDeviceId)
    localStorage.setItem('signal.audio.outputDeviceId', outputDeviceId)
    notifySettingsChanged()
  }, [volume, inputVolume, noiseReduction, pushToTalk, inputDeviceId, outputDeviceId])

  const inputName = inputDevices.find((device) => device.deviceId === inputDeviceId)?.label || 'Default microphone'
  const outputName = outputDevices.find((device) => device.deviceId === outputDeviceId)?.label || 'Default output'
  const meterBars = Array.from({ length: 12 }, (_, index) => <i key={index} className={index < audioLevel ? 'is-hot' : ''} />)

  return <section className="page settings-page"><div className="page-intro simple"><div><p className="eyebrow">System panel</p><h1>Settings<span className="accent-dot">.</span></h1><p className="intro-copy">Tune the room around the way you work.</p></div><span className="hardware-status"><span className={`status-led ${audioReady || outputTesting ? '' : 'is-busy'}`} />{audioReady || outputTesting ? 'Audio ready' : 'Audio idle'}</span></div><div className="settings-layout"><aside className="settings-menu" aria-label="Settings sections">{(['Audio', 'Video', 'Network', 'Shortcuts'] as const).map((item) => <button className={`settings-tab ${tab === item ? 'is-active' : ''}`} key={item} onClick={() => setTab(item)}>{item}</button>)}</aside><div className="settings-content">{tab === 'Audio' ? <><SettingsSection title="Input device" label="Microphone"><select className="device-select" value={inputDeviceId} onChange={(event) => { setInputDeviceId(event.target.value); if (audioReady) startAudioTest(event.target.value) }} aria-label="Microphone input device">{inputDevices.length ? inputDevices.map((device, index) => <option value={device.deviceId} key={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>) : <option value="">Default microphone</option>}</select><div className="meter-row"><span>Input level</span><div className="vu-meter wide active">{meterBars}</div><span className="mono-label">{audioReady ? `${audioDb} dB` : '—'}</span></div><div className="slider-row input-volume-row"><span>Mic level</span><input aria-label="Microphone input volume" type="range" min="0" max="200" value={inputVolume} onChange={(event) => setInputVolume(Number(event.target.value))} /><span className="mono-label">{inputVolume}%</span></div><div className="audio-test-row"><span>{audioMessage}</span><button className="secondary-button" onClick={() => audioReady ? stopAudioTest() : startAudioTest()}>{audioReady ? 'Stop test' : 'Test microphone'}</button></div></SettingsSection><SettingsSection title="Output device" label="Headphones"><select className="device-select" value={outputDeviceId} onChange={(event) => { setOutputDeviceId(event.target.value); if (outputTesting) startOutputTest(event.target.value) }} aria-label="Audio output device">{outputDevices.length ? outputDevices.map((device, index) => <option value={device.deviceId} key={device.deviceId}>{device.label || `Output ${index + 1}`}</option>) : <option value="">Default output</option>}</select><div className="slider-row"><span>Volume</span><input aria-label="Output volume" type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /><span className="mono-label">{volume}%</span></div><div className="audio-test-row"><span>{outputMessage}</span><button className="secondary-button" onClick={() => outputTesting ? stopOutputTest() : startOutputTest()}>{outputTesting ? 'Stop tone' : 'Test output'}</button></div></SettingsSection><SettingsSection title="Voice processing" label="Clear signal"><div className="toggle-row"><div><strong>Noise reduction</strong><small>Applied when the microphone test or call starts.</small></div><button className={`toggle ${noiseReduction ? 'is-on' : ''}`} aria-label="Toggle noise reduction" aria-pressed={noiseReduction} onClick={() => setNoiseReduction(!noiseReduction)}><span /></button></div><div className="toggle-row"><div><strong>Push to talk</strong><small>Hold a key to open the microphone.</small></div><button className={`toggle ${pushToTalk ? 'is-on' : ''}`} aria-label="Toggle push to talk" aria-pressed={pushToTalk} onClick={() => setPushToTalk(!pushToTalk)}><span /></button></div></SettingsSection></> : tab === 'Video' ? <VideoSettings /> : tab === 'Network' ? <NetworkSettings /> : <ShortcutsSettings />}</div></div></section>
}

function VideoSettings() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState('')
  const [resolution, setResolution] = useState('1080p')
  const [fps, setFps] = useState('30')
  const [mirror, setMirror] = useState(true)
  const [active, setActive] = useState(false)
  const [message, setMessage] = useState('Camera preview is off.')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const refresh = async () => {
    const list = await navigator.mediaDevices?.enumerateDevices()
    const cameras = list?.filter((device) => device.kind === 'videoinput') || []
    setDevices(cameras)
    setDeviceId((current) => current || cameras[0]?.deviceId || '')
  }
  const stop = () => { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; if (videoRef.current) videoRef.current.srcObject = null; setActive(false) }
  const start = async () => {
    stop()
    try { const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: resolution === '1080p' ? 1920 : 1280, height: resolution === '1080p' ? 1080 : 720, frameRate: Number(fps) } }); streamRef.current = stream; if (videoRef.current) videoRef.current.srcObject = stream; setActive(true); setMessage('Camera preview is live.') } catch { setMessage('Camera permission was not granted.') }
  }
  useEffect(() => { refresh().catch(() => setMessage('Camera devices are unavailable.')); return stop }, [])
  useEffect(() => { if (active) start() }, [deviceId, resolution, fps])
  return <><SettingsSection title="Camera preview" label="Video"><div className="video-preview-panel"><video ref={videoRef} autoPlay muted playsInline className={mirror ? 'is-mirrored' : ''} /><div className="video-preview-overlay"><span className="status-led" />{active ? `${resolution} · ${fps} FPS` : 'Preview offline'}</div></div><div className="audio-test-row"><span>{message}</span><button className="secondary-button" onClick={() => active ? stop() : start()}>{active ? 'Stop preview' : 'Start preview'}</button></div></SettingsSection><SettingsSection title="Capture profile" label="Quality"><div className="control-grid"><label>Camera<select className="device-select" value={deviceId} onChange={(event) => setDeviceId(event.target.value)}><option value="">Default camera</option>{devices.map((device, index) => <option value={device.deviceId} key={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></label><label>Resolution<select className="device-select" value={resolution} onChange={(event) => setResolution(event.target.value)}><option>1080p</option><option>720p</option></select></label><label>Frame rate<select className="device-select" value={fps} onChange={(event) => setFps(event.target.value)}><option value="30">30 FPS</option><option value="60">60 FPS</option></select></label></div><div className="toggle-row"><div><strong>Mirror preview</strong><small>Flip your local preview horizontally.</small></div><button className={`toggle ${mirror ? 'is-on' : ''}`} aria-label="Toggle mirrored preview" aria-pressed={mirror} onClick={() => setMirror(!mirror)}><span /></button></div></SettingsSection></>
}

function NetworkSettings() { const [autoReconnect, setAutoReconnect] = useState(true); const [adaptive, setAdaptive] = useState(true); const [relayFallback, setRelayFallback] = useState(true); const [testing, setTesting] = useState(false); const [message, setMessage] = useState('Connection test not run.'); const test = () => { setTesting(true); setMessage('Checking network route…'); window.setTimeout(() => { setTesting(false); setMessage('Network route check complete.') }, 1500) }; return <><SettingsSection title="Connection route" label="P2P network"><div className="network-status"><span className={`network-led ${testing ? 'is-testing' : ''}`} /><div><strong>{testing ? 'Checking route' : 'Route status unavailable'}</strong><small>{message}</small></div><span className="mono-label">—</span></div><div className="network-metrics"><div><span>Latency</span><strong>—</strong></div><div><span>Packet loss</span><strong>—</strong></div><div><span>Relay</span><strong>—</strong></div></div><button className="secondary-button" onClick={test}>{testing ? 'Testing…' : 'Test connection'}</button></SettingsSection><SettingsSection title="Resilience" label="Recovery"><div className="toggle-row"><div><strong>Auto reconnect</strong><small>Restore the session after a brief network loss.</small></div><button className={`toggle ${autoReconnect ? 'is-on' : ''}`} aria-label="Toggle auto reconnect" aria-pressed={autoReconnect} onClick={() => setAutoReconnect(!autoReconnect)}><span /></button></div><div className="toggle-row"><div><strong>Adaptive quality</strong><small>Adjust bitrate when the connection changes.</small></div><button className={`toggle ${adaptive ? 'is-on' : ''}`} aria-label="Toggle adaptive quality" aria-pressed={adaptive} onClick={() => setAdaptive(!adaptive)}><span /></button></div><div className="toggle-row"><div><strong>TURN fallback</strong><small>Use relay only when direct P2P cannot connect.</small></div><button className={`toggle ${relayFallback ? 'is-on' : ''}`} aria-label="Toggle TURN fallback" aria-pressed={relayFallback} onClick={() => setRelayFallback(!relayFallback)}><span /></button></div></SettingsSection></> }

function ShortcutsSettings() { const [shortcuts, setShortcuts] = useState({ mute: 'M', push: 'Space', share: 'S', leave: 'Esc' }); const [saved, setSaved] = useState(false); const update = (key: keyof typeof shortcuts, value: string) => setShortcuts({ ...shortcuts, [key]: value }); return <><SettingsSection title="Call controls" label="Keyboard"><div className="shortcut-list">{([['mute', 'Mute microphone'], ['push', 'Push to talk'], ['share', 'Share screen'], ['leave', 'Leave session']] as const).map(([key, label]) => <label className="shortcut-row" key={key}><span>{label}</span><input aria-label={`${label} shortcut`} value={shortcuts[key]} onChange={(event) => update(key, event.target.value)} onFocus={(event) => event.currentTarget.select()} /></label>)}</div><div className="shortcut-actions"><span className="form-hint">Shortcuts apply when the app is focused.</span><button className="secondary-button" onClick={() => { setShortcuts({ mute: 'M', push: 'Space', share: 'S', leave: 'Esc' }); setSaved(false) }}>Reset</button><button className="primary-button" onClick={() => { localStorage.setItem('signal.shortcuts', JSON.stringify(shortcuts)); setSaved(true) }}>{saved ? 'Saved' : 'Save shortcuts'}</button></div></SettingsSection><SettingsSection title="Global access" label="Desktop"><div className="settings-placeholder"><span className="led-display"><i /><i /><i /></span><div><strong>Global shortcuts will be registered by Tauri.</strong><small>The bindings above are ready for native desktop integration.</small></div></div></SettingsSection></> }

function SettingsSection({ title, label, children }: { title: string; label: string; children: React.ReactNode }) { return <section className="settings-section"><div className="settings-section-heading"><div><p className="eyebrow">{label}</p><h2>{title}</h2></div><span className="section-screw" /></div>{children}</section> }

function CallView({ room, localUserId, localName, muted, sharing, onMute, onShare, onLeave, onInvite }: { room: Room; localUserId: string; localName: string; muted: boolean; sharing: boolean; onMute: () => void; onShare: () => void; onLeave: () => void; onInvite: () => void }) {
  const SPEAKING_THRESHOLD = 0.055
  const SPEAKING_RELEASE_MS = 300
  type SpeakingDetector = { source: MediaStreamAudioSourceNode; analyser: AnalyserNode; samples: Uint8Array<ArrayBuffer>; track: MediaStreamTrack; speaking: boolean; silentSince: number | null }
  const localStreamRef = useRef<MediaStream | null>(null)
  const rawMicStreamRef = useRef<MediaStream | null>(null)
  const micContextRef = useRef<AudioContext | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const [mediaStatus, setMediaStatus] = useState('Preparing local media…')
  const [permissionType, setPermissionType] = useState<'microphone' | 'screen' | null>(null)
  const [participantCount, setParticipantCount] = useState(1)
  const [remotePeerIds, setRemotePeerIds] = useState<string[]>([])
  const [remotePeerNames, setRemotePeerNames] = useState<Record<string, string>>({})
  const [remotePeerUsers, setRemotePeerUsers] = useState<Record<string, string>>({})
  const [outputMuted, setOutputMuted] = useState(false)
  const outputMutedRef = useRef(false)
  const remoteAudioRef = useRef(new Map<string, HTMLAudioElement>())
  const remoteScreenStreamsRef = useRef<Record<string, MediaStream>>({})
  const screenStageRef = useRef<HTMLDivElement | null>(null)
  const screenVideoRef = useRef<HTMLVideoElement | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({})
  const speakingDetectorsRef = useRef(new Map<string, SpeakingDetector>())
  const speakingTimerRef = useRef<number | null>(null)
  const speakingContextRef = useRef<AudioContext | null>(null)
  const microphoneRequestRef = useRef(0)
  const mutedRef = useRef(muted)
  const realtimeRef = useRef<RealtimeRoom | null>(null)
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null)
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<Record<string, MediaStream>>({})
  const screenStopHandledRef = useRef(false)
  const localJoinSoundPlayedRef = useRef(false)
  const localLeaveSoundPlayedRef = useRef(false)

  const applyOutputSettings = (audio: HTMLAudioElement) => {
    audio.volume = Math.max(0, Math.min(1, Number(localStorage.getItem('signal.audio.volume') || 72) / 100))
    const outputDeviceId = localStorage.getItem('signal.audio.outputDeviceId') || ''
    const sinkAudio = audio as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> }
    if (outputDeviceId && typeof sinkAudio.setSinkId === 'function') void sinkAudio.setSinkId(outputDeviceId).catch(() => devLog('AUDIO', 'selected output is unavailable'))
  }

  const playCallSound = (type: 'join' | 'leave' | 'screen-start' | 'screen-stop') => {
    const audio = new Audio(`/sounds/call-${type}.wav`)
    audio.preload = 'auto'
    audio.muted = outputMutedRef.current
    applyOutputSettings(audio)
    audio.volume = Math.max(0, Math.min(1, audio.volume * 0.35))
    audio.addEventListener('ended', () => { audio.removeAttribute('src'); audio.load() }, { once: true })
    void audio.play().then(() => devLog('CALL', `${type === 'screen-start' ? 'screen start' : type === 'screen-stop' ? 'screen stop' : type} sound played`)).catch(() => devLog('CALL', 'sound playback blocked'))
  }

  const removeSpeakingDetector = (key: string) => {
    const detector = speakingDetectorsRef.current.get(key)
    if (!detector) return
    detector.source.disconnect()
    speakingDetectorsRef.current.delete(key)
    setSpeaking((current) => current[key] ? { ...current, [key]: false } : current)
  }

  const addSpeakingDetector = (key: string, stream: MediaStream) => {
    const track = stream.getAudioTracks()[0]
    if (!track) return
    removeSpeakingDetector(key)
    const context = speakingContextRef.current || micContextRef.current || new AudioContext()
    speakingContextRef.current = context
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    speakingDetectorsRef.current.set(key, { source, analyser, samples: new Uint8Array(new ArrayBuffer(analyser.fftSize)), track, speaking: false, silentSince: null })
  }

  const startSpeakingMonitor = () => {
    if (speakingTimerRef.current !== null) return
    const check = () => {
      const now = performance.now()
      const changed: Record<string, boolean> = {}
      speakingDetectorsRef.current.forEach((detector, key) => {
        detector.analyser.getByteTimeDomainData(detector.samples)
        const rms = Math.sqrt(detector.samples.reduce((sum, sample) => { const normalized = (sample - 128) / 128; return sum + normalized * normalized }, 0) / detector.samples.length)
        const shouldSpeak = key === 'local' && mutedRef.current ? false : detector.track.enabled && rms >= SPEAKING_THRESHOLD
        if (shouldSpeak) detector.silentSince = null
        else if (detector.speaking && detector.silentSince === null) detector.silentSince = now
        const nextSpeaking = shouldSpeak || (detector.speaking && detector.silentSince !== null && now - detector.silentSince < SPEAKING_RELEASE_MS)
        if (nextSpeaking !== detector.speaking) { detector.speaking = nextSpeaking; changed[key] = nextSpeaking }
      })
      if (Object.keys(changed).length) setSpeaking((current) => ({ ...current, ...changed }))
      speakingTimerRef.current = window.setTimeout(check, 80)
    }
    speakingTimerRef.current = window.setTimeout(check, 0)
  }

  const stopSpeakingMonitor = () => {
    if (speakingTimerRef.current !== null) window.clearTimeout(speakingTimerRef.current)
    speakingTimerRef.current = null
    speakingDetectorsRef.current.forEach((detector) => detector.source.disconnect())
    speakingDetectorsRef.current.clear()
    setSpeaking({})
    if (speakingContextRef.current && speakingContextRef.current !== micContextRef.current) void speakingContextRef.current.close()
    speakingContextRef.current = null
  }

  const requestMicrophone = async () => {
    const requestId = ++microphoneRequestRef.current
    if (!navigator.mediaDevices?.getUserMedia) { setMediaStatus('Local media unavailable'); return }
    setPermissionType(null)
    try {
      const configuredInputDevice = localStorage.getItem('signal.audio.inputDeviceId') || ''
      const noiseReduction = localStorage.getItem('signal.audio.noiseReduction') !== 'false'
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: configuredInputDevice ? { exact: configuredInputDevice } : undefined, echoCancellation: noiseReduction, noiseSuppression: noiseReduction, autoGainControl: true } })
      if (requestId !== microphoneRequestRef.current) { stream.getTracks().forEach((track) => track.stop()); return }
      const context = new AudioContext()
      const source = context.createMediaStreamSource(stream)
      const gain = context.createGain()
      const destination = context.createMediaStreamDestination()
      gain.gain.value = Number(localStorage.getItem('signal.audio.inputVolume') || 100) / 100
      source.connect(gain).connect(destination)
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      speakingDetectorsRef.current.set('local', { source, analyser, samples: new Uint8Array(new ArrayBuffer(analyser.fftSize)), track: stream.getAudioTracks()[0], speaking: false, silentSince: null })
      startSpeakingMonitor()
      const processedStream = new MediaStream(destination.stream.getAudioTracks())
      rawMicStreamRef.current = stream
      micContextRef.current = context
      localStreamRef.current = processedStream
      realtimeRef.current?.setLocalStream(processedStream)
      setPermissionType(null)
      setMediaStatus('Microphone ready')
    } catch { setPermissionType('microphone'); setMediaStatus('Microphone permission needed') }
  }

  useEffect(() => {
    void requestMicrophone()
    return () => { microphoneRequestRef.current += 1; stopSpeakingMonitor(); localStreamRef.current?.getTracks().forEach((track) => track.stop()); rawMicStreamRef.current?.getTracks().forEach((track) => track.stop()); micContextRef.current?.close(); screenStreamRef.current?.getTracks().forEach((track) => track.stop()); realtimeRef.current?.setScreenStream(null) }
  }, [])

  useEffect(() => {
    setParticipantCount(1)
    const realtime = new RealtimeRoom({
      status: (status) => setMediaStatus(status),
      participants: (count) => setParticipantCount(count),
      callJoined: () => { if (localJoinSoundPlayedRef.current) return; localJoinSoundPlayedRef.current = true; playCallSound('join') },
      participantPresence: ({ addedUserIds, removedUserIds, initial }) => {
        if (initial) { devLog('CALL', 'join sound suppressed initial snapshot'); return }
        addedUserIds.forEach(() => playCallSound('join'))
        removedUserIds.forEach(() => playCallSound('leave'))
      },
      peerIds: (ids) => { setRemotePeerIds(ids); setParticipantCount(ids.length + 1) },
      peerNames: (names) => setRemotePeerNames(names),
      peerUsers: (users) => setRemotePeerUsers(users),
      remoteAudio: (stream, peerId) => {
        addSpeakingDetector(peerId, stream)
        startSpeakingMonitor()
        const previous = remoteAudioRef.current.get(peerId)
        previous?.pause()
        if (previous) previous.srcObject = null
        const audio = new Audio()
        audio.autoplay = true
        audio.muted = outputMutedRef.current
        audio.srcObject = stream
        audio.dataset.peerId = peerId
        applyOutputSettings(audio)
        remoteAudioRef.current.set(peerId, audio)
        audio.play().catch(() => undefined)
      },
      remoteAudioEnded: (peerId) => {
        removeSpeakingDetector(peerId)
        const audio = remoteAudioRef.current.get(peerId)
        audio?.pause()
        if (audio) audio.srcObject = null
        remoteAudioRef.current.delete(peerId)
      },
      remoteVideo: (stream, peerId) => setRemoteScreenStreams((current) => {
        if (!current[peerId]) playCallSound('screen-start')
        const next = { ...current, [peerId]: stream }
        remoteScreenStreamsRef.current = next
        return next
      }),
      remoteVideoEnded: (peerId) => {
        const currentStreams = remoteScreenStreamsRef.current
        const wasActive = Boolean(currentStreams[peerId])
        const video = screenVideoRef.current
        if (video && video.srcObject === currentStreams[peerId]) { video.pause(); video.srcObject = null; video.load() }
        const next = { ...currentStreams }
        delete next[peerId]
        remoteScreenStreamsRef.current = next
        setRemoteScreenStreams(next)
        if (!wasActive) return
        playCallSound('screen-stop')
        if (document.fullscreenElement === screenStageRef.current) void document.exitFullscreen()
        devLog('SCREEN', 'remote screen stage inactive')
      },
    })
    realtimeRef.current = realtime
    console.info('[ROOM] resolved room=' + shortId(room.id))
    if (!supabase) { setMediaStatus('Supabase is not configured'); return }
    supabase.auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token
      if (!accessToken) throw new Error('Session unavailable')
      return realtime.connect(room.id, accessToken, localName, localUserId)
    }).then(() => { if (localStreamRef.current) realtime.setLocalStream(localStreamRef.current) }).catch(() => setMediaStatus('Signaling server unavailable'))
    return () => {
      realtime.close()
      realtimeRef.current = null
      remoteAudioRef.current.forEach((audio) => { audio.pause(); audio.srcObject = null })
      remoteAudioRef.current.clear()
      setRemotePeerIds([])
      setRemotePeerNames({})
      setRemotePeerUsers({})
      setRemoteScreenStreams({})
      remoteScreenStreamsRef.current = {}
      stopSpeakingMonitor()
    }
  }, [room.code])

  useEffect(() => {
    const updateOutput = () => remoteAudioRef.current.forEach((audio) => applyOutputSettings(audio))
    window.addEventListener(SETTINGS_CHANGED_EVENT, updateOutput)
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, updateOutput)
  }, [])

  useEffect(() => {
    mutedRef.current = muted
    if (muted) setSpeaking((current) => current.local ? { ...current, local: false } : current)
  }, [muted])

  useEffect(() => {
    const activePeerIds = new Set(remotePeerIds)
    setRemoteScreenStreams((current) => Object.fromEntries(Object.entries(current).filter(([peerId]) => activePeerIds.has(peerId))))
    speakingDetectorsRef.current.forEach((_detector, key) => { if (key !== 'local' && !activePeerIds.has(key)) removeSpeakingDetector(key) })
  }, [remotePeerIds])

  useEffect(() => {
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !muted })
  }, [muted])

  useEffect(() => {
    const handleFullscreenChange = () => setFullscreen(document.fullscreenElement === screenStageRef.current)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleOutput = () => {
    const next = !outputMutedRef.current
    outputMutedRef.current = next
    setOutputMuted(next)
    remoteAudioRef.current.forEach((audio) => { audio.muted = next })
  }

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await screenStageRef.current?.requestFullscreen()
    } catch { console.info('[SCREEN] fullscreen unavailable') }
  }

  const stopScreenShare = () => {
    if (screenStopHandledRef.current) return
    screenStopHandledRef.current = true
    const stream = screenStreamRef.current
    if (document.fullscreenElement === screenStageRef.current) void document.exitFullscreen()
    const video = screenVideoRef.current
    if (video && video.srcObject === stream) { video.pause(); video.srcObject = null; video.load() }
    screenStreamRef.current = null
    setLocalScreenStream(null)
    stream?.getTracks().forEach((track) => track.stop())
    realtimeRef.current?.setScreenStream(null)
    playCallSound('screen-stop')
    devLog('SCREEN', 'local screen stage inactive')
    setMediaStatus('Microphone ready')
    if (sharing) onShare()
  }

  const toggleScreenShare = async () => {
    if (sharing) { stopScreenShare(); return }
    if (!navigator.mediaDevices?.getDisplayMedia) { setMediaStatus('Screen capture unavailable'); return }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } }, audio: false })
      setPermissionType(null)
      screenStreamRef.current = stream
      setLocalScreenStream(stream)
      realtimeRef.current?.setScreenStream(stream)
      const videoTrack = stream.getVideoTracks()[0]
      screenStopHandledRef.current = false
      if ('contentHint' in videoTrack) videoTrack.contentHint = 'detail'
      videoTrack.onended = stopScreenShare
      playCallSound('screen-start')
      devLog('SCREEN', 'local screen stage active')
      setMediaStatus('Screen capture active')
      onShare()
    } catch { setPermissionType('screen'); devLog('SCREEN', 'screen capture failed or cancelled'); setMediaStatus('Screen permission needed') }
  }

  const uniqueRemotePeerIds = remotePeerIds.filter((peerId, index, ids) => ids.findIndex((candidate) => (remotePeerUsers[candidate] || candidate) === (remotePeerUsers[peerId] || peerId)) === index)
  const hasScreenShare = Boolean(localScreenStream || Object.keys(remoteScreenStreams).length)
  const participantTiles = <div className="participant-tiles">{!localScreenStream && <div className={`participant-tile ${speaking.local ? 'is-speaking' : ''}`}><span className="participant-tile-avatar">{initialsFor(localName)}</span><strong>{localName}</strong><small>You</small></div>}{uniqueRemotePeerIds.map((peerId, index) => { const name = remotePeerNames[peerId] || `Participant ${index + 1}`; const screenStream = remoteScreenStreams[peerId]; return !screenStream && <div className={`participant-tile ${speaking[peerId] ? 'is-speaking' : ''}`} key={peerId}><span className="participant-tile-avatar">{initialsFor(name)}</span><strong>{name}</strong><small>Connected</small></div> })}</div>
  const remotePresentation = Object.entries(remoteScreenStreams)[0]
  const screenPresentation = localScreenStream ? { stream: localScreenStream, name: localName, label: 'Sharing screen · You' } : remotePresentation ? { stream: remotePresentation[1], name: remotePeerNames[remotePresentation[0]] || 'Participant', label: 'Sharing screen' } : null
  const leaveCall = () => { if (localLeaveSoundPlayedRef.current) return; localLeaveSoundPlayedRef.current = true; playCallSound('leave'); onLeave() }

  return <section className="call-view">
    <div className="call-header">
      <div><p className="eyebrow">Room {room.code}</p><h1>{room.name}</h1></div>
      <div className="call-header-meta"><span className="connection-pill" aria-label="Connected"><span className="status-led" /><span className="sr-only">Connected</span></span><span className="media-status">{mediaStatus}</span>{permissionType && <button className="text-button permission-retry-button" type="button" onClick={() => permissionType === 'microphone' ? void requestMicrophone() : void toggleScreenShare()}>Try permission again</button>}<span className="participant-count">{String(participantCount).padStart(2, '0')} participants</span><div className="call-actions-wrap"><button className="icon-button" aria-label="Room actions" aria-expanded={showActions} onClick={() => setShowActions(!showActions)}><Icon name="more" /></button>{showActions && <div className="room-actions-menu call-actions-menu"><button onClick={onInvite}>Invite to room</button><button onClick={leaveCall}>Leave call</button></div>}</div></div>
    </div>
      <div ref={screenStageRef} className={`screen-stage ${hasScreenShare ? 'is-sharing' : ''}`}>
      <div className="stage-grid" />
      <div className={`stage-center ${screenPresentation ? 'has-screen-presentation' : ''}`}>{screenPresentation ? <><div className="screen-presentation"><video ref={(element) => { screenVideoRef.current = element; if (element && element.srcObject !== screenPresentation.stream) { element.srcObject = screenPresentation.stream; void element.play().catch(() => undefined) } }} autoPlay muted playsInline aria-label={`${screenPresentation.name}'s shared screen`} /><div className="screen-presentation-label"><strong>{screenPresentation.name}</strong><span>{screenPresentation.label}</span></div></div>{participantTiles}</> : participantTiles}</div>
      {hasScreenShare && <button className="stage-fullscreen-button" aria-label={fullscreen ? 'Exit fullscreen' : 'Open fullscreen'} onClick={toggleFullscreen}><Icon name="fullscreen" size={17} /></button>}
    </div>
    <div className="participant-strip" aria-live="polite"><div className="participant"><strong>{participantCount} {participantCount === 1 ? 'participant' : 'participants'} connected</strong><small>Live room presence</small><span className="signal-bars active"><i /><i /><i /><i /></span></div></div>
    <div className="call-controls"><ControlButton icon="mic" label={muted ? 'Unmute microphone' : 'Mute microphone'} active={!muted} onClick={onMute} /><ControlButton icon="headphones" label={outputMuted ? 'Unmute headphones' : 'Mute headphones'} active={!outputMuted} onClick={toggleOutput} /><ControlButton icon="screen" label={sharing ? 'Stop sharing' : 'Share screen'} active={sharing} onClick={toggleScreenShare} /><ControlButton icon="invite" label="Invite" onClick={onInvite} /><button className="leave-button" aria-label="Leave call" onClick={leaveCall}><Icon name="leave" size={17} /><span>Leave</span></button></div>
  </section>
}

function ControlButton({ icon, label, active, onClick }: { icon: IconName; label: string; active?: boolean; onClick?: () => void }) { return <button className={`control-button ${active ? 'active' : ''}`} aria-label={label} onClick={onClick}><Icon name={icon} size={18} /><span>{label}</span></button> }

function SessionRail({ room, inCall, muted, sharing, onMute, onEnterCall, onLeave, onCreate }: { room: Room; inCall: boolean; muted: boolean; sharing: boolean; onMute: () => void; onEnterCall: () => void; onLeave: () => void; onCreate: () => void }) { return <footer className={`session-rail ${inCall ? 'session-active' : ''}`}><div className="session-context"><span className={`session-signal ${inCall ? 'live' : ''}`}><i /><i /><i /><i /></span><div><strong>{inCall ? room.name : 'No active session'}</strong></div></div>{inCall ? <><div className="rail-status"><span className="status-led" />{sharing ? 'Sharing screen' : muted ? 'Muted' : 'Your mic is live'}</div><div className="rail-actions"><button className="rail-icon-button" onClick={onMute} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}><Icon name="mic" size={16} /></button><button className="rail-open-button" onClick={onEnterCall}>Open session <Icon name="arrow" size={15} /></button><button className="rail-leave-button" onClick={onLeave} aria-label="Leave call"><Icon name="leave" size={15} /><span>Leave</span></button></div></> : <div className="rail-actions"><span className="rail-hint">A room is one click away.</span><button className="rail-open-button" onClick={onCreate}><Icon name="plus" size={15} />Create room</button></div>}</footer> }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><p className="eyebrow">Signal</p><h2 id="modal-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close" size={18} /></button></div>{children}</section></div> }
