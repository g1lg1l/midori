import { Bold, Check, ImagePlus, List, ListChecks, Lock, Pencil, Send, Trash2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ago, errorText, toast, type Column, type Comment, type Member, type Task } from './lib'
import { mentionPattern, toggleCheckbox } from './text'
import { Avatar, Editable, field, iconBtn, pill, Sheet } from './ui'

type Props = {
  task: Task
  me: string
  columns: Column[]
  members: Member[]
  comments: Comment[]
  canEdit: boolean
  canMoveTo: (col: Column) => boolean
  isMaster: boolean
  onClose: () => void
  onUpdate: (change: Partial<Task>) => void
  onMove: (columnId: string, at: { x: number; y: number }) => void
  onDelete: () => void
  onComment: (body: string) => void
  onDeleteComment: (comment: Comment) => void
  onUpload: (file: File) => Promise<string>
}

export function TaskSheet(p: Props) {
  const { task, me, columns, members, comments, canEdit } = p
  const member = (uid: string) => members.find((m) => m.user_id === uid)
  const author = member(task.created_by)
  const end = useRef<HTMLDivElement>(null)
  const currentChip = useRef<HTMLButtonElement>(null)
  const seen = useRef(comments.length)
  const [initial] = useState(() => new Set(comments.map((c) => c.id)))

  // follow the thread when a new comment arrives, but open at the top
  useEffect(() => {
    if (comments.length > seen.current) end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    seen.current = comments.length
  }, [comments.length])

  // keep the task's column chip in view, even when it's far right
  useEffect(() => {
    currentChip.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [task.column_id])

  const header = (
    <div className="flex items-center gap-1">
      <div role="group" aria-label="Column" className="no-scrollbar -mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 py-1">
        {columns.map((c) => {
          const current = c.id === task.column_id
          if (!canEdit && !current) return null
          const allowed = current || p.canMoveTo(c)
          return (
            <button
              key={c.id}
              ref={current ? currentChip : undefined}
              disabled={!canEdit || !allowed}
              aria-pressed={current}
              onClick={(e) => {
                if (current) return
                const r = e.currentTarget.getBoundingClientRect()
                p.onMove(c.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
              }}
              title={allowed ? undefined : 'Locked by the master'}
              className={`flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold transition active:scale-95 disabled:opacity-50 ${current ? 'bg-primary text-on-primary disabled:opacity-100' : 'border border-line text-mute hover:text-ink'}`}
            >
              {c.emoji && <span>{c.emoji}</span>}
              {c.name}
              {!allowed && <Lock size={12} aria-hidden />}
            </button>
          )
        })}
      </div>
      {canEdit && (
        <button onClick={p.onDelete} aria-label="Delete task" className={iconBtn}>
          <Trash2 size={18} />
        </button>
      )}
    </div>
  )

  return (
    <Sheet label={task.title} header={header} footer={<CommentBox members={members} onSend={p.onComment} />} onClose={p.onClose}>
      {canEdit ? (
        <Editable
          value={task.title}
          onSave={(title) => p.onUpdate({ title })}
          rows={1}
          maxLength={200}
          aria-label="Task title"
          className="w-full resize-none bg-transparent text-[22px] leading-tight font-bold focus:outline-none"
        />
      ) : (
        <h2 className="text-[22px] leading-tight font-bold break-words">{task.title}</h2>
      )}
      <p className="mt-2 flex items-center gap-2 text-sm text-mute">
        <Avatar member={author} size={20} />
        Added by {author?.name ?? 'a former member'}, {ago(task.created_at)}
      </p>

      <Notes value={task.description} canEdit={canEdit} onSave={(description) => p.onUpdate({ description })} onUpload={p.onUpload} />

      <h3 className="mt-8 text-sm font-semibold text-mute">Comments{comments.length > 0 && ` (${comments.length})`}</h3>
      {comments.length === 0 && <p className="mt-2 text-sm text-mute">No comments yet. Type @ to mention someone.</p>}
      <ul className="mt-3 grid gap-4">
        {comments.map((c) => {
          const who = member(c.author_id)
          return (
            <li key={c.id} className={`group flex gap-3 ${initial.has(c.id) ? '' : 'pop'}`}>
              <Avatar member={who} size={30} />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2 text-sm">
                  <span className="font-semibold">{who?.name ?? 'Former member'}</span>
                  <time dateTime={c.created_at} title={new Date(c.created_at).toLocaleString()} className="text-xs text-mute">
                    {ago(c.created_at)}
                  </time>
                  {(c.author_id === me || p.isMaster) && (
                    <button
                      onClick={() => confirm('Delete this comment?') && p.onDeleteComment(c)}
                      aria-label="Delete comment"
                      className="ml-auto self-center text-mute opacity-0 group-hover:opacity-100 hover:text-danger focus-visible:opacity-100 max-sm:opacity-60"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </p>
                <p className="mt-0.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                  <Body text={c.body} members={members} me={me} />
                </p>
              </div>
            </li>
          )
        })}
      </ul>
      <div ref={end} />
    </Sheet>
  )
}
// Markdown details: rendered by default, tap to edit. Saves on blur and when the sheet closes.
function Notes({ value, canEdit, onSave, onUpload }: { value: string; canEdit: boolean; onSave: (v: string) => void; onUpload: (f: File) => Promise<string> }) {
  const [editing, setEditing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const saved = useRef(value)

  const save = () => {
    const next = area.current?.value
    if (next === undefined || next === saved.current) return
    saved.current = next
    onSave(next)
  }
  // the sheet can close (Esc) without a blur; save on the way out (layout cleanup still sees the textarea)
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
  useLayoutEffect(() => () => save(), [])
  const startEdit = () => {
    saved.current = value
    setEditing(true)
  }

  const edit = (fn: (el: HTMLTextAreaElement) => void) => {
    const el = area.current!
    fn(el)
    el.focus()
  }
  const bold = () =>
    edit((el) => {
      const { selectionStart: s, selectionEnd: e } = el
      el.setRangeText(`**${el.value.slice(s, e)}**`, s, e, 'end')
      if (s === e) el.setSelectionRange(s + 2, s + 2)
    })
  const prefix = (mark: string) =>
    edit((el) => {
      const { selectionStart: s, selectionEnd: e } = el
      const line = el.value.lastIndexOf('\n', s - 1) + 1
      el.setRangeText(mark, line, line)
      el.setSelectionRange(s + mark.length, e + mark.length)
    })

  async function addImage(file?: File) {
    if (!file?.type.startsWith('image/')) return
    setUploading(true)
    try {
      const url = await onUpload(file)
      edit((el) => el.setRangeText(`\n![](${url})\n`, el.selectionStart, el.selectionEnd, 'end'))
      save()
    } catch (e) {
      toast(errorText(e))
    } finally {
      setUploading(false)
    }
  }

  const components: Components = {
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ),
    img: ({ src, alt }) => (
      <a href={src} target="_blank" rel="noreferrer" className="inline-block">
        <img src={src} alt={alt ?? ''} loading="lazy" />
      </a>
    ),
    input: ({ type, checked }) => <input type={type} checked={!!checked} disabled={!canEdit} readOnly aria-label="Done" />,
    // checkboxes flip "- [ ]" in the source at this list item's offset
    li: ({ node, className, children }) => (
      <li
        className={className}
        onClick={(e) => {
          const at = node?.position?.start.offset
          if (!canEdit || at === undefined || !(e.target as HTMLElement).matches('input[type=checkbox]')) return
          e.stopPropagation()
          saved.current = toggleCheckbox(value, at)
          onSave(saved.current)
        }}
      >
        {children}
      </li>
    ),
  }

  if (editing)
    return (
      <div className="mt-5 overflow-hidden rounded-xl bg-raised ring-brand focus-within:ring-2">
        <div className="flex items-center gap-0.5 border-b border-line px-1.5 py-1" onMouseDown={(e) => e.preventDefault()}>
          <button type="button" onClick={bold} aria-label="Bold" className={iconBtn}>
            <Bold size={17} />
          </button>
          <button type="button" onClick={() => prefix('- ')} aria-label="Bulleted list" className={iconBtn}>
            <List size={17} />
          </button>
          <button type="button" onClick={() => prefix('- [ ] ')} aria-label="Checklist item" className={iconBtn}>
            <ListChecks size={17} />
          </button>
          <button type="button" onClick={() => picker.current?.click()} disabled={uploading} aria-label="Add image" className={`${iconBtn} disabled:animate-pulse`}>
            <ImagePlus size={17} />
          </button>
          <input ref={picker} type="file" accept="image/*" hidden onChange={(e) => addImage(e.target.files?.[0]).then(() => (e.target.value = ''))} />
          <span className="ml-auto px-2 text-xs text-mute max-sm:hidden">Markdown</span>
          <button
            type="button"
            onClick={() => {
              save()
              setEditing(false)
            }}
            className={`${pill} h-8 px-3 text-sm max-sm:ml-auto`}
          >
            <Check size={15} aria-hidden /> Done
          </button>
        </div>
        <textarea
          ref={area}
          autoFocus
          defaultValue={value}
          rows={5}
          maxLength={10000}
          aria-label="Details"
          placeholder={'Steps, notes, links…\n- [ ] a checklist item'}
          onBlur={save}
          onPaste={(e) => {
            const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'))
            if (file) {
              e.preventDefault()
              addImage(file)
            }
          }}
          className="field-sizing-content block min-h-32 w-full resize-none bg-transparent px-3.5 py-3 text-[15px] leading-relaxed placeholder:text-mute/80 focus:outline-none"
        />
      </div>
    )

  if (!value)
    return canEdit ? (
      <button
        onClick={startEdit}
        className="mt-5 flex w-full items-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-4 text-left text-mute transition-colors hover:border-brand hover:text-ink"
      >
        <Pencil size={16} aria-hidden /> Add details, a checklist or an image
      </button>
    ) : null

  return (
    <div className="group relative mt-5">
      <div className={`md ${canEdit ? 'pr-8' : ''}`} onClick={(e) => canEdit && !(e.target as HTMLElement).closest('a, input') && startEdit()}>
        <Markdown remarkPlugins={[remarkGfm]} components={components}>
          {value}
        </Markdown>
      </div>
      {canEdit && (
        <button onClick={startEdit} aria-label="Edit details" className={`${iconBtn} absolute -top-1 -right-2 bg-sheet opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-70`}>
          <Pencil size={15} />
        </button>
      )}
    </div>
  )
}

function Body({ text, members, me }: { text: string; members: Member[]; me: string }) {
  const re = mentionPattern(members)
  if (!re) return text
  // split with a capture group: odd entries are the mentioned names
  return text.split(re).map((part, i) => {
    if (i % 2 === 0) return part
    const isMe = members.find((m) => m.name.toLowerCase() === part.toLowerCase())?.user_id === me
    return (
      <mark key={i} className={`rounded bg-marker px-0.5 text-on-marker ${isMe ? 'font-bold' : 'font-medium'}`}>
        @{part}
      </mark>
    )
  })
}

function CommentBox({ members, onSend }: { members: Member[]; onSend: (body: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const [query, setQuery] = useState<string | null>(null)
  const [pick, setPick] = useState(0)
  const matches = query === null ? [] : members.filter((m) => m.name.toLowerCase().startsWith(query.toLowerCase())).slice(0, 5)

  // an "@word" right before the caret opens the member picker
  function track(el: HTMLTextAreaElement) {
    const m = el.value.slice(0, el.selectionStart).match(/(?:^|\s)@([^\s@]*)$/)
    setQuery(m ? m[1] : null)
    setPick(0)
  }

  function insert(m: Member) {
    const el = ref.current!
    const caret = el.selectionStart
    const start = text.lastIndexOf('@', caret - 1)
    setText(`${text.slice(0, start)}@${m.name} ${text.slice(caret)}`)
    setQuery(null)
    const pos = start + m.name.length + 2
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  function send() {
    const body = text.trim()
    if (!body) return
    onSend(body)
    setText('')
    setQuery(null)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
      className="relative flex items-end gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      {matches.length > 0 && (
        <ul role="listbox" aria-label="Mention someone" className="absolute right-4 bottom-full left-4 mb-2 overflow-hidden rounded-2xl border border-line bg-sheet py-1 shadow-xl">
          {matches.map((m, i) => (
            <li
              key={m.user_id}
              role="option"
              aria-selected={i === pick}
              onMouseDown={(e) => {
                e.preventDefault()
                insert(m)
              }}
              className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 font-medium ${i === pick ? 'bg-raised' : ''}`}
            >
              <Avatar member={m} size={24} /> {m.name}
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={ref}
        rows={1}
        value={text}
        maxLength={4000}
        placeholder="Write a comment, @ to mention"
        aria-label="Comment"
        onChange={(e) => {
          setText(e.target.value)
          track(e.target)
        }}
        onClick={(e) => track(e.currentTarget)}
        onKeyDown={(e) => {
          const key = e.key
          if (matches.length) {
            if (key === 'ArrowDown' || key === 'ArrowUp') {
              e.preventDefault()
              setPick((n) => (n + (key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length)
              return
            }
            if (key === 'Enter' || key === 'Tab') {
              e.preventDefault()
              insert(matches[pick])
              return
            }
            if (key === 'Escape') {
              e.preventDefault()
              setQuery(null)
              return
            }
          }
          // Enter sends on desktop; on phones it stays a newline and the button sends
          if (key === 'Enter' && !e.shiftKey && matchMedia('(pointer: fine)').matches) {
            e.preventDefault()
            send()
          }
        }}
        className={`${field} field-sizing-content max-h-40 resize-none`}
      />
      <button disabled={!text.trim()} aria-label="Send comment" className={`${pill} size-11 shrink-0`}>
        <Send size={18} />
      </button>
    </form>
  )
}
