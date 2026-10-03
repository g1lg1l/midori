import { ChevronRight, Crown, Share, UserRound } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { AccountSheet, useAccount } from './Account'
import { clearInstallPrompt, colorOf, errorText, go, installPrompt, me, savedName, supabase, toast } from './lib'
import { btn, field, ghost, Logo, pill, Splash } from './ui'

type Project = { id: string; name: string; owner_id: string; members: { count: number }[] }

export function Home() {
  const [projects, setProjects] = useState<Project[]>()
  const [uid, setUid] = useState('')
  const [account, setAccount] = useState(false)
  const username = useAccount()

  useEffect(() => {
    me.then(setUid)
    supabase
      .from('workspaces')
      .select('id, name, owner_id, members(count)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => (error ? toast(errorText(error)) : setProjects(data)))
  }, [])

  if (!projects) return <Splash />

  return (
    <main className="mx-auto max-w-xl px-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-16">
      <header className="flex items-center gap-3">
        <Logo className="size-11" />
        <h1 className="font-display text-[28px] font-bold tracking-tight">midori</h1>
        <button onClick={() => setAccount(true)} className={`${ghost} ml-auto`}>
          <UserRound size={17} aria-hidden /> {username ?? 'Sign in'}
        </button>
      </header>
      <p className="mt-5 max-w-[34ch] text-[17px] leading-relaxed text-mute">
        Plan your game with friends. Make a project, share the link, and everyone's in. No sign-up needed.
      </p>

      {projects.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold text-mute">Your projects</h2>
          <ul className="mt-3 grid gap-2">
            {projects.map((p) => (
              <li key={p.id}>
                <a
                  href={`?p=${p.id}`}
                  onClick={(e) => {
                    e.preventDefault()
                    go({ p: p.id })
                  }}
                  className="flex items-center gap-4 rounded-2xl border border-line bg-sheet p-3.5 transition-colors hover:border-brand"
                >
                  <span
                    className="grid size-11 shrink-0 place-items-center rounded-xl font-display text-lg font-bold text-white"
                    style={{ background: colorOf(p.id) }}
                  >
                    {p.name.trim()[0]?.toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[16px] font-semibold">{p.name}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-sm text-mute">
                      {p.members[0]?.count ?? 1} {p.members[0]?.count === 1 ? 'member' : 'members'}
                      {p.owner_id === uid && (
                        <>
                          <Crown size={13} className="ml-1.5" aria-hidden /> Master
                        </>
                      )}
                    </span>
                  </span>
                  <ChevronRight size={20} className="text-mute" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-sm font-semibold text-mute">{projects.length ? 'New project' : 'Start your first project'}</h2>
        <CreateForm />
      </section>

      <InstallCard />
      {account && <AccountSheet onClose={() => setAccount(false)} />}
    </main>
  )
}

// Installed, it opens full screen like an app. Android gets a real button; iOS only allows Share > Add to Home Screen.
function InstallCard() {
  const [prompt, setPrompt] = useState(installPrompt)
  useEffect(() => {
    const ready = () => setPrompt(installPrompt)
    addEventListener('installable', ready)
    return () => removeEventListener('installable', ready)
  }, [])
  const installed = matchMedia('(display-mode: standalone)').matches || 'standalone' in navigator
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  if (installed || (!prompt && !ios)) return null

  return (
    <section className="mt-10 flex items-center gap-4 rounded-2xl border-2 border-dashed border-line p-4">
      <img src={`${import.meta.env.BASE_URL}apple-touch-icon.png`} alt="" className="size-12 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Put Midori on your home screen</p>
        <p className="mt-0.5 text-sm text-mute">
          {prompt ? (
            'It opens full screen, like an app.'
          ) : (
            <>
              Tap <Share size={14} className="inline align-[-2px]" aria-label="Share" /> then “Add to Home Screen”.
            </>
          )}
        </p>
      </div>
      {prompt && (
        <button
          onClick={async () => {
            await prompt.prompt()
            clearInstallPrompt()
            setPrompt(null)
          }}
          className={`${pill} h-9 px-4 text-sm`}
        >
          Install
        </button>
      )}
    </section>
  )
}

const nonBlank = { pattern: '.*\\S.*', title: "Can't be empty" }

function NameField() {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">Your name</span>
      <input name="member" required maxLength={40} {...nonBlank} defaultValue={savedName.get()} placeholder="How friends will see you" autoComplete="nickname" className={field} />
    </label>
  )
}

function CreateForm() {
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = String(form.get('member')).trim()
    setBusy(true)
    const { data, error } = await supabase.rpc('create_workspace', {
      workspace_name: String(form.get('project')).trim(),
      member_name: name,
    })
    setBusy(false)
    if (error) return toast(errorText(error))
    savedName.set(name)
    go({ p: data })
  }

  return (
    <form onSubmit={submit} className="mt-3 grid gap-4 rounded-2xl border border-line bg-sheet p-4">
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Project name</span>
        <input name="project" required maxLength={80} {...nonBlank} placeholder="e.g. Moss Knight" className={field} />
      </label>
      <NameField />
      <button disabled={busy} className={btn}>
        {busy ? 'Creating…' : 'Create project'}
      </button>
    </form>
  )
}

export function Join({ code }: { code: string }) {
  const [project, setProject] = useState<{ id: string; name: string } | null>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.rpc('invite_info', { code }).then(({ data, error }) => {
      if (error) toast(errorText(error))
      const found = data?.[0]
      if (found?.is_member) go({ p: found.id }, true)
      else setProject(found ?? null)
    })
  }, [code])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = String(new FormData(e.currentTarget).get('member')).trim()
    setBusy(true)
    const { data, error } = await supabase.rpc('join_workspace', { code, member_name: name })
    setBusy(false)
    if (error) return toast(errorText(error))
    savedName.set(name)
    go({ p: data }, true)
  }

  if (project === undefined) return <Splash />

  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center px-5 py-10">
      <Logo className="size-12" />
      {project ? (
        <>
          <p className="mt-8 text-mute">You're invited to</p>
          <h1 className="mt-1 break-words font-display text-[clamp(28px,8vw,40px)] font-bold leading-tight">{project.name}</h1>
          <form onSubmit={submit} className="mt-8 grid gap-4">
            <NameField />
            <button disabled={busy} className={btn}>
              {busy ? 'Joining…' : 'Join project'}
            </button>
          </form>
        </>
      ) : (
        <>
          <h1 className="mt-8 font-display text-2xl font-bold">This invite link doesn't work</h1>
          <p className="mt-3 text-mute">It may have been reset. Ask whoever runs the project for a new link.</p>
          <button onClick={() => go({}, true)} className={`${btn} mt-8 justify-self-start`}>
            Go to your projects
          </button>
        </>
      )}
    </main>
  )
}
