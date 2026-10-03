import { LogOut } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { errorText, supabase, toast, toEmail, usernameOf, usernameRule } from './lib'
import { btn, danger, field, outline, Sheet } from './ui'

// Signed-in username, or null while this device is a guest (anonymous user).
export function useAccount() {
  const [username, setUsername] = useState<string | null>(null)
  useEffect(() => {
    const read = (user?: { is_anonymous?: boolean; email?: string }) => setUsername(user && !user.is_anonymous ? usernameOf(user.email) : null)
    supabase.auth.getSession().then(({ data }) => read(data.session?.user))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => read(session?.user))
    return () => data.subscription.unsubscribe()
  }, [])
  return username
}

const values = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault()
  const form = new FormData(e.currentTarget)
  return { username: String(form.get('username') ?? ''), password: String(form.get('password')) }
}

function Fields({ newPassword }: { newPassword?: boolean }) {
  return (
    <>
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Username</span>
        <input name="username" required {...usernameRule} autoComplete="username" autoCapitalize="none" spellCheck={false} className={field} />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Password</span>
        <input name="password" type="password" required minLength={8} autoComplete={newPassword ? 'new-password' : 'current-password'} className={field} />
      </label>
    </>
  )
}

export function AccountSheet({ onClose }: { onClose: () => void }) {
  const username = useAccount()
  const [busy, setBusy] = useState(false)

  async function run(work: () => Promise<{ error: unknown }>, done: () => void) {
    setBusy(true)
    const { error } = await work()
    setBusy(false)
    if (error) return toast(errorText(error))
    done()
  }

  // Same user id, so every project (and the master role) comes along.
  const save = (e: FormEvent<HTMLFormElement>) => {
    const { username: name, password } = values(e)
    run(() => supabase.auth.updateUser({ email: toEmail(name), password }), () => toast(`Account saved. Sign in as ${name.toLowerCase()} on your other devices.`))
  }

  // A different user id: reload so the whole app starts over as that account.
  const signIn = (e: FormEvent<HTMLFormElement>) => {
    const { username: name, password } = values(e)
    run(() => supabase.auth.signInWithPassword({ email: toEmail(name), password }), () => location.reload())
  }

  const changePassword = (e: FormEvent<HTMLFormElement>) => {
    const { password } = values(e)
    const form = e.currentTarget
    run(() => supabase.auth.updateUser({ password }), () => {
      form.reset()
      toast('Password changed')
    })
  }

  async function signOut() {
    if (!confirm('Sign out on this device? Sign back in with your username any time.')) return
    await supabase.auth.signOut()
    location.reload()
  }

  return (
    <Sheet label="Your account" header={<h2 className="font-semibold">Your account</h2>} onClose={onClose}>
      {username ? (
        <div className="grid gap-7">
          <p className="text-[15px] leading-relaxed">
            Signed in as <b>{username}</b>. Sign in with this username on any device to open the same projects.
          </p>
          <form onSubmit={changePassword} className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">New password</span>
              <input name="password" type="password" required minLength={8} autoComplete="new-password" className={field} />
            </label>
            <button disabled={busy} className={`${btn} justify-self-start`}>
              Change password
            </button>
          </form>
          <button onClick={signOut} className={danger}>
            <LogOut size={16} aria-hidden /> Sign out
          </button>
        </div>
      ) : (
        <div className="grid gap-8">
          <form onSubmit={save} className="grid gap-4">
            <p className="text-[15px] leading-relaxed text-mute">
              You're a guest on this device. Save an account to keep your projects and open them on your phone, laptop or any other device.
            </p>
            <Fields newPassword />
            <button disabled={busy} className={btn}>
              Save account
            </button>
          </form>
          <form onSubmit={signIn} className="grid gap-4 border-t border-line pt-6">
            <h3 className="font-semibold">Already have an account?</h3>
            <Fields />
            <button disabled={busy} className={outline}>
              Sign in
            </button>
            <p className="text-sm text-mute">Projects you joined here as a guest stay with the guest.</p>
          </form>
        </div>
      )}
    </Sheet>
  )
}
