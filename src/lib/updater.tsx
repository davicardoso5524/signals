import { useEffect, useState, type ReactNode } from 'react'

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
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch {
      setInstalling(false)
      setError('Could not install the update. Try again.')
    }
  }

  if (checking || !update) return <>{children}</>
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
