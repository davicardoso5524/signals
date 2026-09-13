import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

let permissionPromise: Promise<boolean> | null = null

async function canNotify() {
  if (!permissionPromise) {
    permissionPromise = isPermissionGranted()
      .then(async (granted) => granted || (await requestPermission()) === 'granted')
      .catch(() => false)
  }
  return permissionPromise
}

export async function showSignalNotification(title: string, body: string) {
  if (await canNotify()) sendNotification({ title, body })
}
