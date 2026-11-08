import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { getQuestionsForMode, isGameMode, MAX_QUESTIONS, SKIP_ANSWER, CORRECT_POINTS, WRONG_POINTS } from '../shared/game-config'
import { GAME_ID_PATTERN, MAX_NAME_LENGTH, PLAYER_TOKEN_PATTERN } from '../shared/security'
import type { Question } from '../shared/question'
import type { GameMode } from '../shared/game-config'

type PlayerValue = {
  name: string; answer: number | null; score: number; done: boolean
  questionIndex: number; questions?: Question[]; tokenHash: string; expiresAt: number
}

const TTL = 86400
const GAME_MODE: GameMode = 20
const randomHex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('')
const hashToken = async (token: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('')
const authorized = (player: PlayerValue | null, hash: string) => {
  const subtle = crypto.subtle
  return !!player?.tokenHash && 'timingSafeEqual' in subtle && typeof subtle.timingSafeEqual === 'function' &&
    subtle.timingSafeEqual(new TextEncoder().encode(player.tokenHash), new TextEncoder().encode(hash)) === true
}
const live = (player: PlayerValue | null) => !!player && Number.isFinite(player.expiresAt) && player.expiresAt > Math.floor(Date.now() / 1000)
const expiration = (expiresAt: number) => ({ expirationTtl: Math.max(60, expiresAt - Math.floor(Date.now() / 1000)) })
const validName = (name: unknown): name is string => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= MAX_NAME_LENGTH && !/[\u0000-\u001f\u007f]/.test(name)

const app = new Hono<{
  Bindings: CloudflareBindings
  Variables: { body: Record<string, unknown> }
}>()

app.use('*', secureHeaders({
  referrerPolicy: 'no-referrer',
  xFrameOptions: 'DENY',
  strictTransportSecurity: 'max-age=31536000',
  contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] },
  permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
}))

app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  const url = new URL(c.req.url)
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    url.protocol = 'https:'
    return c.redirect(url.toString(), 308)
  }

  const ip = c.req.header('CF-Connecting-IP') ?? 'local'
  if (!(await c.env.API_RATE_LIMITER.limit({ key: `quiz-duel:api:${ip}` })).success) {
    c.header('Retry-After', '60')
    return c.json({ error: 'Too many requests. Try again in a minute.' }, 429)
  }
  if (c.req.method === 'POST') {
    const limiter = c.req.path === '/api/game' ? c.env.CREATE_RATE_LIMITER : c.env.WRITE_RATE_LIMITER
    if (!(await limiter.limit({ key: `quiz-duel:write:${ip}` })).success) {
      c.header('Retry-After', '60')
      return c.json({ error: 'Too many requests. Try again in a minute.' }, 429)
    }
    if (c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json')
      return c.json({ error: 'Send an application/json body.' }, 415)
    const origin = c.req.header('origin')
    if ((origin && origin !== url.origin) || c.req.header('sec-fetch-site') === 'cross-site')
      return c.json({ error: 'Cross-site requests are not allowed.' }, 403)
  }
  await next()
})
app.use('/api/*', bodyLimit({ maxSize: 2048, onError: c => c.json({ error: 'Request body is too large.' }, 413) }))
app.use('/api/*', async (c, next) => {
  if (c.req.method === 'POST') {
    const body: unknown = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return c.json({ error: 'Send a valid JSON object.' }, 400)
    c.set('body', body as Record<string, unknown>)
  }
  await next()
})

app.onError((error, c) => {
  const requestId = crypto.randomUUID()
  console.error(JSON.stringify({ event: 'api_error', requestId, type: error.name, method: c.req.method, route: c.req.routePath }))
  return c.json({ error: 'Could not complete the request. Try again.', requestId }, 500)
})
app.notFound(c => c.json({ error: 'Not found.' }, 404))

const requestToken = (header: string | undefined) => {
  const token = header?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
  return token && PLAYER_TOKEN_PATTERN.test(token) ? token : null
}

