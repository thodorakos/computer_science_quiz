import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react'

export const cx = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(' ')

/* Drawn icons — one stroke language (2px, round caps), no glyph stand-ins. */
export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M4.5 12.5l5.5 5.5L20 6.5" />
    </svg>
  )
}

export function CrossIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary'
  loading?: boolean
}

export function Button({ variant = 'primary', loading = false, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex min-h-14 items-center justify-center gap-2 rounded-control px-6 text-base font-semibold',
        'transition duration-150 ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97]',
        variant === 'primary'
          ? 'bg-ink text-white hover:bg-black active:bg-black/80 disabled:opacity-40 disabled:active:bg-ink'
          : 'border border-line bg-surface text-ink hover:bg-raised active:bg-control disabled:opacity-40 disabled:active:bg-surface',
        className,
      )}
    >
      {children}
    </button>
  )
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }

export function TextField({ label, error, className, ...rest }: TextFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        {...rest}
        id={id}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        className={cx(
          'h-14 rounded-control border bg-surface px-4 text-base text-ink caret-accent',
          'transition-colors duration-100 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
          error ? 'border-bad' : 'border-line focus-visible:border-accent',
          className,
        )}
      />
      {error && (
        <p id={errorId} className="mark-pop text-sm font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  )
}

type AnswerButtonProps = {
  choice: string
  originalIndex: number
  picked: number | null
  correctIndex: number | null
  disabled: boolean
  onPick: (index: number) => void
}

export function AnswerButton({ choice, originalIndex, picked, correctIndex, disabled, onPick }: AnswerButtonProps) {
  const revealed = correctIndex !== null
  const isPicked = picked === originalIndex
  const correct = revealed && originalIndex === correctIndex
  const wrongPick = revealed && isPicked && originalIndex !== correctIndex
  return (
    <button
      type="button"
      onClick={() => onPick(originalIndex)}
      disabled={disabled || revealed}
      aria-pressed={isPicked || undefined}
      // Reveal cascades outward from the pick — distance sets each row's delay.
      style={revealed && !isPicked ? { transitionDelay: `${Math.abs(originalIndex - (picked ?? 0)) * 40}ms` } : undefined}
      className={cx(
        'flex min-h-14 w-full items-center justify-between gap-3 rounded-control border px-4 text-left text-base font-medium',
        'transition duration-150 ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97] disabled:active:scale-100',
        correct
          ? 'border-ok bg-ok-soft text-ok-ink'
          : wrongPick
            ? 'border-bad bg-bad-soft text-bad-ink'
            : revealed
              ? 'border-line bg-surface text-muted'
              : 'border-line bg-surface text-ink hover:bg-raised active:bg-control',
      )}
    >
      {choice}
      {correct && <CheckIcon className="h-5 w-5 shrink-0 mark-pop" />}
      {wrongPick && <CrossIcon className="h-5 w-5 shrink-0 mark-pop" />}
    </button>
  )
}
