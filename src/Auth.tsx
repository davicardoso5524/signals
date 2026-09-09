import { createContext, FormEvent, ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { authRedirectUrl, Profile, supabase } from './lib/supabase'

type AuthMode = 'login' | 'register' | 'forgot' | 'recovery'
type AuthContextValue = { session: Session | null; user: User | null; profile: Profile | null; loading: boolean; signOut: () => Promise<void> }

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthGate')
  return context
}

function friendlyError(message: string) {
  const text = message.toLowerCase()
  if (text.includes('invalid login') || text.includes('invalid credentials')) return 'Email or password is incorrect.'
  if (text.includes('already registered') || text.includes('already been registered')) return 'This email is already registered. Sign in instead.'
  if (text.includes('duplicate') || text.includes('unique') || text.includes('username')) return 'That username is already taken. Choose another one.'
  if (text.includes('password')) return 'Use a stronger password with at least 6 characters.'
  if (text.includes('rate limit') || text.includes('too many')) return 'Too many attempts. Wait a moment and try again.'
  if (text.includes('network') || text.includes('fetch')) return 'The connection failed. Check your network and try again.'
  return 'Something went wrong. Check your details and try again.'
}

function validateUsername(value: string) {
  return /^[a-z0-9._]{3,20}$/.test(value)
}

function AuthForm({ initialMode = 'login', onRecoveryComplete }: { initialMode?: AuthMode; onRecoveryComplete?: () => void }) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [usernameState, setUsernameState] = useState<'idle' | 'available' | 'taken'>('idle')

  useEffect(() => { setError(''); setMessage('') }, [mode])

  const normalizedUsername = username.trim().toLowerCase().replace(/^@/, '')
  useEffect(() => {
    let cancelled = false
    if (mode !== 'register' || !validateUsername(normalizedUsername) || !supabase) { setUsernameState('idle'); return }
    const client = supabase
    const timeout = window.setTimeout(async () => {
      const { data } = await client.from('profiles').select('id').eq('username', normalizedUsername).maybeSingle()
      if (!cancelled) setUsernameState(data ? 'taken' : 'available')
    }, 320)
    return () => { cancelled = true; window.clearTimeout(timeout) }
  }, [mode, normalizedUsername])

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('')
    if (!supabase) { setError('Supabase is not configured yet. Add the public VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY values.'); return }
    if (mode === 'register' && (!displayName.trim() || !validateUsername(normalizedUsername))) { setError('Enter a name and a username with 3–20 lowercase letters, numbers, dots or underscores.'); return }
    if (mode === 'register' && usernameState === 'taken') { setError('@' + normalizedUsername + ' is already taken.'); return }
    setBusy(true)
    try {
      if (mode === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectUrl })
        if (resetError) throw resetError
        setMessage('If that email has an account, a reset link is on its way.')
      } else if (mode === 'recovery') {
        const { error: updateError } = await supabase.auth.updateUser({ password })
        if (updateError) throw updateError
        setMessage('Your password has been updated. You can continue using SIGNAL.')
        onRecoveryComplete?.()
      } else if (mode === 'login') {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (loginError) throw loginError
      } else {
        const { data, error: registerError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { display_name: displayName.trim(), username: normalizedUsername }, emailRedirectTo: authRedirectUrl },
        })
        if (registerError) throw registerError
        if (!data.session) setMessage('Check your email to confirm your account, then return to SIGNAL.')
      }
    } catch (submitError) { setError(friendlyError(submitError instanceof Error ? submitError.message : '')) }
    finally { setBusy(false) }
  }

  const title = mode === 'login' ? 'Welcome back.' : mode === 'register' ? 'Create your account.' : mode === 'recovery' ? 'Choose a new password.' : 'Reset your password.'
  return <main className="auth-shell"><section className="auth-panel" aria-labelledby="auth-title"><div className="auth-brand"><span className="brand-pulse" />SIGNAL</div><h1 id="auth-title">{title}</h1>{mode === 'forgot' && <p className="auth-copy">Enter your email and we’ll send a secure recovery link.</p>}
    <form className="auth-form" onSubmit={submit} noValidate>
      {mode === 'register' && <><label className="auth-label" htmlFor="display-name">Name</label><input id="display-name" className="text-input" value={displayName} onChange={e => setDisplayName(e.target.value)} autoComplete="name" required /></>}
      {mode === 'register' && <><label className="auth-label" htmlFor="username">Username</label><div className="auth-username"><span>@</span><input id="username" className="text-input" value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._@]/g, ''))} autoComplete="username" aria-describedby="username-hint" required /></div><p id="username-hint" className={`auth-status ${usernameState}`}>{usernameState === 'available' ? `✓ @${normalizedUsername} available` : usernameState === 'taken' ? `@${normalizedUsername} is already taken` : '3–20 lowercase characters, numbers, dots or underscores'}</p></>}
      <label className="auth-label" htmlFor="email">Email</label><input id="email" className="text-input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
      {mode !== 'forgot' && mode !== 'recovery' && <><label className="auth-label" htmlFor="password">Password</label><div className="auth-password"><input id="password" className="text-input" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" minLength={6} required /><button type="button" className="password-action" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}><span className="sr-only">{showPassword ? 'Hide password' : 'Show password'}</span><span aria-hidden="true">{showPassword ? 'Hide' : 'Show'}</span></button></div></>}
      {mode === 'recovery' && <><label className="auth-label" htmlFor="password">New password</label><div className="auth-password"><input id="password" className="text-input" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={6} required /><button type="button" className="password-action" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}><span className="sr-only">{showPassword ? 'Hide password' : 'Show password'}</span><span aria-hidden="true">{showPassword ? 'Hide' : 'Show'}</span></button></div></>}
      {mode === 'login' && <button type="button" className="auth-link auth-forgot" onClick={() => setMode('forgot')}>Forgot password</button>}
      {error && <p className="form-error auth-message" role="alert">{error}</p>}{message && <p className="auth-success" role="status">{message}</p>}
      <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? 'Working…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : mode === 'recovery' ? 'Update password' : 'Send reset link'}</button>
    </form>
    {mode !== 'recovery' && <p className="auth-switch">{mode === 'forgot' ? <button className="auth-link" onClick={() => setMode('login')}>Back to sign in</button> : mode === 'login' ? <>Don't have an account? <button className="auth-link" onClick={() => setMode('register')}>Create account</button></> : <>Already have an account? <button className="auth-link" onClick={() => setMode('login')}>Sign in</button></>}</p>}
  </section></main>
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(false)
  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => setSession(data.session)).finally(() => setLoading(false))
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => { setSession(nextSession); if (event === 'PASSWORD_RECOVERY') setRecovering(true) })
    return () => listener.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!supabase || !session?.user) { setProfile(null); return }
    supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle().then(({ data }) => setProfile(data as Profile | null))
  }, [session?.user?.id])
  const value = useMemo(() => ({ session, user: session?.user || null, profile, loading, signOut: async () => { await supabase?.auth.signOut() } }), [session, profile, loading])
  if (loading) return <main className="auth-shell"><div className="auth-loading">SIGNAL<span className="status-led is-busy" /></div></main>
  if (!session) return <AuthContext.Provider value={value}><AuthForm /></AuthContext.Provider>
  if (recovering) return <AuthContext.Provider value={value}><AuthForm initialMode="recovery" onRecoveryComplete={() => setRecovering(false)} /></AuthContext.Provider>
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
