import { questions } from './questions'

export type GameMode = 20 | 50 | 100

const MODE_CONFIG: Record<GameMode, { easy: number; mid: number; hard: number }> = {
  20: { easy: 7, mid: 7, hard: 6 },
  50: { easy: 17, mid: 17, hard: 16 },
  100: { easy: 34, mid: 33, hard: 33 },
}

export function getQuestionsForMode(mode: GameMode) {
  const { easy, mid, hard } = MODE_CONFIG[mode]

  const shuffle = <T>(items: T[]) => {
    const result = [...items]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
  }
  return shuffle([
    ...shuffle(questions.slice(0, 67)).slice(0, easy),
    ...shuffle(questions.slice(67, 134)).slice(0, mid),
    ...shuffle(questions.slice(134)).slice(0, hard),
  ])
}

export const getModeConfig = (mode: GameMode) => MODE_CONFIG[mode]