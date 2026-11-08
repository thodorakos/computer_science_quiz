import { useEffect, useId, useState, type FormEvent } from 'react'
import type { PublicQuestion } from '../shared/question'
import { isGameMode, MIN_QUESTIONS, MAX_QUESTIONS, SKIP_ANSWER } from '../shared/game-config'
import {
  createGame,
  clearIdentity,
  getGame,
  getInvite,
  joinGame,
  loadIdentity,
  sendAnswer,
  type Game,
  type Identity,
  type PlayerValue,
} from './api'
import { AnswerButton, Button, CheckIcon, TextField, cx } from './ui'

type View =
  | { kind: 'home' }
  | { kind: 'join'; id: string }
  | { kind: 'error' }
  | { kind: 'play'; identity: Identity }
  | { kind: 'results'; identity: Identity }

function initialView(): View {
  const identity = loadIdentity()
  const id = window.location.pathname.match(/^\/g\/([a-f0-9]{32})\/?$/)?.[1]
  if (window.location.pathname.startsWith('/g/') && !id) return { kind: 'error' }
  if (id && identity && identity.id === id) return { kind: 'play', identity }
  if (id) return { kind: 'join', id }
  if (identity) return { kind: 'play', identity }
  return { kind: 'home' }
}

/* The duel as two lanes — one per player — is this app's signature element. */
function Lane({ name, score, done, mine }: { name: string | null; score: number | null; done: boolean; mine: boolean }) {
  const status =
    name === null ? (mine ? 'Still out…' : 'No one joined yet') : done ? 'Finished' : 'Still playing…'
  return (
    <li className={cx('rounded-card border px-5 py-4', mine ? 'border-accent-track bg-accent-soft' : 'border-line bg-surface')}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-lg font-semibold text-ink">{name ?? '—'}</span>
        <span className={cx('text-3xl font-semibold tabular-nums text-ink', done && score !== null && 'mark-pop')}>
          {done && score !== null ? score : '–'}
        </span>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
        {!done && name !== null && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />}
        {status}
      </p>
      <span className="sr-only">{mine ? 'You' : 'Challenger'}</span>
    </li>
  )
}

function WordMark() {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true" className="shrink-0">
        <rect width="32" height="32" rx="8" fill="#b8336a" />
        <rect x="6" y="12" width="8" height="8" rx="4" fill="#ffffff" />
        <rect x="18" y="12" width="8" height="8" rx="4" fill="#111827" />
      </svg>
      <span className="text-[15px] font-semibold text-ink">Quiz Duel</span>
    </span>
  )
}

function TopBar({ code }: { code: string | null }) {
  return (
    <header className="flex min-h-14 items-center justify-between px-5 pt-4">
      <WordMark />
      {code && (
        <span
          aria-label={`Game code ${code}`}
          className="rounded-control border border-line bg-surface px-2 py-1 font-mono text-xs text-muted"
        >
          {code.slice(0, 8)}
        </span>
      )}
    </header>
  )
}

function CreatedCard({ identity, onPlay }: { identity: Identity; onPlay: (identity: Identity) => void }) {
  const [copied, setCopied] = useState(false)
  const linkId = useId()
  const link = `${window.location.origin}/g/${identity.id}`
  const shareable = typeof navigator.share === 'function'

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      /* clipboard unavailable — the field stays selectable */
    }
  }

  function share() {
    navigator.share({ title: 'Quiz Duel', text: 'Duel me in Quiz Duel.', url: link }).catch(() => {})
  }

  return (
    <div className="view-in grid gap-8">
      <div className="grid gap-3">
        <h1 className="text-[1.875rem] font-bold leading-tight tracking-tight text-ink">Duel a friend.</h1>
        <p className="text-base leading-snug text-muted">Send this link — they can join whenever, even after you've played.</p>
      </div>
      <section className="grid gap-3" aria-label="Challenge link">
        <label htmlFor={linkId} className="text-sm font-medium text-ink">
          Challenge link
        </label>
        <div className="flex gap-2">
          <input
            id={linkId}
            readOnly
            value={link}
            className="min-w-0 flex-1 truncate rounded-control border border-line bg-surface px-3 font-mono text-xs text-muted"
          />
          <Button variant="secondary" onClick={() => void copy()} className="px-4">
            {copied ? (
              <>
                <CheckIcon className="mark-pop h-4 w-4" /> Copied
              </>
            ) : (
              'Copy'
            )}
          </Button>
        </div>
        {copied && (
          <p role="status" className="text-sm text-ok-ink">
            Link copied — send it to your challenger.
          </p>
        )}
        {shareable && (
          <Button variant="secondary" onClick={share}>
            Share the link
          </Button>
        )}
      </section>
      <Button onClick={() => onPlay(identity)}>Play now</Button>
    </div>
  )
}

