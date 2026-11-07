import { hc } from 'hono/client'
import type { AppType } from '../worker'
import type { PublicQuestion } from '../shared/question'
import { GAME_ID_PATTERN, PLAYER_TOKEN_PATTERN } from '../shared/security'

export const client = hc<AppType>('/')

export type Slot = 1 | 2
export type PlayerValue = { name: string; score: number | null; done: boolean; questionIndex: number; questions?: PublicQuestion[] }
export type Game = { p1: PlayerValue | null; p2: PlayerValue | null }

export type Identity = { id: string; slot: Slot; name: string; token: string }
export type GameMode = 20 | 50 | 100

const IDENTITY_KEY = 'quiz-duel'

export function loadIdentity(): Identity | null {
  try {
    const raw = sessionStorage.getItem(IDENTITY_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<Identity>
    if (!v || typeof v.id !== 'string' || !GAME_ID_PATTERN.test(v.id) ||
      typeof v.token !== 'string' || !PLAYER_TOKEN_PATTERN.test(v.token) ||
      typeof v.name !== 'string' || (v.slot !== 1 && v.slot !== 2)) return null
    return { id: v.id, slot: v.slot, name: v.name, token: v.token }
  } catch {
    return null
  }
}

export function saveIdentity(identity: Identity) {
  sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(identity))
}

export function clearIdentity() {
  sessionStorage.removeItem(IDENTITY_KEY)
}

const JSON_BODY = { 'content-type': 'application/json' }

export async function getGameConfig(): Promise<{ defaultMode: GameMode }> {
  const res = await client.api.config.$get({})
  if (!res.ok) throw new Error('Failed to fetch game config')
  return await res.json()
}

export async function createGame(name: string, mode?: GameMode): Promise<Identity | { error: string }> {
  try {
    const res = await client.api.game.$post(
      {},
      { init: { body: JSON.stringify({ name, mode }), headers: JSON_BODY } },
    )
    if (!res.ok) {
      const data = (await res.json()) as { error?: string }
      return { error: data.error ?? 'Could not start the game. Try again.' }
    }
    const { id, slot, token } = await res.json()
    const identity: Identity = { id, slot, token, name }
    saveIdentity(identity)
    return identity
  } catch {
    return { error: 'Could not start the game. Check your connection and allow session storage, then try again.' }
  }
}

export async function joinGame(id: string, name: string): Promise<Identity | { status: number }> {
  try {
    const res = await client.api.game[':id'].join.$post(
      { param: { id } },
      { init: { body: JSON.stringify({ name }), headers: JSON_BODY } },
    )
    if (!res.ok) return { status: res.status }
    const { id: gameId, slot, token } = await res.json()
    const identity: Identity = { id: gameId, slot, token, name }
    saveIdentity(identity)
    return identity
  } catch {
    return { status: 0 }
  }
}

export async function getInvite(id: string): Promise<{ invite: { host: string } } | { status: number }> {
  try {
    const res = await client.api.game[':id'].invite.$get({ param: { id } })
    if (!res.ok) return { status: res.status }
    return { invite: await res.json() }
  } catch {
    return { status: 0 }
  }
}

export async function getGame(identity: Identity): Promise<{ game: Game } | { status: number }> {
  try {
    const res = await client.api.game[':id'].$get({ param: { id: identity.id } }, { headers: { authorization: `Bearer ${identity.token}` } })
    if (!res.ok) return { status: res.status }
    const game = (await res.json()) as Game
    return { game }
  } catch {
    return { status: 0 }
  }
}

export async function sendAnswer(
  identity: Identity,
  choice: number,
  questionIndex: number,
): Promise<{ answer: number; correct: number; score: number; done: boolean }> {
  const res = await client.api.game[':id'].answer.$post(
    { param: { id: identity.id } },
    { init: { body: JSON.stringify({ slot: identity.slot, choice, questionIndex }), headers: { ...JSON_BODY, authorization: `Bearer ${identity.token}` } } },
  )
  if (!res.ok) throw new Error('Failed to send answer')
  return await res.json()
}

export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}
