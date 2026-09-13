import { supabase } from './supabase'

const CACHE_KEY = 'signals.last-valid-license'
const CACHE_MAX_AGE_MS = 72 * 60 * 60 * 1000
const INSTALLATION_KEY = 'signals.installation-id'

export type LicenseSnapshot = {
  access: 'license' | 'trial'
  expiresAt: string
  source?: Record<string, unknown>
}

type CachedLicense = { snapshot: LicenseSnapshot; validatedAt: string }

export type LicenseErrorCode = 'network' | 'unknown'
export type LicenseBlockReason = 'trial-expired' | 'subscription-inactive' | 'no-subscription'
export type LicenseStatusResult = { snapshot: LicenseSnapshot | null; blockReason: LicenseBlockReason | null }

export class LicenseError extends Error {
  code: LicenseErrorCode
  constructor(code: LicenseErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

// Temporary diagnostics: keep this development-only and whitelist fields explicitly.
function diagnosticLog(event: string, details: Record<string, unknown>) {
  if (import.meta.env.DEV) console.info(`[license-diagnostic] ${event}`, details)
}

function diagnosticStatus(value: unknown) {
  const payload = asRecord(value)
  const nested = firstRecord(payload.data, payload.result)
  const source = Object.keys(nested).length ? nested : payload
  const trial = asRecord(source.trial)
  const subscription = asRecord(source.subscription)
  const adminGrant = asRecord(source.admin_access_grant || source.admin_grant || source.admin_access)
  return {
    active: source.active === true ? true : source.active === false ? false : undefined,
    access_source: source.access_source ?? source.source,
    source: typeof source.source === 'string' ? source.source : undefined,
    expires_at: source.expires_at ?? source.expiresAt,
    trial_present: Object.keys(trial).length > 0,
    trial_status: trial.status,
    trial_ends_at: trial.ends_at ?? trial.endsAt,
    subscription_present: Object.keys(subscription).length > 0,
    subscription_status: subscription.status,
    admin_grant: Object.keys(adminGrant).length > 0 ? { active: adminGrant.active, status: adminGrant.status, expires_at: adminGrant.expires_at ?? adminGrant.expiresAt } : undefined,
  }
}

function errorStatus(error: unknown) {
  const details = asRecord(error)
  return details.context instanceof Response ? details.context.status : undefined
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error'
  return message.replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]').replace(/eyJ[a-zA-Z0-9._-]+/g, '[redacted-token]').slice(0, 300)
}

function firstRecord(...values: unknown[]) {
  return values.map(asRecord).find((value) => Object.keys(value).length > 0) || {}
}

function isActive(value: unknown) {
  return value === true || value === 'active' || value === 'ACTIVE'
}

function expiryOf(value: Record<string, unknown>) {
  const expiry = value.expires_at || value.expiresAt || value.ends_at || value.endsAt || value.trial_ends_at || value.current_period_end || value.valid_until || value.validUntil
  return typeof expiry === 'string' ? expiry : ''
}

function validEntry(value: unknown, access: LicenseSnapshot['access']) {
  const entry = asRecord(value)
  const expiresAt = expiryOf(entry)
  return isActive(entry.active) || isActive(entry.status) || entry.is_active === true
    ? expiresAt && new Date(expiresAt).getTime() > Date.now() ? { access, expiresAt, source: entry } : null
    : null
}

export function normalizeLicenseStatus(value: unknown): LicenseSnapshot | null {
  const payload = asRecord(value)
  const nested = firstRecord(payload.data, payload.result)
  const source = Object.keys(nested).length ? nested : payload
  const license = validEntry(source.license || source.licence || source.subscription, 'license') ||
    validEntry({ active: source.subscription_status, expires_at: source.license_expires_at || source.current_period_end || source.expires_at }, 'license')
  if (license) return license
  const trial = validEntry(source.trial || source.trial_status, 'trial') ||
    validEntry({ active: source.trial_status, expires_at: source.trial_expires_at }, 'trial')
  if (trial) return trial
  const directExpiry = expiryOf(source)
  if (source.active === true && directExpiry && new Date(directExpiry).getTime() > Date.now()) {
    return { access: source.access_source === 'trial' || source.source === 'trial' ? 'trial' : 'license', expiresAt: directExpiry, source }
  }
  return null
}

export function classifyBlockedStatus(value: unknown): LicenseBlockReason {
  const text = JSON.stringify(value).toLowerCase()
  if (text.includes('trial_expired') || text.includes('trial expired') || text.includes('trial-expired')) return 'trial-expired'
  if (text.includes('cancelled') || text.includes('canceled') || text.includes('inactive') || text.includes('subscription_expired')) return 'subscription-inactive'
  return 'no-subscription'
}

export function readOfflineLicense(): { snapshot: LicenseSnapshot; validatedAt: string } | null {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as CachedLicense | null
    if (!cached?.snapshot || !cached.validatedAt) return null
    if (Date.now() - new Date(cached.validatedAt).getTime() > CACHE_MAX_AGE_MS) return null
    if (new Date(cached.snapshot.expiresAt).getTime() <= Date.now()) return null
    return cached
  } catch { return null }
}

