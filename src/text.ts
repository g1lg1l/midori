// Pure text helpers, kept free of the Supabase client so scripts/check-text.mjs can run them in Node.
import type { Member } from './lib'

// ponytail: float midpoints run out of precision after ~50 drops into the same gap; renumber a column if that ever bites
export const between = (before?: number, after?: number) =>
  before === undefined ? (after === undefined ? 1 : after - 1) : after === undefined ? before + 1 : (before + after) / 2

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Longest names first so "@Ann Lee" wins over "@Ann".
export function mentionPattern(members: Pick<Member, 'name'>[]) {
  const names = members.map((m) => escape(m.name)).sort((a, b) => b.length - a.length)
  return names.length ? new RegExp(`@(${names.join('|')})`, 'gi') : null
}

export function mentionedIds(body: string, members: Pick<Member, 'name' | 'user_id'>[]) {
  const re = mentionPattern(members)
  if (!re) return []
  const found = new Set([...body.matchAll(re)].map((m) => m[1].toLowerCase()))
  return members.filter((m) => found.has(m.name.toLowerCase())).map((m) => m.user_id)
}

const taskItem = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])\]/

// Flips the "- [ ]" checkbox of the list item that starts at `offset` in the markdown source.
export function toggleCheckbox(source: string, offset: number) {
  const m = taskItem.exec(source.slice(offset))
  if (!m) return source
  const i = offset + m[1].length
  return source.slice(0, i) + (m[2] === ' ' ? 'x' : ' ') + source.slice(i + 1)
}

export function checklist(source: string) {
  const boxes = [...source.matchAll(new RegExp(taskItem.source, 'gm'))]
  return { done: boxes.filter((m) => m[2] !== ' ').length, total: boxes.length }
}

export const firstImage = (source: string) => /!\[[^\]]*\]\(\s*<?([^)\s>]+)/.exec(source)?.[1]
