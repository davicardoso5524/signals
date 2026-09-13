import { ReactNode, useCallback, useEffect, useState } from 'react'
import { useAuth } from './Auth'
import { fetchLicenseStatus, LicenseError, readOfflineLicense, type LicenseBlockReason } from './lib/licensing'

type GateState = 'checking' | 'available' | 'blocked'

function diagnosticDecision(details: { backendActive?: boolean; cacheUsed: boolean; expiresAtPresent: boolean; allowed: boolean }) {
  if (import.meta.env.DEV) console.info('[license-diagnostic] license_decision', details)
}

function AccessCard({ blockReason, onSignOut }: { blockReason: LicenseBlockReason; onSignOut: () => void }) {
  const message = blockReason === 'trial-expired'
    ? 'Seu período de teste terminou.'
    : blockReason === 'subscription-inactive'
      ? 'Sua assinatura não está ativa.'
      : 'Esta conta não possui acesso ativo ao Signals.'

  return <main className="auth-shell"><section className="auth-panel license-panel" aria-labelledby="license-title">
    <div className="auth-brand"><img src="/signals.png" alt="Signals" /></div>
    <h1 id="license-title">Acesso indisponível<span className="accent-dot">.</span></h1>
    <p className="auth-copy">{message}</p>
    <a className="primary-button auth-submit license-subscribe" href="https://www.signalsapptech.site/account" target="_blank" rel="noreferrer">Ver assinatura</a>
    <button className="secondary-button license-signout" type="button" onClick={onSignOut}>Sair</button>
  </section></main>
}

export function LicenseGate({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  const [state, setState] = useState<GateState>('checking')
  const [networkError, setNetworkError] = useState(false)
  const [blockReason, setBlockReason] = useState<LicenseBlockReason>('no-subscription')

  const validate = useCallback(async () => {
    setState('checking'); setNetworkError(false)
    try {
      const result = await fetchLicenseStatus()
      setBlockReason(result.blockReason || 'no-subscription')
      diagnosticDecision({ backendActive: result.snapshot ? true : false, cacheUsed: false, expiresAtPresent: Boolean(result.snapshot?.expiresAt), allowed: Boolean(result.snapshot) })
      setState(result.snapshot ? 'available' : 'blocked')
    } catch (error) {
      const offline = readOfflineLicense()
      if (offline) {
        diagnosticDecision({ backendActive: undefined, cacheUsed: true, expiresAtPresent: Boolean(offline.snapshot.expiresAt), allowed: true })
        setState('available'); return
      }
      diagnosticDecision({ backendActive: undefined, cacheUsed: false, expiresAtPresent: false, allowed: false })
      setBlockReason('no-subscription'); setState('blocked'); setNetworkError(error instanceof LicenseError && error.code === 'network')
    }
  }, [])

  useEffect(() => { void validate() }, [validate, user?.id])
  useEffect(() => {
    const retryOnline = () => { if (navigator.onLine) void validate() }
    window.addEventListener('online', retryOnline)
    return () => window.removeEventListener('online', retryOnline)
  }, [validate])

  if (state === 'checking') return <main className="auth-shell"><div className="auth-loading">VALIDATING ACCESS<span className="status-led is-busy" /></div></main>
  if (state === 'blocked') return <><AccessCard blockReason={blockReason} onSignOut={() => void signOut()} />{networkError && <p className="license-network-note" role="alert">Connection failed. Connect to the internet to validate your access.</p>}</>
  return <>{children}</>
}