function cacheLicense(snapshot: LicenseSnapshot) {
  const cachedSnapshot: LicenseSnapshot = { access: snapshot.access, expiresAt: snapshot.expiresAt }
  localStorage.setItem(CACHE_KEY, JSON.stringify({ snapshot: cachedSnapshot, validatedAt: new Date().toISOString() } satisfies CachedLicense))
}

async function installationDeviceId() {
  let installationId = localStorage.getItem(INSTALLATION_KEY)
  if (!installationId) {
    installationId = crypto.randomUUID()
    localStorage.setItem(INSTALLATION_KEY, installationId)
  }
  const bytes = new TextEncoder().encode(installationId)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function invoke(name: string, body?: Record<string, unknown>) {
  if (!supabase) throw new LicenseError('unknown', 'Supabase is not configured.')
  try {
    const { data, error } = await supabase.functions.invoke(name, body ? { body } : undefined)
    if (error) throw error
    return data
  } catch (error) {
    const details = asRecord(error)
    let responseMessage = ''
    if (details.context instanceof Response) {
      try {
        const body = await details.context.clone().json() as Record<string, unknown>
        responseMessage = `${String(body.error || '')} ${String(body.message || '')} ${String(body.code || '')}`
      } catch { /* the response may not contain JSON */ }
    }
    const message = `${error instanceof Error ? error.message : ''} ${responseMessage} ${String(details.code || '')} ${String(details.status || '')}`.toLowerCase()
    if (message.includes('fetch') || message.includes('network') || message.includes('connect')) throw new LicenseError('network', 'Connection failed. Check your network and try again.')
    throw error
  }
}

export async function fetchLicenseStatus(): Promise<LicenseStatusResult> {
  const deviceId = await installationDeviceId()
  try {
    const data = await invoke('license-status', { device_id: deviceId })
    const snapshot = normalizeLicenseStatus(data)
    if (snapshot) cacheLicense(snapshot)
    else localStorage.removeItem(CACHE_KEY)
    diagnosticLog('license_status_response', { http_status: 200, ...diagnosticStatus(data), error: undefined, cache_used: false })
    return { snapshot, blockReason: snapshot ? null : classifyBlockedStatus(data) }
  } catch (error) {
    diagnosticLog('license_status_response', { http_status: errorStatus(error), active: undefined, access_source: undefined, source: undefined, expires_at: undefined, trial_present: undefined, trial_status: undefined, trial_ends_at: undefined, subscription_present: undefined, subscription_status: undefined, admin_grant: undefined, error: safeErrorMessage(error), cache_used: false })
    throw error
  }
}
