// Exercises the permission rules against the linked project with three anonymous users.
// Leaves 3 anonymous users behind in auth.users; the workspace itself is deleted.
import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'

const user = async () => {
  const c = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInAnonymously()
  if (error) throw error
  return [c, data.user.id]
}
const ok = ({ data, error }) => { if (error) throw error; return data }
const denied = async (q) => assert.ok((await q).error, 'expected an error')
const rows = async (q) => ok(await q).length

const [master, masterId] = await user()
const [friend] = await user()
const [stranger] = await user()

const ws = ok(await master.rpc('create_workspace', { workspace_name: 'rls check', member_name: 'Master' }))
try {
  const { invite_code } = ok(await master.from('workspaces').select('invite_code').eq('id', ws).single())

  assert.equal(await rows(stranger.from('columns').select().eq('workspace_id', ws)), 0)
  await denied(stranger.rpc('join_workspace', { code: 'nope', member_name: 'x' }))
  assert.equal(ok(await friend.rpc('join_workspace', { code: invite_code, member_name: 'Friend' })), ws)
  assert.equal((await stranger.rpc('join_workspace', { code: invite_code, member_name: 'friend' })).error?.code, '23505')

  const cols = ok(await friend.from('columns').select().eq('workspace_id', ws).order('position'))
  assert.equal(cols.length, 3)
  assert.equal(await rows(friend.from('columns').update({ name: 'hacked' }).eq('id', cols[0].id).select()), 0)
  await denied(friend.from('columns').insert({ workspace_id: ws, name: 'x' }))

  const task = (c, title) => c.from('tasks').insert({ workspace_id: ws, column_id: cols[0].id, title }).select().single()
  const mTask = ok(await task(master, 'master task'))
  const fTask = ok(await task(friend, 'friend task'))
  await denied(task(stranger, 'stranger task'))

  assert.equal(await rows(friend.from('tasks').update({ title: 'x' }).eq('id', mTask.id).select()), 0)
  assert.equal(await rows(friend.from('tasks').update({ column_id: cols[1].id }).eq('id', fTask.id).select()), 1)
  assert.equal(await rows(master.from('tasks').update({ title: 'by master' }).eq('id', fTask.id).select()), 1)
  await denied(friend.from('tasks').update({ created_by: masterId }).eq('id', fTask.id))

  ok(await friend.from('comments').insert({ workspace_id: ws, task_id: mTask.id, body: '@Master hi', mentions: [masterId] }))
  await denied(friend.from('comments').insert({ workspace_id: ws, task_id: mTask.id, body: 'x', author_id: masterId }))
  await denied(stranger.from('comments').insert({ workspace_id: ws, task_id: mTask.id, body: 'x' }))

  console.log('RLS check passed')
} finally {
  ok(await master.from('workspaces').delete().eq('id', ws))
}
