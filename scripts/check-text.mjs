import assert from 'node:assert/strict'
import { between, checklist, firstImage, mentionedIds, toggleCheckbox } from '../src/text.ts'

assert.equal(between(), 1)
assert.equal(between(1, 2), 1.5)
assert.equal(between(undefined, 1), 0)
assert.equal(between(3), 4)

const members = [{ name: 'Ann', user_id: 'a' }, { name: 'Ann Lee', user_id: 'b' }, { name: 'Bo (art)', user_id: 'c' }]
assert.deepEqual(mentionedIds('hey @ann lee and @Bo (art)', members), ['b', 'c'])
assert.deepEqual(mentionedIds('mail me at x@y.z', members), [])

const md = '# Jump\n- [ ] coyote time\n  - [x] buffer\n1. [ ] sfx\n- plain'
assert.equal(toggleCheckbox(md, md.indexOf('- [ ] coyote')), md.replace('- [ ] coyote', '- [x] coyote'))
assert.equal(toggleCheckbox(md, md.indexOf('- [x] buffer')), md.replace('- [x] buffer', '- [ ] buffer'))
assert.equal(toggleCheckbox(md, md.indexOf('1. [ ]')), md.replace('1. [ ]', '1. [x]'))
assert.equal(toggleCheckbox(md, md.indexOf('- plain')), md)
assert.deepEqual(checklist(md), { done: 1, total: 3 })

assert.equal(firstImage('see ![boss](https://x.co/a.webp) and ![](b.webp)'), 'https://x.co/a.webp')
assert.equal(firstImage('no images'), undefined)

console.log('text check passed')