function Home({ onPlay }: { onPlay: (identity: Identity) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<Identity | null>(null)
  const [mode, setMode] = useState('20')
  const count = Number(mode)
  const countId = useId()

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!isGameMode(count)) return
    if (!name.trim()) { setError('Enter your name to create a duel.'); return }
    setBusy(true)
    setError('')
    const result = await createGame(name, count)
    setBusy(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setCreated(result)
  }

  return created ? (
    <CreatedCard identity={created} onPlay={onPlay} />
  ) : (
    <div className="view-in grid gap-7">
      <div className="grid gap-2">
        <h1 className="text-[2rem] font-bold leading-tight tracking-tight text-ink">Duel a friend.</h1>
        <p className="max-w-80 text-base leading-relaxed text-muted">Same questions. Your own pace.<br />See who knows more.</p>
      </div>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          void submit(event)
        }}
      >
        <TextField
          label="Your name"
          value={name}
          onChange={(event) => { setName(event.target.value); setError('') }}
          autoComplete="given-name"
          placeholder="What should we call you?"
          maxLength={24}
          required
          disabled={busy}
          error={error || undefined}
        />
        <fieldset className="grid gap-1 rounded-card border border-line bg-surface px-4 pb-4 pt-3 sm:px-5" disabled={busy}>
          <legend className="sr-only">Quiz length</legend>
          <div className="flex items-center justify-between gap-4">
            <div>
              <label htmlFor={countId} className="text-sm font-semibold text-ink">Questions</label>
              <p id={`${countId}-hint`} className="mt-1 text-sm text-muted">Choose any number from 10–600.</p>
            </div>
            <input id={countId} type="number" min={MIN_QUESTIONS} max={MAX_QUESTIONS} step={1} required
              aria-describedby={`${countId}-hint ${countId}-error`} aria-invalid={!isGameMode(count) || undefined}
              value={mode} onChange={event => setMode(event.target.value)}
              className="h-12 w-20 shrink-0 rounded-control border border-accent-track bg-accent-soft pl-2 text-center text-2xl font-semibold tabular-nums text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" />
          </div>
          <div className="relative flex h-11 items-center">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 h-1.5 overflow-hidden rounded-full bg-accent-track">
              <div className="h-full bg-accent" style={{ width: `${isGameMode(count) ? (count - MIN_QUESTIONS) / (MAX_QUESTIONS - MIN_QUESTIONS) * 100 : 0}%` }} />
            </div>
            <input type="range" aria-label="Question count slider" min={MIN_QUESTIONS} max={MAX_QUESTIONS} step={1}
              value={isGameMode(count) ? count : MIN_QUESTIONS} onChange={event => setMode(event.target.value)}
              className="question-range relative h-11 w-full cursor-pointer appearance-none bg-transparent focus-visible:rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" />
          </div>
          <div className="grid grid-cols-4 gap-1 rounded-control bg-raised p-1" role="group" aria-label="Quick question counts">
            {[10, 50, 100, 600].map(value => (
              <button key={value} type="button" aria-pressed={count === value} onClick={() => setMode(String(value))}
                className={cx('min-h-11 rounded-control text-sm font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent', count === value ? 'bg-surface text-accent-ink ring-1 ring-accent-track' : 'text-muted hover:bg-surface hover:text-ink')}>
                {value}
              </button>
            ))}
          </div>
          <p id={`${countId}-error`} className={cx('text-sm text-bad-ink', isGameMode(count) && 'hidden')}>
            Enter a whole number from 10 to 600.
          </p>
        </fieldset>
        <dl className="grid grid-cols-3 text-center text-sm" aria-label="Scoring rules">
          <div><dt className="text-muted">Correct</dt><dd className="mt-1 font-semibold tabular-nums text-ink">+1</dd></div>
          <div><dt className="text-muted">Wrong</dt><dd className="mt-1 font-semibold tabular-nums text-ink">−0.25</dd></div>
          <div><dt className="text-muted">Don’t know</dt><dd className="mt-1 font-semibold tabular-nums text-ink">0</dd></div>
        </dl>
        <div className="grid gap-3">
          <Button type="submit" loading={busy} disabled={!isGameMode(count)} className="justify-between">
            {busy ? 'Creating…' : 'Create game'}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
          </Button>
          <p className="text-center text-sm text-muted">You’ll get a link to invite your friend.</p>
        </div>
      </form>
    </div>
  )
}

