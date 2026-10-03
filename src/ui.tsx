import { X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { colorOf, initials, type Member } from './lib'

// Base strings carry no size/color so callers add their own without two utilities fighting.
export const fieldBare = 'w-full rounded-xl border border-line px-3.5 py-2.5 placeholder:text-mute/80 focus:border-brand focus:outline-none'
export const field = `${fieldBare} bg-raised text-[15px]`
export const pill =
  'inline-flex items-center justify-center gap-2 rounded-full bg-primary text-on-primary font-semibold disabled:opacity-50 hover:opacity-90 active:scale-95 transition'
export const btn = `${pill} h-11 px-5`
export const outline =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line px-5 font-semibold transition hover:bg-raised active:scale-95 disabled:opacity-50'
const ghostBare = 'inline-flex items-center gap-1.5 rounded-full h-9 text-sm font-medium transition active:scale-95'
export const ghost = `${ghostBare} px-3 text-mute hover:text-ink hover:bg-raised`
export const link = `${ghostBare} justify-self-start text-mute hover:text-ink`
export const danger = `${ghostBare} justify-self-start text-danger hover:opacity-75`
export const iconBtn =
  'inline-grid place-items-center size-9 shrink-0 rounded-full text-mute hover:text-ink hover:bg-raised active:scale-90 transition'

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export const Logo = ({ className = '' }: { className?: string }) => (
  <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className={className} />
)

export function Avatar({ member, size = 28 }: { member?: Member; size?: number }) {
  return (
    <span
      title={member?.name}
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white select-none"
      style={{ width: size, height: size, fontSize: size * 0.42, background: member ? colorOf(member.user_id) : 'var(--mute)' }}
    >
      {member ? initials(member.name) : '?'}
    </span>
  )
}

// Native <dialog>: focus trap, Esc and the top layer for free. Mounting it opens it.
// Fixed header and footer with dividers; only the middle scrolls, its scrollbar on the sheet's edge.
export function Sheet({ label, header, footer, onClose, children }: { label: string; header: ReactNode; footer?: ReactNode; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (ref.current?.open) return
    ref.current?.showModal()
    ref.current?.focus() // start on the sheet itself, not its first button (no ring, no keyboard pop-up)
  }, [])
  const close = () => ref.current?.close()
  return (
    <dialog
      ref={ref}
      aria-label={label}
      tabIndex={-1}
      // the exit transition plays before the parent unmounts us
      onClose={() => setTimeout(onClose, reducedMotion() ? 0 : 220)}
      onClick={(e) => e.target === e.currentTarget && close()}
      className="sheet m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-[24px] bg-sheet p-0 text-ink outline-none open:flex open:flex-col sm:m-auto sm:max-h-[86dvh] sm:w-[min(100%-2rem,36rem)] sm:rounded-[24px]"
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-line py-2.5 pr-2.5 pl-5">
        <div className="min-w-0 flex-1">{header}</div>
        <button onClick={close} aria-label="Close" className={iconBtn}>
          <X size={20} />
        </button>
      </div>
      <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 ${footer ? 'pb-5' : 'pb-[max(1.5rem,env(safe-area-inset-bottom))]'}`}>
        {children}
      </div>
      {footer && <div className="shrink-0 border-t border-line">{footer}</div>}
    </dialog>
  )
}

// Saves on blur or Enter; Esc-closing the sheet discards the edit.
export function Editable({
  value, onSave, rows, newlines, className = '', ...rest
}: {
  value: string
  onSave: (value: string) => void
  rows?: number
  newlines?: boolean
  className?: string
  placeholder?: string
  maxLength?: number
  'aria-label': string
}) {
  const commit = (el: HTMLInputElement | HTMLTextAreaElement) => {
    const next = newlines ? el.value : el.value.trim()
    if (next !== value && (newlines || next)) onSave(next)
    else el.value = value
  }
  const props = {
    ...rest,
    defaultValue: value,
    className: rows ? `${className} field-sizing-content` : className,
    onBlur: (e: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => commit(e.currentTarget),
    onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !(newlines && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault()
        e.currentTarget.blur()
      }
    },
  }
  return rows ? <textarea key={value} rows={rows} {...props} /> : <input key={value} {...props} />
}

// A top-layer popover so toasts show above open dialogs too.
export function Toaster() {
  const ref = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let timer = 0
    const show = (e: Event) => {
      setMessage((e as CustomEvent<string>).detail)
      ref.current?.hidePopover()
      ref.current?.showPopover()
      clearTimeout(timer)
      timer = setTimeout(() => ref.current?.hidePopover(), 3500)
    }
    addEventListener('toast', show)
    return () => removeEventListener('toast', show)
  }, [])
  return (
    <div
      ref={ref}
      popover="manual"
      role="status"
      className="toast inset-x-0 top-[max(1rem,env(safe-area-inset-top))] bottom-auto mx-auto w-fit max-w-[calc(100%-2rem)] rounded-full border-0 bg-primary px-4 py-2.5 text-sm font-medium text-on-primary shadow-lg"
    >
      {message}
    </div>
  )
}

// A little emoji confetti pop at (x, y), drawn in the top layer above everything.
export function burst(x: number, y: number, emoji: string) {
  if (reducedMotion()) return
  const host = document.createElement('div')
  host.className = 'burst'
  host.popover = 'manual'
  host.style.left = `${x}px`
  host.style.top = `${y}px`
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('span')
    s.textContent = i % 3 ? emoji : '✨'
    const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.4
    const dist = 50 + Math.random() * 70
    s.style.setProperty('--x', `${Math.cos(angle) * dist}px`)
    s.style.setProperty('--y', `${Math.sin(angle) * dist - 30}px`)
    s.style.setProperty('--r', `${Math.random() * 360 - 180}deg`)
    host.append(s)
  }
  document.body.append(host)
  host.showPopover()
  setTimeout(() => host.remove(), 1000)
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-4">
      <span className="flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-sm text-mute">{hint}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative mt-0.5 h-6 w-10 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4"
      />
    </label>
  )
}

export function Splash() {
  return (
    <div className="grid h-dvh place-items-center">
      <Logo className="size-14 animate-pulse motion-reduce:animate-none" />
    </div>
  )
}
