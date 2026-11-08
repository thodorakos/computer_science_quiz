import { questions } from './questions'

export type GameMode = number
export const MIN_QUESTIONS = 10
export const MAX_QUESTIONS = 600
export const SKIP_ANSWER = -1
export const CORRECT_POINTS = 1
export const WRONG_POINTS = -0.25

export const isGameMode = (value: unknown): value is GameMode =>
  typeof value === 'number' && Number.isInteger(value) && value >= MIN_QUESTIONS && value <= MAX_QUESTIONS

// Each 200-question batch has 67 easy, 67 mid and 66 hard questions.
export function getModeConfig(mode: GameMode) {
  const hard = Math.min(Math.floor(mode / 3), 198)
  return { easy: Math.ceil((mode - hard) / 2), mid: Math.floor((mode - hard) / 2), hard }
}

export function getQuestionsForMode(mode: GameMode) {
  const { easy, mid, hard } = getModeConfig(mode)

  const shuffle = <T>(items: T[]) => {
    const result = [...items]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
  }
  return shuffle([
    ...shuffle(questions.filter((_, i) => i % 200 < 67)).slice(0, easy),
    ...shuffle(questions.filter((_, i) => i % 200 >= 67 && i % 200 < 134)).slice(0, mid),
    ...shuffle(questions.filter((_, i) => i % 200 >= 134)).slice(0, hard),
  ])
}