function Join({ id, onJoined, onHome }: { id: string; onJoined: (identity: Identity) => void; onHome: () => void }) {
  const [host, setHost] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'gone' | 'netfail' | 'checking'>('loading')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function check() {
    setState('checking')
    const result = await getInvite(id)
    if (!('invite' in result)) {
      setState(result.status === 404 ? 'gone' : 'netfail')
      return
    }
    setHost(result.invite.host)
    setState('ready')
  }

  useEffect(() => {
    void check()
  }, [id])

  async function join(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const result = await joinGame(id, name)
    setBusy(false)
    if ('status' in result) {
      if (result.status === 404) setState('gone')
      else if (result.status === 409) setError('taken')
      else setError('fail')
      return
    }
    onJoined(result)
  }

  if (state === 'gone') return <ErrorView onHome={onHome} />
  if (state === 'netfail')
    return (
      <div className="view-in grid gap-6">
        <h2 className="text-2xl font-semibold text-ink">Couldn't check this duel.</h2>
        <Button variant="secondary" onClick={() => void check()} className="self-start">
          Retry
        </Button>
      </div>
    )
  if (state !== 'ready')
    return (
      <div className="view-in grid gap-3" aria-busy="true">
        <div className="h-8 w-3/4 animate-pulse rounded-control bg-raised" />
        <div className="h-14 animate-pulse rounded-control bg-raised" />
      </div>
    )
  return (
    <div className="view-in grid gap-8">
      <div className="grid gap-3">
        <h1 className="text-[1.875rem] font-bold leading-tight tracking-tight text-ink">You've been challenged.</h1>
        <p className="text-base leading-snug text-muted">
          {host ? `${host} dares you to a quiz duel.` : 'A quiz duel awaits.'}
        </p>
      </div>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          void join(event)
        }}
      >
        <TextField
          label="Your name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="given-name"
          maxLength={24}
          error={
            error === 'taken'
              ? 'This duel already has its two players. Start a fresh one?'
              : error === 'fail'
                ? "The game didn't take it — try again."
                : undefined
          }
        />
        <Button type="submit" loading={busy} disabled={!name.trim() || error === 'taken'}>
          Join the duel
        </Button>
      </form>
    </div>
  )
}

