import assert from 'node:assert/strict'
import { timingSafeEqual } from 'node:crypto'
import app from '../src/worker/index'
import { questions } from '../src/shared/questions'
import { getQuestionsForMode } from '../src/shared/game-config'

// Node lacks the Workers timingSafeEqual extension; use its native equivalent.
Object.assign(crypto.subtle, { timingSafeEqual })

assert.equal(questions.length, 200)
for (const q of questions) {
  assert.equal(q.choices.length, 4)
  assert.ok(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4)
}
for (const mode of [20, 50, 100] as const) {
  const selected = getQuestionsForMode(mode)
  assert.equal(new Set(selected).size, mode)
  const counts = [selected.filter(q => questions.indexOf(q) < 67).length, selected.filter(q => questions.indexOf(q) >= 67 && questions.indexOf(q) < 134).length, selected.filter(q => questions.indexOf(q) >= 134).length]
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1)
}

const data = new Map<string, string>()
let writes = 0
const expirations: number[] = []
const kv = {
  async put(key: string, value: string, options: { expirationTtl: number }) {
    data.set(key, value)
    writes++
    expirations.push(options.expirationTtl)
  },
  async get(key: string | string[], options?: unknown) {
    if (Array.isArray(key)) return new Map(key.map(k => [k, data.has(k) ? JSON.parse(data.get(k)!) : null]))
    const value = data.get(key)
    return value && options === 'json' ? JSON.parse(value) : value ?? null
  },
}
const limits = { api: true, create: true, write: true }
const limiter = (kind: keyof typeof limits) => ({ async limit() { return { success: limits[kind] } } })
const env = {
  QUIZ_KV: kv,
  API_RATE_LIMITER: limiter('api'), CREATE_RATE_LIMITER: limiter('create'), WRITE_RATE_LIMITER: limiter('write'),
} as unknown as CloudflareBindings
const auth = (token?: string) => token ? { authorization: `Bearer ${token}` } : {}
const post = (path: string, body: unknown, token?: string) => app.request(path, {
  method: 'POST', headers: { 'content-type': 'application/json', ...auth(token) }, body: JSON.stringify(body),
}, env)
const get = (path: string, token?: string) => app.request(path, { headers: auth(token) }, env)

for (const name of [null, 123, {}, [], '', ' ', 'a'.repeat(25), 'a\nb'])
  assert.equal((await post('/api/game', { name })).status, 400)
for (const mode of [0, 21, '20', null, {}, []])
  assert.equal((await post('/api/game', { name: 'A', mode })).status, 400)
for (const body of ['{', 'null', '[]', '123']) {
  const res = await app.request('/api/game', { method: 'POST', headers: { 'content-type': 'application/json' }, body }, env)
  assert.equal(res.status, 400)
}
assert.equal(writes, 0)

const created = await post('/api/game', { name: ' A ', mode: 20 })
assert.equal(created.status, 201)
const { id, token } = await created.json() as { id: string; token: string }
assert.match(id, /^[a-f0-9]{32}$/)
assert.match(token, /^[a-f0-9]{64}$/)
const path = `/api/game/${id}`
const host = JSON.parse(data.get(`g:${id}:p1`)!)
assert.notEqual(host.tokenHash, token)
assert.equal(data.get(`g:${id}:p1`)!.includes(token), false)
assert.equal(host.name, 'A')
assert.deepEqual(await (await get(`${path}/invite`)).json(), { host: 'A' })
assert.equal((await get(path)).status, 401)
assert.equal((await get(path, 'f'.repeat(64))).status, 401)
assert.equal((await post(`${path}/answer`, { slot: 1, choice: 0, questionIndex: 0 })).status, 401)

const joined = await post(`${path}/join`, { name: 'B' })
assert.equal(joined.status, 201)
const guest = await joined.json() as { token: string }
assert.notEqual(guest.token, token)
assert.equal(JSON.parse(data.get(`g:${id}:p2`)!).expiresAt, host.expiresAt)
assert.equal((await post(`${path}/join`, { name: 'Third' })).status, 409)
for (const name of [null, 123, {}, [], ' ', 'a'.repeat(25)])
  assert.equal((await post(`${path}/join`, { name })).status, 400)

