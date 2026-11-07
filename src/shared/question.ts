export type Question = { q: string; choices: string[]; correct: number }
export type PublicQuestion = Omit<Question, 'correct'>
