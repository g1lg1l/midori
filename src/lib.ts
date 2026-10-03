import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Workspace = Row<'workspaces'>
export type Member = Row<'members'>
export type Column = Row<'columns'>
export type Task = Row<'tasks'>
export type Comment = Row<'comments'>

// Every visitor is an anonymous Supabase user; that user id is their member id in every project.
// Started once at import so StrictMode's double effects can't sign in twice.
export const me: Promise<string> = supabase.auth.getSession().then(async ({ data }) => {
  if (data.session) return data.session.user.id
  const { data: anon, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return anon.user!.id
})

// Routing is just query params: ?p=<project id> or ?join=<invite code>. GitHub Pages can't serve other paths.
export function go(params: Record<string, string> = {}, replace = false) {
  const q = new URLSearchParams(params).toString()
  history[replace ? 'replaceState' : 'pushState'](null, '', q ? `?${q}` : import.meta.env.BASE_URL)
  dispatchEvent(new PopStateEvent('popstate'))
}

// Accounts are username + password. Supabase logins need an email, so the username becomes an alias
// on example.com, a domain reserved for exactly this: no mail is ever sent or delivered there.
const ALIAS = '@example.com'
export const toEmail = (username: string) => username.trim().toLowerCase() + ALIAS
export const usernameOf = (email = '') => (email.endsWith(ALIAS) ? email.slice(0, -ALIAS.length) : email)
export const usernameRule = { pattern: '[A-Za-z0-9_.\\-]{3,24}', title: '3 to 24 letters, numbers, dots, dashes or underscores' }

// Android and desktop Chrome offer an install prompt; keep it for the "Install" button. iOS uses Share > Add to Home Screen.
type InstallPrompt = Event & { prompt: () => Promise<void> }
export let installPrompt: InstallPrompt | null = null
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  installPrompt = e as InstallPrompt
  dispatchEvent(new Event('installable'))
})
addEventListener('appinstalled', () => (installPrompt = null))
export const clearInstallPrompt = () => (installPrompt = null)

export const inviteUrl = (code: string) => `${location.origin}${import.meta.env.BASE_URL}?join=${code}`

export const toast = (message: string) => dispatchEvent(new CustomEvent('toast', { detail: message }))

export function errorText(error: unknown) {
  const { code, message = '' } = error as { code?: string; message?: string }
  if (code === '23505') return 'Someone in this project already uses that name. Pick another one.'
  if (code === '23514') return 'That text is empty or too long.'
  if (code === '42501') return "You don't have permission to do that."
  if (code === 'email_exists' || code === 'user_already_exists') return 'That username is taken. Try another one.'
  if (code === 'invalid_credentials') return 'Wrong username or password.'
  if (code === 'weak_password') return 'Pick a longer password: at least 8 characters.'
  if (code === 'over_request_rate_limit') return 'Too many tries. Wait a minute and try again.'
  if (/row-level security/i.test(message)) return 'Upload blocked. The project may have reached its 300 image limit.'
  if (/fetch|network/i.test(message)) return "Can't reach the server. Check your connection."
  return message || 'Something went wrong. Try again.'
}

export const savedName = {
  get: () => {
    try {
      return localStorage.getItem('midori:name') ?? ''
    } catch {
      return ''
    }
  },
  set: (name: string) => {
    try {
      localStorage.setItem('midori:name', name)
    } catch {
      /* private mode: just don't remember */
    }
  },
}

const palette = ['#d1495b', '#d9702a', '#2e86ab', '#6a4c93', '#17907f', '#c4497f', '#3d6fd8', '#6f8a1f']
// Members get colours in join order (set by the board) so the first eight never clash; a hash covers the rest.
const assigned = new Map<string, string>()
export const assignColors = (ids: string[]) => ids.forEach((id, i) => assigned.set(id, palette[i % palette.length]))
export const colorOf = (id: string) => assigned.get(id) ?? palette[parseInt(id.slice(0, 8), 16) % palette.length]

export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60],
]
export function ago(iso: string) {
  const s = (Date.parse(iso) - Date.now()) / 1000
  for (const [unit, secs] of units) if (Math.abs(s) >= secs) return rtf.format(Math.round(s / secs), unit)
  return 'just now'
}

const MAX_SIDE = 800
const MAX_BYTES = 150 * 1024 // matches the bucket's file_size_limit

// Shrinks to at most 800px as WebP (JPEG where the browser can't encode WebP) so uploads stay tiny on the free tier.
export async function uploadImage(projectId: string, file: File) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  let blob: Blob | undefined
  for (const quality of [0.8, 0.65, 0.5, 0.35]) {
    blob = await canvas.convertToBlob({ type: 'image/webp', quality })
    if (blob.type !== 'image/webp') blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
    if (blob.size <= MAX_BYTES) break
  }
  if (!blob || blob.size > MAX_BYTES) throw new Error("That image is too detailed to shrink under 150 KB. Try a smaller one.")
  const path = `${projectId}/${crypto.randomUUID()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`
  const { error } = await supabase.storage.from('images').upload(path, blob)
  if (error) throw error
  return supabase.storage.from('images').getPublicUrl(path).data.publicUrl
}