const safeResponse = await get(path, token)
assert.equal(safeResponse.status, 200)
assert.equal(safeResponse.headers.get('cache-control'), 'no-store')
assert.equal(safeResponse.headers.get('x-frame-options'), 'DENY')
assert.equal(safeResponse.headers.get('referrer-policy'), 'no-referrer')
assert.equal(safeResponse.headers.get('x-content-type-options'), 'nosniff')
assert.ok(safeResponse.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"))
const safeGame = await safeResponse.json() as { p1: { score: number | null; questions: unknown[] }; p2: { score: number | null } }
const json = JSON.stringify(safeGame)
for (const secret of [token, guest.token]) assert.equal(json.includes(secret), false)
for (const player of [safeGame.p1, safeGame.p2]) {
  for (const key of ['correct', 'tokenHash', 'expiresAt', 'answer']) assert.equal(Object.hasOwn(player, key), false)
}
for (const question of safeGame.p1.questions) {
  assert.ok(question && typeof question === 'object')
  assert.deepEqual(Object.keys(question).sort(), ['choices', 'q'])
}
assert.equal(safeGame.p1.questions.length, 20)
assert.equal(safeGame.p1.score, null)
assert.equal(safeGame.p2.score, null)
assert.equal((await get(path, guest.token)).status, 200)

assert.equal((await post(`${path}/answer`, { slot: 1, choice: 0, questionIndex: 0 }, guest.token)).status, 401)
assert.equal((await post(`${path}/answer`, { slot: 2, choice: 0, questionIndex: 0 }, token)).status, 401)
for (const body of [
  { slot: 3, choice: 0, questionIndex: 0 }, { slot: 1, choice: 4, questionIndex: 0 },
  { slot: 1, choice: 0.5, questionIndex: 0 }, { slot: 1, choice: '0', questionIndex: 0 },
  { slot: 1, choice: 0 }, { slot: 1, choice: 0, questionIndex: -1 },
  { slot: 1, choice: 0, questionIndex: 0.5 }, { slot: 1, choice: 0, questionIndex: '0' },
  { slot: 1, choice: 0, questionIndex: 100 }, { slot: 1, choice: 0, questionIndex: 1 },
]) assert.equal((await post(`${path}/answer`, body, token)).status, 400)
assert.equal(JSON.parse(data.get(`g:${id}:p1`)!).questionIndex, 0)

for (let i = 0; i < 20; i++) {
  const choice = host.questions[i].correct
  const response = await post(`${path}/answer`, { slot: 1, questionIndex: i, choice }, token)
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.deepEqual(result, { answer: choice, correct: choice, score: i + 1, done: i === 19 })
  const beforeRetry = writes
  const retry = await post(`${path}/answer`, { slot: 1, questionIndex: i, choice }, token)
  assert.equal(retry.status, 200)
  assert.deepEqual(await retry.json(), result)
  assert.equal(writes, beforeRetry)
  assert.equal((await post(`${path}/answer`, { slot: 1, questionIndex: i, choice: (choice + 1) % 4 }, token)).status, 400)
}
const waiting = await (await get(path, guest.token)).json() as typeof safeGame
assert.equal(waiting.p1.score, null)
for (let i = 0; i < 20; i++) {
  const response = await post(`${path}/answer`, { slot: 2, questionIndex: i, choice: (host.questions[i].correct + 1) % 4 }, guest.token)
  assert.equal(response.status, 200)
}
const finished = await (await get(path, token)).json() as typeof safeGame
assert.equal(finished.p1.score, 20)
assert.equal(finished.p2.score, 0)
assert.equal(JSON.parse(data.get(`g:${id}:p1`)!).expiresAt, host.expiresAt)
assert.ok(expirations.every(ttl => ttl <= 86400 && ttl >= 60))

const another = await (await post('/api/game', { name: 'C', mode: 50 })).json() as { id: string }
assert.equal((await get(`/api/game/${another.id}`, token)).status, 401)
assert.equal((await post(`/api/game/${another.id}/answer`, { slot: 1, choice: 0, questionIndex: 0 }, token)).status, 401)
assert.equal(JSON.parse(data.get(`g:${another.id}:p1`)!).questions.length, 50)
const longest = await (await post('/api/game', { name: 'D', mode: 100 })).json() as { id: string }
assert.equal(JSON.parse(data.get(`g:${longest.id}:p1`)!).questions.length, 100)
for (const id of ['xxxxxx', 'a'.repeat(33), '..', 'a'.repeat(32)])
  assert.equal((await get(`/api/game/${id}/invite`)).status, 404)

const beforeExpiry = writes
const now = Date.now
try {
  Date.now = () => (host.expiresAt + 1) * 1000
  assert.equal((await get(path, token)).status, 404)
  assert.equal((await get(`${path}/invite`)).status, 404)
  assert.equal((await post(`${path}/join`, { name: 'E' })).status, 404)
  assert.equal((await post(`${path}/answer`, { slot: 1, choice: host.questions[19].correct, questionIndex: 19 }, token)).status, 401)
  assert.equal(writes, beforeExpiry)
} finally {
  Date.now = now
}

for (const extra of [
  { 'content-type': 'text/plain' }, { origin: 'https://untrusted.example' }, { 'sec-fetch-site': 'cross-site' },
]) {
  const response = await app.request('/api/game', {
    method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: '{"name":"A"}',
  }, env)
  assert.equal(response.status, 'content-type' in extra ? 415 : 403)
}
for (const withLength of [false, true]) {
  const body = JSON.stringify({ name: 'x'.repeat(3000) })
  const response = await app.request('/api/game', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(withLength ? { 'content-length': String(body.length) } : {}) }, body,
  }, env)
  assert.equal(response.status, 413)
}
for (const kind of ['api', 'create', 'write'] as const) {
  limits[kind] = false
  const response = kind === 'write' ? await post(`${path}/join`, { name: 'A' }) : await post('/api/game', { name: 'A' })
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('retry-after'), '60')
  limits[kind] = true
}
const redirect = await app.request('http://quiz.example/api/config', {}, env)
assert.equal(redirect.status, 308)
assert.equal(redirect.headers.get('location'), 'https://quiz.example/api/config')
assert.equal((await app.request('/api/missing', {}, env)).status, 404)

const brokenEnv = { ...env, QUIZ_KV: { async put() { throw new Error('private backend credential') } } } as unknown as CloudflareBindings
const log = console.error
const logs: string[] = []
try {
  console.error = message => logs.push(String(message))
  const failure = await app.request('/api/game', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"A"}' }, brokenEnv)
  assert.equal(failure.status, 500)
  assert.equal((await failure.text()).includes('private backend credential'), false)
  assert.equal(logs.join('').includes('private backend credential'), false)
  assert.ok(logs.join('').includes('api_error'))
} finally {
  console.error = log
}
console.log('Question selection, complete duel, credentials, answer privacy, validation, expiry, retry, headers, rate limiting and error handling passed')