export const route = app
  .get('/api/config', c => c.json({ defaultMode: GAME_MODE }))
  .post('/api/game', async (c) => {
    const body = c.get('body')
    if (!validName(body.name)) return c.json({ error: `Use a name between 1 and ${MAX_NAME_LENGTH} characters.` }, 400)
    const mode = body.mode === undefined ? GAME_MODE : body.mode
    if (!isGameMode(mode)) return c.json({ error: 'Choose a whole number of questions from 10 to 600.' }, 400)

    const id = randomHex(16)
    const token = randomHex(32)
    const expiresAt = Math.floor(Date.now() / 1000) + TTL
    await c.env.QUIZ_KV.put(`g:${id}:p1`, JSON.stringify({
      name: body.name.trim(), answer: null, score: 0, done: false, questionIndex: 0,
      questions: getQuestionsForMode(mode), tokenHash: await hashToken(token), expiresAt,
    } satisfies PlayerValue), expiration(expiresAt))
    return c.json({ id, slot: 1 as const, token }, 201)
  })
  .get('/api/game/:id/invite', async (c) => {
    const id = c.req.param('id')
    if (!GAME_ID_PATTERN.test(id)) return c.json({ error: 'Game not found.' }, 404)
    const host = await c.env.QUIZ_KV.get<PlayerValue>(`g:${id}:p1`, 'json')
    if (!host || !live(host)) return c.json({ error: 'Game not found.' }, 404)
    return c.json({ host: host.name })
  })
  .post('/api/game/:id/join', async (c) => {
    const id = c.req.param('id')
    if (!GAME_ID_PATTERN.test(id)) return c.json({ error: 'Game not found.' }, 404)
    const body = c.get('body')
    if (!validName(body.name)) return c.json({ error: `Use a name between 1 and ${MAX_NAME_LENGTH} characters.` }, 400)
    const host = await c.env.QUIZ_KV.get<PlayerValue>(`g:${id}:p1`, 'json')
    if (!host || !live(host)) return c.json({ error: 'Game not found.' }, 404)
    const rival = await c.env.QUIZ_KV.get(`g:${id}:p2`)
    if (rival !== null) return c.json({ error: 'That seat is taken.' }, 409)

    // shortcut: KV cannot atomically claim a seat across regions; use transactional storage if concurrent joins must be guaranteed.
    const token = randomHex(32)
    await c.env.QUIZ_KV.put(`g:${id}:p2`, JSON.stringify({
      name: body.name.trim(), answer: null, score: 0, done: false, questionIndex: 0,
      tokenHash: await hashToken(token), expiresAt: host.expiresAt,
    } satisfies PlayerValue), expiration(host.expiresAt))
    return c.json({ id, slot: 2 as const, token }, 201)
  })
  .post('/api/game/:id/answer', async (c) => {
    const id = c.req.param('id')
    if (!GAME_ID_PATTERN.test(id)) return c.json({ error: 'Game not found.' }, 404)
    const token = requestToken(c.req.header('authorization'))
    if (!token) return c.json({ error: 'Player credentials required.' }, 401)
    const { slot, choice, questionIndex } = c.get('body')
    if (slot !== 1 && slot !== 2) return c.json({ error: 'Unknown player.' }, 400)
    if (typeof choice !== 'number' || !Number.isInteger(choice) || choice < SKIP_ANSWER || choice >= 4)
      return c.json({ error: 'Pick an answer or choose Don’t know.' }, 400)
    if (typeof questionIndex !== 'number' || !Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= MAX_QUESTIONS)
      return c.json({ error: 'Invalid question.' }, 400)

    const key = `g:${id}:p${slot}` as const
    const me = await c.env.QUIZ_KV.get<PlayerValue>(key, 'json')
    if (!me || !live(me) || !authorized(me, await hashToken(token)))
      return c.json({ error: 'Invalid or expired player credentials.' }, 401)
    const host = slot === 1 ? me : await c.env.QUIZ_KV.get<PlayerValue>(`g:${id}:p1`, 'json')
    const questions = host?.questions
    if (!live(host ?? null) || !questions) return c.json({ error: 'Game not found.' }, 404)

    // A retry of the accepted answer returns its result without a second write.
    if (questionIndex === me.questionIndex - 1 && choice === me.answer)
      return c.json({ answer: choice, correct: questions[questionIndex].correct, score: me.score, done: me.done })
    if (me.done || questionIndex !== me.questionIndex || !questions[questionIndex])
      return c.json({ error: 'Invalid question.' }, 400)

    const correct = questions[questionIndex].correct
    const score = me.score + (choice === SKIP_ANSWER ? 0 : choice === correct ? CORRECT_POINTS : WRONG_POINTS)
    const nextIndex = questionIndex + 1
    const done = nextIndex === questions.length
    // shortcut: KV read/modify/write is not atomic; use transactional storage if concurrent answers must be guaranteed.
    await c.env.QUIZ_KV.put(key, JSON.stringify({ ...me, answer: choice, score, questionIndex: nextIndex, done } satisfies PlayerValue), expiration(me.expiresAt))
    return c.json({ answer: choice, correct, score, done })
  })
  .get('/api/game/:id', async (c) => {
    const id = c.req.param('id')
    if (!GAME_ID_PATTERN.test(id)) return c.json({ error: 'Game not found.' }, 404)
    const token = requestToken(c.req.header('authorization'))
    if (!token) return c.json({ error: 'Player credentials required.' }, 401)
    const map = await c.env.QUIZ_KV.get([`g:${id}:p1`, `g:${id}:p2`], { type: 'json', cacheTtl: 30 })
    const p1 = (map.get(`g:${id}:p1`) ?? null) as PlayerValue | null
    const p2 = (map.get(`g:${id}:p2`) ?? null) as PlayerValue | null
    if (!p1 || !live(p1)) return c.json({ error: 'Game not found.' }, 404)
    const hash = await hashToken(token)
    if (!authorized(p1, hash) && !authorized(p2, hash))
      return c.json({ error: 'Invalid player credentials.' }, 401)
    const bothDone = p1.done && p2?.done
    const publicPlayer = (player: PlayerValue | null) => player ? {
      name: player.name, score: bothDone ? player.score : null, done: player.done, questionIndex: player.questionIndex,
    } : null
    return c.json({
      p1: { ...publicPlayer(p1)!, questions: p1.questions?.map(({ q, choices }) => ({ q, choices })) },
      p2: publicPlayer(p2),
    })
  })

export type AppType = typeof route
export default app
