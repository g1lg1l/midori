import { useEffect, useState } from 'react'
import { Board } from './Board'
import { Home, Join } from './Home'
import { me } from './lib'
import { Logo, Splash, Toaster } from './ui'

export default function App() {
  const [params, setParams] = useState(() => new URLSearchParams(location.search))
  const [uid, setUid] = useState<string>()
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const sync = () => setParams(new URLSearchParams(location.search))
    addEventListener('popstate', sync)
    me.then(setUid, () => setOffline(true))
    return () => removeEventListener('popstate', sync)
  }, [])

  const project = params.get('p')
  const join = params.get('join')

  return (
    <>
      {offline ? (
        <main className="grid h-dvh place-items-center px-6 text-center">
          <div>
            <Logo className="size-12 mx-auto" />
            <p className="mt-6 font-semibold">Can't connect to Midori.</p>
            <p className="mt-1 text-mute">Check your connection, then reload the page.</p>
          </div>
        </main>
      ) : !uid ? (
        <Splash />
      ) : project ? (
        <Board key={project} id={project} me={uid} />
      ) : join ? (
        <Join code={join} />
      ) : (
        <Home />
      )}
      <Toaster />
    </>
  )
}