function Quiz({ identity, onDone, onHome }: { identity: Identity; onDone: () => void; onHome: () => void }) {
  const [picked, setPicked] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [questions, setQuestions] = useState<PublicQuestion[] | null>(null)
  const [correct, setCorrect] = useState<number | null>(null)
  const [gone, setGone] = useState(false)
  const [questionIndex, setQuestionIndex] = useState(0)

  useEffect(() => {
    let alive = true
    getGame(identity).then((result) => {
      if (!alive) return
      if (!('game' in result)) {
        if (result.status === 401 || result.status === 404) setGone(true)
        else setFailed(true)
        return
      }
      if (!result.game.p1?.questions) { setFailed(true); return }
      const me = identity.slot === 1 ? result.game.p1 : result.game.p2
      if (!me) { setFailed(true); return }
      if (me.done) { onDone(); return }
      setQuestions(result.game.p1.questions)
      setQuestionIndex(me.questionIndex)
    }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [identity.id, identity.slot, identity.token])

  async function choose(index: number) {
    if (picked !== null || busy) return
    setBusy(true)
    setPicked(index)
    try {
      const sent = await sendAnswer(identity, index, questionIndex)
      setCorrect(sent.correct)
      setFailed(false)
      window.setTimeout(() => {
        if (sent.done) onDone()
        else { setQuestionIndex(questionIndex + 1); setPicked(null); setCorrect(null); setBusy(false) }
      }, 1500)
    } catch {
      setPicked(null)
      setBusy(false)
      setFailed(true)
    }
  }

  if (gone) return <ErrorView onHome={onHome} />
  if (!questions) return <p role="status">{failed ? 'Could not load this game. Please refresh.' : 'Loading quiz…'}</p>
  const question = questions[questionIndex]
  const revealed = correct !== null
  const won = revealed && picked === correct
  const skipped = picked === SKIP_ANSWER
  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3 text-sm text-muted">
          <p>Question {questionIndex + 1} of {questions.length}</p>
          <span>+1 / −0.25 points</span>
        </div>
        <progress aria-label="Quiz progress" max={questions.length} value={questionIndex} className="quiz-progress h-1.5 w-full" />
      </div>
      <h1 className="text-2xl font-semibold leading-snug tracking-tight text-ink">{question.q}</h1>
      <div className="grid gap-3" role="group" aria-label="Answers">
        {question.choices.map((choice, index) => (
          <AnswerButton
            key={choice}
            choice={choice}
            originalIndex={index}
            picked={picked}
            correctIndex={correct}
            disabled={busy}
            onPick={(i) => {
              void choose(i)
            }}
          />
        ))}
        <button type="button" disabled={busy || revealed} aria-pressed={skipped}
          onClick={() => void choose(SKIP_ANSWER)}
          className={cx('mt-1 flex min-h-14 items-center justify-between gap-3 rounded-control px-4 text-left text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default', skipped ? 'bg-accent-soft text-accent-ink' : 'bg-raised text-muted hover:bg-control disabled:hover:bg-raised')}>
          <span>Don’t know</span><span className="text-sm">0 points</span>
        </button>
      </div>
      <p role="status" className={cx('min-h-6 text-base font-medium', skipped ? 'text-muted' : won ? 'text-ok-ink' : 'text-bad-ink')}>
        {revealed && (
          <span key={won ? 'won' : 'lost'} className="mark-pop block">
            {skipped ? `Skipped · 0 points. “${question.choices[correct!]}” was right.` : won ? 'Correct. +1 point.' : `Not this time · −0.25 points. “${question.choices[correct!]}” was right.`}
          </span>
        )}
        {failed && "Didn't save — check your connection, then pick again."}
      </p>
    </div>
  )
}

function Results({ identity, onHome }: { identity: Identity; onHome: () => void }) {
  const [game, setGame] = useState<Game | null>(null)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    let alive = true
    let timer: number | undefined
    async function tick() {
      const result = await getGame(identity)
      if (!alive) return
      if ('game' in result) {
        const next = result.game
        setGame(next)
        if (next.p1?.done && next.p2?.done) return // both in: polling ends at the answer
      } else if (result.status === 404 || result.status === 401) {
        setGone(true)
        return
      }
      timer = window.setTimeout(() => {
        void tick()
      }, 3000)
    }
    void tick()
    return () => {
      alive = false
      if (timer) window.clearTimeout(timer)
    }
  }, [identity.id, identity.token])

  if (gone) return <ErrorView onHome={onHome} />

  const me: PlayerValue | null = identity.slot === 1 ? (game?.p1 ?? null) : (game?.p2 ?? null)
  const other: PlayerValue | null = identity.slot === 1 ? (game?.p2 ?? null) : (game?.p1 ?? null)
  const bothDone = (me?.done ?? false) && (other?.done ?? false)
  const winner: 'me' | 'other' | 'tie' | null = bothDone
    ? (me?.score ?? 0) > (other?.score ?? 0)
      ? 'me'
      : (me?.score ?? 0) < (other?.score ?? 0)
        ? 'other'
        : 'tie'
    : null

  return (
    <div className="view-in grid gap-6">
      <h1
        key={winner ?? 'waiting'}
        role="status"
        className={cx('leading-tight tracking-tight text-ink mark-pop', winner ? 'text-[1.875rem] font-bold' : 'text-2xl font-semibold')}
      >
        {winner === 'me' && 'You win.'}
        {winner === 'other' && `${other?.name} wins.`}
        {winner === 'tie' && "It's a tie!"}
        {!winner && (other?.name ? `Waiting for ${other.name} to finish…` : 'Waiting for a challenger to join…')}
      </h1>
      <ul className="grid gap-3" aria-label="Players">
        <Lane name={me?.name ?? null} score={me?.score ?? null} done={me?.done ?? false} mine />
        <Lane name={other?.name ?? null} score={other?.score ?? null} done={other?.done ?? false} mine={false} />
      </ul>
      <p className="text-sm text-muted">Scores refresh every few seconds.</p>
    </div>
  )
}

function ErrorView({ onHome }: { onHome: () => void }) {
  return (
    <div className="view-in grid gap-6">
      <div className="grid gap-3">
        <h1 className="text-[1.875rem] font-bold leading-tight tracking-tight text-ink">Game not found.</h1>
        <p className="text-base leading-snug text-muted">That duel doesn't exist or has expired — links last a day.</p>
      </div>
      <Button onClick={onHome} className="self-start">
        Start a new duel
      </Button>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState<View>(initialView)

  function goHome() {
    clearIdentity()
    if (window.location.pathname !== '/') window.history.replaceState(null, '', '/')
    setView({ kind: 'home' })
  }

  const code =
    view.kind === 'play' || view.kind === 'results' ? view.identity.id : view.kind === 'join' ? view.id : null

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[30rem] flex-col">
      <TopBar code={code} />
      <main className="px-5 pb-16 pt-10">
        {view.kind === 'home' && (
          <Home
            onPlay={(identity) => {
              setView({ kind: 'play', identity })
            }}
          />
        )}
        {view.kind === 'join' && (
          <Join
            id={view.id}
            onHome={goHome}
            onJoined={(identity) => {
              setView({ kind: 'play', identity })
            }}
          />
        )}
        {view.kind === 'play' && (
          <Quiz identity={view.identity} onHome={goHome} onDone={() => setView({ kind: 'results', identity: view.identity })} />
        )}
        {view.kind === 'results' && <Results identity={view.identity} onHome={goHome} />}
        {view.kind === 'error' && <ErrorView onHome={goHome} />}
      </main>
    </div>
  )
}
