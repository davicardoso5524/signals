import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react'
import { useAuth } from './Auth'
import { activateLicenseKey, fetchLicenseStatus, LicenseError, readOfflineLicense, type LicenseBlockReason, type LicenseSnapshot } from './lib/licensing'

type GateState = 'checking' | 'available' | 'activation'

function errorText(error: unknown) {
  if (error instanceof LicenseError) {
    if (error.code === 'invalid-key') return 'This key is invalid.'
    if (error.code === 'used-key') return 'This key has already been used.'
    if (error.code === 'expired-key') return 'This key has expired.'
    if (error.code === 'redeemed-key') return 'This key has been fully redeemed.'
    if (error.code === 'network') return 'Connection failed. Check your network and try again.'
    return error.message
  }
  return 'We could not validate access. Check your connection and try again.'
}

function AccessCard({ userEmail, blockReason, onRetry, onActivated }: { userEmail: string; blockReason: LicenseBlockReason; onRetry: () => void; onActivated: (next: LicenseSnapshot) => void }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!key.trim()) { setError('Enter a license key.'); return }
    setBusy(true); setError('')
    try { onActivated(await activateLicenseKey(key)) } catch (activationError) { setError(errorText(activationError)) } finally { setBusy(false) }
  }
  return <main className="auth-shell"><section className="auth-panel license-panel" aria-labelledby="license-title">
    <div className="auth-brand"><img src="/signals.png" alt="Signals" /></div>
    <p className="eyebrow">Signed in as {userEmail}</p><h1 id="license-title">Activate Signals<span className="accent-dot">.</span></h1>
    <p className="auth-copy">{blockReason === 'trial-expired' ? 'Your 7-day trial has expired.' : blockReason === 'subscription-inactive' ? 'Your subscription is inactive or cancelled.' : 'No active subscription or trial was found.'}</p>
    <form className="auth-form" onSubmit={submit} noValidate><label className="auth-label" htmlFor="license-key">License key</label><input id="license-key" className="text-input" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" spellCheck={false} placeholder="XXXX-XXXX-XXXX" aria-describedby="license-hint" required /><p id="license-hint" className="auth-status">Keys are validated securely by Signals.</p>{error && <p className="form-error auth-message" role="alert">{error}</p>}<button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? 'Activating…' : 'Activate key'}</button></form>
    <button className="auth-link license-retry" type="button" onClick={onRetry} disabled={busy}>Try validation again</button>
  </section></main>
}

export function LicenseGate({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  const [state, setState] = useState<GateState>('checking')
  const [snapshot, setSnapshot] = useState<LicenseSnapshot | null>(null)
  const [networkError, setNetworkError] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [blockReason, setBlockReason] = useState<LicenseBlockReason>('no-subscription')

  const validate = useCallback(async () => {
    setState('checking'); setNetworkError(false); setSuccessMessage('')
    try {
      const result = await fetchLicenseStatus()
      setSnapshot(result.snapshot)
      setBlockReason(result.blockReason || 'no-subscription')
      setState(result.snapshot ? 'available' : 'activation')
    } catch (error) {
      const offline = readOfflineLicense()
      if (offline) { setSnapshot(offline.snapshot); setState('available'); return }
      setSnapshot(null); setBlockReason('no-subscription'); setState('activation'); setNetworkError(error instanceof LicenseError && error.code === 'network')
    }
  }, [])

  useEffect(() => { void validate() }, [validate, user?.id])
  useEffect(() => {
    const retryOnline = () => { if (navigator.onLine) void validate() }
    window.addEventListener('online', retryOnline)
    return () => window.removeEventListener('online', retryOnline)
  }, [validate])

  if (state === 'checking') return <main className="auth-shell"><div className="auth-loading">VALIDATING ACCESS<span className="status-led is-busy" /></div></main>
  if (state === 'activation') return <><AccessCard userEmail={user?.email || 'connected account'} blockReason={blockReason} onRetry={() => void validate()} onActivated={(next) => { setSnapshot(next); setNetworkError(false); setSuccessMessage('Activation completed.'); setState('available') }} />{networkError && <p className="license-network-note" role="alert">Connection failed. Connect to the internet to validate your access.</p>}<button className="license-logout" type="button" onClick={() => void signOut()}>Sign out</button></>
  return <>{children}{successMessage && <p className="license-success-note" role="status">{successMessage}</p>}</>
}
