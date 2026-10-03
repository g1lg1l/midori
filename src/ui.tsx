import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { colorOf, initials, type Member } from './lib'

// Base strings carry no size/color so callers add their own without two utilities fighting.
export const fieldBare = 'w-full rounded-xl border border-line px-3.5 py-2.5 placeholder:text-mute/80 focus:border-brand focus:outline-none'
export const field = `${fieldBare} bg-raised text-[15px]`
export const pill =
  'inline-flex items-center justify-center gap-2 rounded-full bg-primary text-on-primary font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity'
export const btn = `${pill} h-11 px-5`
const ghostBare = 'inline-flex items-center gap-1.5 rounded-full h-9 text-sm font-medium transition-colors'
export const ghost = `${ghostBare} px-3 text-mute hover:text-ink hover:bg-raised`
export const link = `${ghostBare} justify-self-start text-mute hover:text-ink`
export const danger = `${ghostBare} justify-self-start text-danger hover:opacity-75`
export const iconBtn =
  'inline-grid place-items-center size-9 shrink-0 rounded-full text-mute hover:text-ink hover:bg-raised transition-colors'

export const Logo = ({ className = '' }: { className?: string }) => (
  <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className={className} />
)

export function Avatar({ member, size = 28 }: { member?: Member; size?: number }) {
  return (
    <span
      title={member?.name}
      className="inline-grid place-items-center rounded-full font-semibold text-white shrink-0 select-none"
      style={{ width: size, height: size, fontSize: size * 0.42, background: member ? colorOf(member.user_id) : 'var(--mute)' }}
    >
      {member ? initials(member.name) : '?'}
    </span>
  )
}

// Native <dialog>: focus trap, Esc and the top layer for free. Mounting it opens it.
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (ref.current?.open) return
    ref.current?.showModal()
    ref.current?.focus() // start on the sheet itself, not its first button (no ring, no keyboard pop-up)
  }, [])
  return (
    <dialog
      ref={ref}
      aria-label={label}
      tabIndex={-1}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
      className="sheet outline-none open:flex open:flex-col m-0 mt-auto w-full max-w-none max-h-[92dvh] rounded-t-[24px] bg-sheet text-ink p-0 sm:m-auto sm:w-[min(100%-2rem,36rem)] sm:max-h-[86dvh] sm:rounded-[24px]"
    >
      {children}
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
      className="m-0 inset-auto bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 max-w-[calc(100%-2rem)] rounded-full bg-primary text-on-primary px-4 py-2.5 text-sm font-medium shadow-lg border-0"
    >
      {message}
    </div>
  )
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
