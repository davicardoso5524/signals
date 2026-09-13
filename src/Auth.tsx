import { createContext, FormEvent, ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { authRedirectUrl, Profile, supabase } from './lib/supabase'

type AuthMode = 'login' | 'forgot' | 'recovery'
type AuthContextValue = { session: Session | null; user: User | null; profile: Profile | null; profileLoading: boolean; loading: boolean; refreshProfile: () => Promise<void>; signOut: () => Promise<void> }

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthGate')
  return context
}

function friendlyError(message: string) {
  const text = message.toLowerCase()
  if (text.includes('invalid login') || text.includes('invalid credentials')) return 'Email or password is incorrect.'
  if (text.includes('password')) return 'Use a stronger password with at least 6 characters.'
  if (text.includes('rate limit') || text.includes('too many')) return 'Too many attempts. Wait a moment and try again.'
  if (text.includes('network') || text.includes('fetch')) return 'The connection failed. Check your network and try again.'
  return 'Something went wrong. Check your details and try again.'
}

function AuthForm({ initialMode = 'login', onRecoveryComplete }: { initialMode?: AuthMode; onRecoveryComplete?: () => void }) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { setError(''); setMessage('') }, [mode])

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('')
    if (!supabase) { setError('Supabase is not configured yet. Add the public VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY values.'); return }
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
      }
    } catch (submitError) { setError(friendlyError(submitError instanceof Error ? submitError.message : '')) }
    finally { setBusy(false) }
  }

  const title = mode === 'login' ? 'Sign in' : mode === 'recovery' ? 'Choose a new password.' : 'Reset your password.'
  return <main className="auth-shell"><section className="auth-panel" aria-labelledby="auth-title"><div className="auth-brand"><img src="/signals.png" alt="Signals" /></div><h1 id="auth-title">{title}</h1>{mode === 'forgot' && <p className="auth-copy">Enter your email and we’ll send a secure recovery link.</p>}
    <form className="auth-form" onSubmit={submit} noValidate>
      <>
      <label className="auth-label" htmlFor="email">Email</label><input id="email" className="text-input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
      {mode !== 'forgot' && mode !== 'recovery' && <><label className="auth-label" htmlFor="password">Password</label><div className="auth-password"><input id="password" className="text-input" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" minLength={6} required /><button type="button" className="password-action" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}><span className="sr-only">{showPassword ? 'Hide password' : 'Show password'}</span><span aria-hidden="true">{showPassword ? 'Hide' : 'Show'}</span></button></div></>}
      {mode === 'recovery' && <><label className="auth-label" htmlFor="password">New password</label><div className="auth-password"><input id="password" className="text-input" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={6} required /><button type="button" className="password-action" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}><span className="sr-only">{showPassword ? 'Hide password' : 'Show password'}</span><span aria-hidden="true">{showPassword ? 'Hide' : 'Show'}</span></button></div></>}</>
      {mode === 'login' && <button type="button" className="auth-link auth-forgot" onClick={() => setMode('forgot')}>Forgot password</button>}
      {error && <p className="form-error auth-message" role="alert">{error}</p>}{message && <p className="auth-success" role="status">{message}</p>}
      <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? 'Working…' : mode === 'login' ? 'Continue' : mode === 'recovery' ? 'Update password' : 'Send reset link'}</button>
    </form>
    {mode !== 'recovery' && <p className="auth-switch">{mode === 'forgot' ? <button className="auth-link" onClick={() => setMode('login')}>Back to sign in</button> : <>Account creation is managed on the <a className="auth-link" href="https://signals.chat" target="_blank" rel="noreferrer">Signals website</a>.</>}</p>}
  </section></main>
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(false)
  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => setSession(data.session)).finally(() => setLoading(false))
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => { setSession(nextSession); if (event === 'PASSWORD_RECOVERY') setRecovering(true) })
    return () => listener.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    let cancelled = false
    if (!supabase || !session?.user) { setProfile(null); setProfileLoading(false); return }
    setProfileLoading(true)
    setProfile(null)
    void (async () => {
      try {
        const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
        if (!cancelled) setProfile(data as Profile | null)
      } catch { /* session metadata remains available as a fallback */ }
      finally { if (!cancelled) setProfileLoading(false) }
    })()
    return () => { cancelled = true }
  }, [session?.user?.id])
  const refreshProfile = async () => {
    if (!supabase || !session?.user) return
    const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
    if (error) throw error
    setProfile(data as Profile | null)
  }
  const value = useMemo(() => ({ session, user: session?.user || null, profile, profileLoading, loading, refreshProfile, signOut: async () => { setProfile(null); await supabase?.auth.signOut() } }), [session, profile, profileLoading, loading])
  if (loading) return <main className="auth-shell"><div className="auth-loading">SIGNAL<span className="status-led is-busy" /></div></main>
  if (!session) return <AuthContext.Provider value={value}><AuthForm /></AuthContext.Provider>
  if (recovering) return <AuthContext.Provider value={value}><AuthForm initialMode="recovery" onRecoveryComplete={() => setRecovering(false)} /></AuthContext.Provider>
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
