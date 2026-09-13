import { useEffect, useState, type ReactNode } from 'react'
import { getReleaseNotes } from './releases'

type DesktopUpdate = {
  version: string
  downloadAndInstall: (onEvent?: (event: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void) => Promise<void>
}

export function UpdateGate({ children }: { children: ReactNode }) {
  const [update, setUpdate] = useState<DesktopUpdate | null>(null)
  const [checking, setChecking] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) { setChecking(false); return }
    let active = true
    import('@tauri-apps/plugin-updater').then(({ check }) => check()).then((available) => {
      if (!active) return
      setUpdate(available as DesktopUpdate | null)
      setChecking(false)
    }).catch(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [])

  const install = async () => {
    if (!update) return
    setInstalling(true)
    setError('')
    try {
      let downloaded = 0
      await update.downloadAndInstall((event) => {
        if (event.event !== 'Progress') return
        downloaded += event.data?.chunkLength || 0
        const total = event.data?.contentLength || 0
        if (total) setProgress(Math.min(100, Math.round((downloaded / total) * 100)))
      })
      localStorage.setItem('signals.pendingUpdateVersion', update.version)
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch {
      setInstalling(false)
      setError('Could not install the update. Try again.')
    }
  }

  const pendingVersion = localStorage.getItem('signals.pendingUpdateVersion')
  const dismissUpdateNotice = () => localStorage.removeItem('signals.pendingUpdateVersion')

  if (checking || !update) return <>{children}{pendingVersion && <UpdateNotice version={pendingVersion} onClose={dismissUpdateNotice} />}</>
  return <main className="update-gate" role="dialog" aria-modal="true" aria-labelledby="update-title">
    <section className="update-panel">
      <p className="eyebrow">SIGNALS desktop</p>
      <h1 id="update-title">Update required.</h1>
      <p className="update-copy">Version {update.version} is ready. Install it to continue using SIGNALS.</p>
      {installing && <p className="update-progress" role="status">Downloading update… {progress}%</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button update-button" type="button" onClick={() => void install()} disabled={installing}>{installing ? 'Installing…' : 'Update and restart'}</button>
    </section>
  </main>
}

function UpdateNotice({ version, onClose }: { version: string; onClose: () => void }) {
  const notes = getReleaseNotes(version)
  return <div className="update-notice-backdrop"><section className="update-notice" role="dialog" aria-modal="true" aria-labelledby="update-notice-title"><div className="update-notice-header"><div><p className="eyebrow">Signals desktop</p><h2 id="update-notice-title">Updated to version {notes.version}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close update notes">×</button></div><p className="update-notice-title">{notes.title}</p><ul className="update-notice-list">{notes.items.map((item) => <li key={item}>{item}</li>)}</ul><button className="primary-button update-notice-button" type="button" onClick={onClose}>Continue</button></section></div>
}
