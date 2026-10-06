import { ChevronLeft, ChevronRight, Copy, Crown, ListChecks, Lock, MessageCircle, MoreHorizontal, Plus, RefreshCw, Trash2, UserPlus, UserRound, X } from 'lucide-react'
import { Fragment, lazy, Suspense, useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { flushSync } from 'react-dom'
import { AccountSheet, useAccount } from './Account'
import {
  assignColors, colorOf, errorText, go, inviteUrl, supabase, toast, uploadImage,
  type Column, type Comment, type Member, type Task, type Workspace,
} from './lib'
import { between, checklist, firstImage, mentionedIds } from './text'
import { Avatar, btn, burst, danger, Editable, field, fieldBare, ghost, iconBtn, link, Logo, outline, pill, reducedMotion, Sheet, Splash, Toggle } from './ui'

type Data = { workspace?: Workspace | null; members: Member[]; columns: Column[]; tasks: Task[]; comments: Comment[] }
type Table = 'members' | 'columns' | 'tasks' | 'comments'
type AnyRow = Record<string, unknown>
type Point = { x: number; y: number }

// markdown rendering only loads once a task is opened
const TaskSheet = lazy(() => import('./TaskSheet').then((m) => ({ default: m.TaskSheet })))

const COLORS = ['mint', 'sky', 'peach', 'lilac', 'lemon', 'rose']
const EMOJI = ['💡', '📋', '🔨', '🧪', '🐛', '🎨', '🎵', '🧩', '🚀', '👀', '✅', '🎉']

export function Board({ id, me }: { id: string; me: string }) {
  const [data, setData] = useState<Data>({ members: [], columns: [], tasks: [], comments: [] })
  const [openTask, setOpenTask] = useState<string>()
  const [settings, setSettings] = useState(false)
  const [account, setAccount] = useState(false)
  const [editColumn, setEditColumn] = useState<string>()
  const [dragging, setDragging] = useState<string>()
  const [target, setTarget] = useState<{ col: string; index: number }>()
  const [moving, setMoving] = useState<string>()
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set())
  const [active, setActive] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)
  const username = useAccount()

  // Rows are applied idempotently, so our own writes and their realtime echo can both land.
  const put = (table: Table, row: AnyRow) => {
    const key = table === 'members' ? 'user_id' : 'id'
    setData((d) => ({ ...d, [table]: [...(d[table] as unknown as AnyRow[]).filter((r) => r[key] !== row[key]), row] }))
  }
  const patch = (table: 'columns' | 'tasks', rowId: string, change: AnyRow) =>
    setData((d) => ({ ...d, [table]: (d[table] as unknown as AnyRow[]).map((r) => (r.id === rowId ? { ...r, ...change } : r)) }))
  const drop = (table: Table, rowId: unknown) =>
    setData((d) => ({ ...d, [table]: (d[table] as unknown as AnyRow[]).filter((r) => r.id !== rowId) }))
  // new cards pop in once
  const markFresh = (taskId: string) => {
    setFresh((s) => new Set(s).add(taskId))
    setTimeout(() => setFresh((s) => new Set([...s].filter((x) => x !== taskId))), 600)
  }

  const load = useCallback(async () => {
    const [w, m, c, t, cm] = await Promise.all([
      supabase.from('workspaces').select().eq('id', id).maybeSingle(),
      supabase.from('members').select().eq('workspace_id', id),
      supabase.from('columns').select().eq('workspace_id', id),
      supabase.from('tasks').select().eq('workspace_id', id),
      supabase.from('comments').select().eq('workspace_id', id),
    ])
    const error = w.error ?? m.error ?? c.error ?? t.error ?? cm.error
    if (error) return toast(errorText(error))
    setData({ workspace: w.data, members: m.data!, columns: c.data!, tasks: t.data!, comments: cm.data! })
  }, [id])

  useEffect(() => {
    load()
    const filter = `workspace_id=eq.${id}`
    const channel = supabase.channel(`project:${id}`)
    for (const table of ['members', 'columns', 'tasks', 'comments'] as const) {
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, (p) => {
          put(table, p.new)
          if (table === 'tasks') markFresh(p.new.id)
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter }, (p) => put(table, p.new))
      // delete events can't be filtered; unknown ids are simply ignored
      if (table !== 'members') channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => drop(table, p.old.id))
    }
    channel
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'workspaces', filter: `id=eq.${id}` }, (p) =>
        setData((d) => ({ ...d, workspace: p.new as Workspace })),
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'workspaces' }, (p) => {
        if (p.old.id === id) setData((d) => ({ ...d, workspace: null }))
      })
      // (re)subscribed after a dropped connection: catch up on anything missed
      .subscribe((status) => status === 'SUBSCRIBED' && load())
    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, load])

  const { workspace, members, columns, tasks, comments } = data
  if (workspace === undefined) return <Splash />
  if (workspace === null)
    return (
      <main className="mx-auto grid min-h-dvh max-w-md content-center px-5">
        <Logo className="size-12" />
        <h1 className="mt-8 font-display text-2xl font-bold">This project isn't available</h1>
        <p className="mt-3 text-mute">It was deleted, or you haven't joined it. Ask for an invite link.</p>
        <button onClick={() => go({}, true)} className={`${btn} mt-8 justify-self-start`}>
          Go to your projects
        </button>
      </main>
    )

  const isMaster = workspace.owner_id === me
  assignColors([...members].sort((a, b) => a.joined_at.localeCompare(b.joined_at)).map((m) => m.user_id))
  const member = (uid: string) => members.find((m) => m.user_id === uid)
  const cols = [...columns].sort((a, b) => a.position - b.position)
  const colOf = (colId: string) => columns.find((c) => c.id === colId)
  const tasksIn = (colId: string) => tasks.filter((t) => t.column_id === colId).sort((a, b) => a.position - b.position)
  const commentsOn = (taskId: string) => comments.filter((c) => c.task_id === taskId)
  // mirrors public.can_write_task in the database, which has the final say
  const canWrite = (col?: Column) => isMaster || (!!col && !col.locked)
  const canEdit = (t: Task) => isMaster || (canWrite(colOf(t.column_id)) && (t.created_by === me || workspace.members_edit_all))
  const fail = (error: unknown) => {
    toast(errorText(error))
    load()
  }

  async function addTask(columnId: string, title: string) {
    const last = tasksIn(columnId).at(-1)
    const { data: row, error } = await supabase
      .from('tasks')
      .insert({ workspace_id: id, column_id: columnId, title, position: between(last?.position) })
      .select()
      .single()
    if (error) return fail(error)
    flushSync(() => {
      put('tasks', row)
      markFresh(row.id)
    })
    document.querySelector(`[data-task="${row.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  async function updateTask(taskId: string, change: Partial<Task>) {
    patch('tasks', taskId, change)
    const { error } = await supabase.from('tasks').update(change).eq('id', taskId)
    if (error) fail(error)
  }

  function moveTask(task: Task, columnId: string, index?: number, at?: Point) {
    const list = tasksIn(columnId).filter((t) => t.id !== task.id)
    const i = index ?? list.length
    updateTask(task.id, { column_id: columnId, position: between(list[i - 1]?.position, list[i]?.position) })
    const last = cols.at(-1)
    if (last?.id === columnId && task.column_id !== columnId) {
      toast(`Nice one! "${task.title}" made it to ${last.name}`)
      burst(at?.x ?? innerWidth / 2, at?.y ?? innerHeight / 2, last.emoji || '🎉')
    }
  }

  async function deleteTask(task: Task) {
    setOpenTask(undefined)
    drop('tasks', task.id)
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) fail(error)
  }

  async function addComment(task: Task, body: string) {
    const { data: row, error } = await supabase
      .from('comments')
      .insert({ workspace_id: id, task_id: task.id, body, mentions: mentionedIds(body, members) })
      .select()
      .single()
    if (error) return fail(error)
    put('comments', row)
  }

  async function deleteComment(comment: Comment) {
    drop('comments', comment.id)
    const { error } = await supabase.from('comments').delete().eq('id', comment.id)
    if (error) fail(error)
  }

  async function addColumn(name: string) {
    const color = COLORS[cols.length % COLORS.length]
    const { data: row, error } = await supabase
      .from('columns')
      .insert({ workspace_id: id, name, color, position: between(cols.at(-1)?.position) })
      .select()
      .single()
    if (error) return fail(error)
    put('columns', row)
  }

  async function updateColumn(col: Column, change: Partial<Column>) {
    patch('columns', col.id, change)
    const { error } = await supabase.from('columns').update(change).eq('id', col.id)
    if (error) fail(error)
  }

  function shiftColumn(col: Column, dir: -1 | 1) {
    const i = cols.indexOf(col)
    const position = dir < 0 ? between(cols[i - 2]?.position, cols[i - 1].position) : between(cols[i + 1].position, cols[i + 2]?.position)
    updateColumn(col, { position })
  }

  async function deleteColumn(col: Column) {
    const count = tasksIn(col.id).length
    if (count && !confirm(`Delete "${col.name}" and its ${count} ${count === 1 ? 'task' : 'tasks'}?`)) return
    setEditColumn(undefined)
    drop('columns', col.id)
    const { error } = await supabase.from('columns').delete().eq('id', col.id)
    if (error) fail(error)
  }

  async function updateWorkspace(change: Partial<Workspace>) {
    setData((d) => ({ ...d, workspace: { ...d.workspace!, ...change } }))
    const { error } = await supabase.from('workspaces').update(change).eq('id', id)
    if (error) fail(error)
  }

  async function deleteWorkspace() {
    if (!confirm(`Delete "${workspace!.name}" for everyone? All columns, tasks, comments and images go with it.`)) return
    // ponytail: images of deleted tasks stay until the project goes; per-task cleanup if storage gets tight
    const images = await supabase.storage.from('images').list(id, { limit: 1000 })
    if (images.data?.length) await supabase.storage.from('images').remove(images.data.map((f) => `${id}/${f.name}`))
    const { error } = await supabase.from('workspaces').delete().eq('id', id)
    if (error) return fail(error)
    go({}, true)
  }

  async function rename(name: string) {
    const self = member(me)
    if (!self) return
    put('members', { ...self, name })
    const { error } = await supabase.from('members').update({ name }).eq('workspace_id', id).eq('user_id', me)
    if (error) fail(error)
  }

  async function invite() {
    const url = inviteUrl(workspace!.invite_code)
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title: workspace!.name, text: `Join ${workspace!.name} on Midori`, url }).catch(() => {})
      return
    }
    await navigator.clipboard.writeText(url)
    toast('Invite link copied. Send it to your team!')
  }

  // Where a dragged card would land among the other cards of the column under the pointer.
  function dropIndex(e: DragEvent<HTMLElement>) {
    const cards = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-task]')].filter((el) => el.dataset.task !== dragging)
    const i = cards.findIndex((el) => {
      const r = el.getBoundingClientRect()
      return e.clientY < r.top + r.height / 2
    })
    return i < 0 ? cards.length : i
  }

  function onDragOver(e: DragEvent<HTMLElement>, col: Column) {
    if (!dragging) return
    e.preventDefault()
    e.dataTransfer.dropEffect = canWrite(col) ? 'move' : 'none'
    const index = canWrite(col) ? dropIndex(e) : -1
    if (target?.col !== col.id || target.index !== index) setTarget({ col: col.id, index })
  }

  function onDrop(e: DragEvent<HTMLElement>, col: Column) {
    e.preventDefault()
    const task = tasks.find((t) => t.id === dragging)
    const index = dropIndex(e)
    const at = { x: e.clientX, y: e.clientY }
    const settle = () => {
      setDragging(undefined)
      setTarget(undefined)
    }
    if (!task || !canEdit(task)) return settle()
    if (!canWrite(col)) {
      settle()
      return toast(`🔒 Only the master can move tasks into ${col.name}`)
    }
    if (!('startViewTransition' in document) || reducedMotion()) {
      settle()
      return moveTask(task, col.id, index, at)
    }
    // the dropped card flies from its old spot to the new one (view-transition-name: moving-card)
    flushSync(() => setMoving(task.id))
    document
      .startViewTransition(() =>
        flushSync(() => {
          settle()
          moveTask(task, col.id, index, at)
        }),
      )
      .finished.finally(() => setMoving(undefined))
  }

  function onScroll() {
    const el = scroller.current
    const first = el?.firstElementChild as HTMLElement | null
    if (el && first) setActive(Math.round(el.scrollLeft / (first.offsetWidth + 12)))
  }

  const jumpTo = (i: number) =>
    scroller.current?.children[i]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })

  const task = tasks.find((t) => t.id === openTask)
  const column = cols.find((c) => c.id === editColumn)

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-6 sm:pt-5">
        <button onClick={() => go({})} aria-label="Your projects" title="Your projects" className="shrink-0 rounded-xl transition hover:-rotate-6 active:scale-90">
          <Logo className="size-9" />
        </button>
        <h1 className="min-w-0 flex-1 truncate font-display text-[clamp(18px,4.6vw,26px)] font-bold tracking-tight">{workspace.name}</h1>
        <button onClick={() => setSettings(true)} aria-label="Members and settings" className="flex shrink-0 items-center rounded-full transition active:scale-95">
          <span className="flex -space-x-2 [&>*]:ring-2 [&>*]:ring-paper">
            {members.slice(0, 4).map((m) => (
              <Avatar key={m.user_id} member={m} size={30} />
            ))}
          </span>
          {members.length > 4 && <span className="ml-1.5 text-sm font-semibold text-mute">+{members.length - 4}</span>}
        </button>
        <button onClick={invite} className={`${pill} h-9 px-3 text-sm sm:px-4`}>
          <UserPlus size={17} aria-hidden />
          <span className="max-sm:sr-only">Invite</span>
        </button>
      </header>

      <nav aria-label="Columns" className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-3 sm:hidden">
        {cols.map((c, i) => (
          <button
            key={c.id}
            onClick={() => jumpTo(i)}
            aria-current={i === active}
            className={`h-8 shrink-0 rounded-full px-3 text-sm font-semibold transition active:scale-95 ${i === active ? 'bg-primary text-on-primary' : 'border border-line bg-sheet text-mute'}`}
          >
            {c.emoji && <span className="mr-1">{c.emoji}</span>}
            {c.name}
            <span className="ml-1.5 opacity-60">{tasksIn(c.id).length}</span>
          </button>
        ))}
      </nav>

      {/* Columns scroll sideways here (scrollbar on the bottom edge on desktop) and each column's list scrolls on its own. */}
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 snap-x snap-mandatory items-start gap-3 overflow-x-auto overscroll-x-contain px-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))] max-sm:no-scrollbar sm:snap-none sm:px-6"
      >
        {cols.map((c) => {
          const list = tasksIn(c.id)
          const others = list.filter((t) => t.id !== dragging)
          const over = target?.col === c.id
          const marker = over && target.index >= 0
          return (
            <section
              key={c.id}
              aria-label={c.name}
              onDragOver={(e) => onDragOver(e, c)}
              onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && over && setTarget(undefined)}
              onDrop={(e) => onDrop(e, c)}
              style={{ background: `var(--c-${c.color})` }}
              // ring-inset: drawn inside the column, so the scroller can't clip it
              className={`flex max-h-full w-[86vw] max-w-sm shrink-0 snap-center flex-col rounded-[22px] ring-inset transition-shadow sm:w-72 ${over ? (canWrite(c) ? 'ring-2 ring-brand' : 'ring-2 ring-danger/60') : ''}`}
            >
              <div className="flex items-center gap-2 py-2 pr-1.5 pl-4">
                {c.emoji && <span className="text-lg leading-none">{c.emoji}</span>}
                <h2 className="truncate text-[15px] font-bold">{c.name}</h2>
                <span className="rounded-full bg-sheet/70 px-2 text-xs font-semibold text-mute tabular-nums">{list.length}</span>
                {c.locked && <Lock size={14} className="shrink-0 text-mute" aria-label="Locked: only the master changes tasks here" />}
                {isMaster ? (
                  <button onClick={() => setEditColumn(c.id)} aria-label={`Edit column ${c.name}`} className={`${iconBtn} ml-auto`}>
                    <MoreHorizontal size={18} />
                  </button>
                ) : (
                  <span className="h-9" />
                )}
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-2 pt-1 pb-2">
                {list.length === 0 && !marker && <p className="px-2 py-3 text-center text-sm text-mute">{canWrite(c) ? 'Nothing here yet' : 'Only the master adds tasks here'}</p>}
                {list.map((t) => (
                  <Fragment key={t.id}>
                    {marker && others[target.index]?.id === t.id && <DropMarker />}
                    <Card
                      task={t}
                      me={me}
                      author={member(t.created_by)}
                      comments={commentsOn(t.id)}
                      draggable={canEdit(t)}
                      dragging={dragging === t.id}
                      moving={moving === t.id}
                      fresh={fresh.has(t.id)}
                      onOpen={() => setOpenTask(t.id)}
                      onDragStart={() => setTimeout(() => setDragging(t.id))} // after the browser grabs the drag image
                      onDragEnd={() => {
                        setDragging(undefined)
                        setTarget(undefined)
                      }}
                    />
                  </Fragment>
                ))}
                {marker && target.index === others.length && <DropMarker />}
              </div>
              {canWrite(c) && <InlineAdd label="Add task" placeholder="What needs doing?" maxLength={200} onAdd={(title) => addTask(c.id, title)} />}
            </section>
          )
        })}
        {isMaster && (
          <div className="w-[86vw] max-w-sm shrink-0 snap-center rounded-[22px] border-2 border-dashed border-line sm:w-72">
            <InlineAdd label="Add column" placeholder="Column name" maxLength={40} onAdd={addColumn} />
          </div>
        )}
      </div>

      {task && (
        <Suspense>
          <TaskSheet
            key={task.id}
            task={task}
            me={me}
            columns={cols}
            members={members}
            comments={commentsOn(task.id).sort((a, b) => a.created_at.localeCompare(b.created_at))}
            canEdit={canEdit(task)}
            canMoveTo={canWrite}
            isMaster={isMaster}
            onClose={() => setOpenTask(undefined)}
            onUpdate={(change) => updateTask(task.id, change)}
            onMove={(colId, at) => moveTask(task, colId, undefined, at)}
            onDelete={() => confirm('Delete this task and its comments?') && deleteTask(task)}
            onComment={(body) => addComment(task, body)}
            onDeleteComment={deleteComment}
            onUpload={(file) => uploadImage(id, file)}
          />
        </Suspense>
      )}

      {column && (
        <Sheet label={`Edit column ${column.name}`} header={<h2 className="font-semibold">Edit column</h2>} onClose={() => setEditColumn(undefined)}>
          <div className="grid gap-6">
            <div className="flex gap-2">
              <label className="grid w-20 gap-1.5">
                <span className="text-sm font-medium">Emoji</span>
                <Editable value={column.emoji} onSave={(emoji) => updateColumn(column, { emoji })} maxLength={16} aria-label="Column emoji" className={`${fieldBare} bg-raised text-center text-lg`} />
              </label>
              <label className="grid flex-1 gap-1.5">
                <span className="text-sm font-medium">Name</span>
                <Editable value={column.name} onSave={(name) => updateColumn(column, { name })} maxLength={40} aria-label="Column name" className={field} />
              </label>
            </div>
            <div role="group" aria-label="Quick emoji" className="-mt-3 flex flex-wrap gap-1">
              {EMOJI.map((e) => (
                <button
                  key={e}
                  onClick={() => updateColumn(column, { emoji: column.emoji === e ? '' : e })}
                  aria-pressed={column.emoji === e}
                  className={`grid size-9 place-items-center rounded-xl text-lg transition hover:scale-115 active:scale-90 ${column.emoji === e ? 'bg-raised ring-2 ring-brand' : ''}`}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Color</span>
              <div role="radiogroup" aria-label="Column color" className="flex gap-2.5">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    role="radio"
                    aria-checked={column.color === color}
                    aria-label={color}
                    onClick={() => updateColumn(column, { color })}
                    style={{ background: `var(--c-${color})` }}
                    className={`size-9 rounded-full border border-line transition hover:scale-110 active:scale-90 ${column.color === color ? 'ring-2 ring-brand ring-offset-2 ring-offset-sheet' : ''}`}
                  />
                ))}
              </div>
            </div>
            <Toggle
              label="Lock column"
              hint="Only you can add, edit or move tasks here. Everyone can still comment."
              checked={column.locked}
              onChange={(locked) => updateColumn(column, { locked })}
            />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => shiftColumn(column, -1)} disabled={cols[0] === column} className={`${ghost} border border-line disabled:opacity-40`}>
                <ChevronLeft size={16} aria-hidden /> Move left
              </button>
              <button onClick={() => shiftColumn(column, 1)} disabled={cols.at(-1) === column} className={`${ghost} border border-line disabled:opacity-40`}>
                Move right <ChevronRight size={16} aria-hidden />
              </button>
              <button onClick={() => deleteColumn(column)} className={`${danger} ml-auto px-3`}>
                <Trash2 size={16} aria-hidden /> Delete
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {settings && (
        <Sheet label="Project settings" header={<h2 className="font-semibold">Project</h2>} onClose={() => setSettings(false)}>
          <div className="grid gap-7">
            {isMaster && (
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">Project name</span>
                <Editable value={workspace.name} onSave={(name) => updateWorkspace({ name })} maxLength={80} aria-label="Project name" className={field} />
              </label>
            )}
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">Your name in this project</span>
              <Editable value={member(me)?.name ?? ''} onSave={rename} maxLength={40} aria-label="Your name" className={field} />
            </label>

            <div className="grid gap-2 rounded-2xl bg-raised p-4">
              <span className="flex items-center gap-2 text-sm font-medium">
                <UserRound size={16} aria-hidden /> {username ? `Signed in as ${username}` : 'Guest on this device'}
              </span>
              <p className="text-sm text-mute">
                {username
                  ? 'Sign in with your username on any device to open this project.'
                  : isMaster
                    ? 'Save an account so you can run this project from your other devices, and keep it if this browser gets cleared.'
                    : 'Save an account to open your projects on other devices.'}
              </p>
              <button onClick={() => setAccount(true)} className={`${outline} h-9 justify-self-start bg-sheet text-sm`}>
                {username ? 'Manage account' : 'Save account'}
              </button>
            </div>

            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Invite link</span>
              <div className="flex gap-2">
                <input readOnly value={inviteUrl(workspace.invite_code)} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} className={`${field} min-w-0 text-mute`} />
                <button
                  onClick={() => navigator.clipboard.writeText(inviteUrl(workspace.invite_code)).then(() => toast('Invite link copied'))}
                  className={`${pill} px-4`}
                >
                  <Copy size={16} aria-hidden /> Copy
                </button>
              </div>
              <p className="text-sm text-mute">Anyone with this link can join.</p>
              {isMaster && (
                <button
                  onClick={() =>
                    confirm('Make a new invite link? The current one will stop working.') &&
                    updateWorkspace({ invite_code: crypto.randomUUID().replaceAll('-', '') })
                  }
                  className={link}
                >
                  <RefreshCw size={15} aria-hidden /> Reset link
                </button>
              )}
            </div>

            {isMaster && (
              <div className="grid gap-1.5">
                <span className="text-sm font-medium">Report key</span>
                <div className="flex gap-2">
                  <input readOnly value={workspace.report_key} aria-label="Report key" onFocus={(e) => e.currentTarget.select()} className={`${field} min-w-0 text-mute`} />
                  <button
                    onClick={() => navigator.clipboard.writeText(workspace.report_key).then(() => toast('Report key copied'))}
                    className={`${pill} px-4`}
                  >
                    <Copy size={16} aria-hidden /> Copy
                  </button>
                </div>
                <p className="text-sm text-mute">
                  Apps (a game's crash reports) send cards to the Debug column with this key, through the send_report call.
                </p>
                <button
                  onClick={() =>
                    confirm('Make a new report key? Apps using the current one will stop reporting.') &&
                    updateWorkspace({ report_key: crypto.randomUUID().replaceAll('-', '') })
                  }
                  className={link}
                >
                  <RefreshCw size={15} aria-hidden /> Reset key
                </button>
              </div>
            )}

            {isMaster && (
              <Toggle
                label="Members can edit everyone's tasks"
                hint="When off, members only edit and move the tasks they added. Locked columns stay yours either way."
                checked={workspace.members_edit_all}
                onChange={(members_edit_all) => updateWorkspace({ members_edit_all })}
              />
            )}

            <div>
              <span className="text-sm font-medium">Members</span>
              <ul className="mt-2 grid gap-2.5">
                {[...members]
                  .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
                  .map((m) => (
                    <li key={m.user_id} className="flex items-center gap-3">
                      <Avatar member={m} size={32} />
                      <span className="min-w-0 truncate font-medium">
                        {m.name}
                        {m.user_id === me && <span className="font-normal text-mute"> (you)</span>}
                      </span>
                      {m.user_id === workspace.owner_id && (
                        <span className="ml-auto flex items-center gap-1 text-sm text-mute">
                          <Crown size={14} aria-hidden /> Master
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </div>

            {isMaster && (
              <button onClick={deleteWorkspace} className={danger}>
                <Trash2 size={16} aria-hidden /> Delete project
              </button>
            )}
          </div>
        </Sheet>
      )}

      {account && <AccountSheet onClose={() => setAccount(false)} />}
    </div>
  )
}

const DropMarker = () => <div aria-hidden className="pop mx-1 h-1 shrink-0 rounded-full bg-brand" />

function Card(p: {
  task: Task
  me: string
  author?: Member
  comments: Comment[]
  draggable: boolean
  dragging: boolean
  moving: boolean
  fresh: boolean
  onOpen: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const { task, author, comments } = p
  const cover = firstImage(task.description)
  const { done, total } = checklist(task.description)
  const mentioned = comments.some((c) => c.mentions.includes(p.me))
  return (
    <button
      data-task={task.id}
      draggable={p.draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id)
        e.dataTransfer.effectAllowed = 'move'
        p.onDragStart()
      }}
      onDragEnd={p.onDragEnd}
      onClick={p.onOpen}
      style={{ viewTransitionName: p.moving ? 'moving-card' : undefined }}
      className={`relative w-full shrink-0 overflow-hidden rounded-2xl border border-line/70 bg-sheet text-left shadow-[0_1px_0_var(--line)] transition hover:border-mute/40 hover:shadow-[0_6px_16px_-8px_rgb(0_0_0/0.3)] focus-visible:outline-offset-[-2px] active:scale-[0.98] ${p.dragging ? 'opacity-40' : ''} ${p.fresh ? 'pop' : ''}`}
    >
      {cover && <img src={cover} alt="" loading="lazy" draggable={false} className="h-28 w-full object-cover" />}
      <span className="block py-3 pr-3 pl-5">
        <span aria-hidden className="absolute bottom-3 left-2 w-1 rounded-full" style={{ top: cover ? '7.75rem' : '0.75rem', background: author ? colorOf(author.user_id) : 'var(--line)' }} />
        <span className="block text-[15px] leading-snug font-semibold break-words">{task.title}</span>
        <span className="mt-2.5 flex items-center gap-2.5 text-xs text-mute">
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar member={author} size={18} />
            <span className="truncate">{author?.name ?? 'Former member'}</span>
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            {total > 0 && (
              <span className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 tabular-nums ${done === total ? 'bg-brand/15 font-semibold text-ink' : ''}`}>
                <ListChecks size={13} aria-hidden />
                {done}/{total}
              </span>
            )}
            {comments.length > 0 && (
              <span
                className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 tabular-nums ${mentioned ? 'bg-marker font-semibold text-on-marker' : ''}`}
                title={mentioned ? 'You were mentioned' : undefined}
              >
                <MessageCircle size={13} aria-hidden />
                {comments.length}
              </span>
            )}
          </span>
        </span>
      </span>
    </button>
  )
}

function InlineAdd({ label, placeholder, maxLength, onAdd }: { label: string; placeholder: string; maxLength: number; onAdd: (text: string) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  function submit() {
    const value = text.trim()
    if (value) onAdd(value)
    setText('')
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className={`${ghost} m-2 self-start`}>
        <Plus size={17} aria-hidden /> {label}
      </button>
    )

  return (
    <form
      className="pop m-2 grid gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <textarea
        autoFocus
        rows={2}
        value={text}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
          if (e.key === 'Escape') setOpen(false)
        }}
        onBlur={(e) => !text.trim() && !e.currentTarget.form?.contains(e.relatedTarget) && setOpen(false)}
        className={`${fieldBare} resize-none bg-sheet text-[15px]`}
      />
      <div className="flex gap-2">
        <button className={`${pill} h-9 px-4 text-sm`}>{label}</button>
        <button type="button" onClick={() => setOpen(false)} aria-label="Cancel" className={iconBtn}>
          <X size={18} />
        </button>
      </div>
    </form>
  )
}
