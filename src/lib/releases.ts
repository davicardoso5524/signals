import packageJson from '../../package.json'

export type ReleaseNotes = {
  version: string
  date: string
  title: string
  items: string[]
}

export const currentVersion = packageJson.version

export const releaseNotes: ReleaseNotes[] = [
  {
    version: '0.1.18',
    date: 'September 2026',
    title: 'Supabase destination configuration',
    items: ['Aligned the desktop release build with the current Supabase project configuration.'],
  },
  {
    version: '0.1.17',
    date: 'September 2026',
    title: 'Simplified access blocking',
    items: ['Removed license-key and manual trial flows from the desktop app.', 'Blocked accounts now receive a direct subscription message and site link.'],
  },
  {
    version: '0.1.16',
    date: 'September 2026',
    title: 'Authentication and licensing flow',
    items: [
      'Account creation is now managed on the Signals website.',
      'Added backend-validated license activation and access gating.',
      'Limited offline access to the last valid license state and its expiry.',
    ],
  },
  {
    version: '0.1.15',
    date: 'September 2026',
    title: 'Friends, realtime and desktop continuity',
    items: [
      'Added Friends with friend requests, accepted friends and conversation controls.',
      'Added realtime updates for Friends, conversations, Rooms and Room members.',
      'The app can remain active in the Windows tray when the window is closed.',
      'Improved profile username fallback and desktop screen-sharing behavior.',
    ],
  },
  {
    version: '0.1.14',
    date: 'September 2026',
    title: 'Windows tray support',
    items: ['The app can remain open in the Windows tray and be reopened from its icon.'],
  },
  {
    version: '0.1.13',
    date: 'September 2026',
    title: 'Friends and realtime lists',
    items: ['Added Friends, friend requests, conversation deletion and live list updates.'],
  },
]

export function getReleaseNotes(version: string): ReleaseNotes {
  return releaseNotes.find((release) => release.version === version) || {
    version,
    date: 'Latest release',
    title: 'Signals has been updated',
    items: ['New features, improvements and fixes are included in this version.'],
  }
}
