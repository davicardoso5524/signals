import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Profile = { id: string; username: string; display_name: string; avatar_url: string | null }
export type ConversationType = 'direct' | 'group'
export type Message = { id: string; conversation_id: string; sender_id: string; content: string; created_at: string }
export type Conversation = { id: string; type: ConversationType; name: string | null; created_by: string; created_at: string; last_message_at: string | null; person?: Profile; memberCount: number; latestMessage: Message | null; latestAuthor?: Profile }

function api() { if (!supabase) throw new Error('Supabase is not configured'); return supabase }

export async function findProfiles(username: string, currentUserId: string) {
  const normalized = username.trim().replace(/^@+/, '').toLowerCase()
  if (!normalized) return [] as Profile[]
  const { data, error } = await api().from('profiles').select('id,username,display_name,avatar_url').eq('username', normalized).neq('id', currentUserId).limit(10)
  if (error) throw error
  return (data || []) as Profile[]
}

export async function getOrCreateDirect(targetUserId: string) {
  const { data, error } = await api().rpc('get_or_create_direct_conversation', { target_user_id: targetUserId }).single()
  if (error) throw error
  return data as Conversation
}

export async function createGroup(name: string, participantIds: string[]) {
  const { data, error } = await api().rpc('create_group_conversation', { group_name: name.trim(), participant_ids: participantIds }).single()
  if (error) throw error
  return data as Conversation
}

export async function deleteConversationForMe(conversationId: string) {
  const { error } = await api().rpc('delete_signal_conversation_for_me', { target_conversation_id: conversationId })
  if (error) throw error
}

export async function listConversations(currentUserId: string) {
  const client = api()
  const { data: memberships, error: memberError } = await client.from('conversation_participants').select('conversation_id,deleted_at').eq('user_id', currentUserId).is('deleted_at', null)
  if (memberError) throw memberError
  const ids = (memberships || []).map((row) => row.conversation_id as string)
  if (!ids.length) return [] as Conversation[]
  const [{ data: rows, error: conversationError }, { data: participants, error: participantsError }, { data: messages, error: messageError }] = await Promise.all([
    client.from('conversations').select('id,type,name,created_by,created_at,last_message_at').in('id', ids),
    client.from('conversation_participants').select('conversation_id,user_id,deleted_at').in('conversation_id', ids),
    client.from('messages').select('id,conversation_id,sender_id,content,created_at').in('conversation_id', ids).order('created_at', { ascending: false }),
  ])
  if (conversationError) throw conversationError
  if (participantsError) throw participantsError
  if (messageError) throw messageError
  const otherIds = (rows || []).filter((row) => row.type === 'direct').map((row) => (participants || []).find((participant) => participant.conversation_id === row.id && participant.user_id !== currentUserId)?.user_id).filter(Boolean) as string[]
  const authorIds = (messages || []).map((message) => message.sender_id as string)
  const profileIds = [...new Set([...otherIds, ...authorIds])]
  const { data: profiles, error: profileError } = profileIds.length ? await client.from('profiles').select('id,username,display_name,avatar_url').in('id', profileIds) : { data: [], error: null }
  if (profileError) throw profileError
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile as Profile]))
  const latestByConversation = new Map<string, Message>()
  for (const message of messages || []) if (!latestByConversation.has(message.conversation_id)) latestByConversation.set(message.conversation_id, message as Message)
  return (rows || []).map((row) => {
    const conversationParticipants = (participants || []).filter((participant) => participant.conversation_id === row.id && participant.deleted_at === null)
    const otherId = conversationParticipants.find((participant) => participant.user_id !== currentUserId)?.user_id
    const latestMessage = latestByConversation.get(row.id) || null
    return { ...row, person: row.type === 'direct' ? profileById.get(otherId || '') : undefined, memberCount: conversationParticipants.length, latestMessage, latestAuthor: latestMessage ? profileById.get(latestMessage.sender_id) : undefined }
  }).sort((a, b) => new Date(b.last_message_at || b.created_at).getTime() - new Date(a.last_message_at || a.created_at).getTime()) as Conversation[]
}

export function subscribeToConversationChanges(onChange: () => void) {
  const client = supabase
  if (!client) return () => undefined
  const channel: RealtimeChannel = client.channel('signal-conversations-list')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_participants' }, onChange)
    .subscribe()
  return () => { void client.removeChannel(channel) }
}

export async function listMessages(conversationId: string) {
  const { data, error } = await api().from('messages').select('id,conversation_id,sender_id,content,created_at').eq('conversation_id', conversationId).order('created_at', { ascending: true })
  if (error) throw error
  return (data || []) as Message[]
}

export async function listParticipants(conversationId: string) {
  const client = api()
  const { data: members, error } = await client.from('conversation_participants').select('user_id').eq('conversation_id', conversationId)
  if (error) throw error
  const ids = (members || []).map((member) => member.user_id as string)
  if (!ids.length) return [] as Profile[]
  const { data, error: profileError } = await client.from('profiles').select('id,username,display_name,avatar_url').in('id', ids)
  if (profileError) throw profileError
  return (data || []) as Profile[]
}

export async function sendMessage(conversationId: string, senderId: string, content: string) {
  const { data, error } = await api().from('messages').insert({ conversation_id: conversationId, sender_id: senderId, content: content.trim() }).select('id,conversation_id,sender_id,content,created_at').single()
  if (error) throw error
  return data as Message
}

export function subscribeToMessages(conversationId: string, onMessage: (message: Message) => void) {
  const channel: RealtimeChannel = api().channel(`conversation-messages:${conversationId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => onMessage(payload.new as Message))
  void channel.subscribe()
  return () => { void api().removeChannel(channel) }
}
