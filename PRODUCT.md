# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated (approved plan): Vite + React + TypeScript + Tailwind v4 SPA served by a Hono Worker on Cloudflare via Workers Static Assets; data in Cloudflare KV (`QUIZ_KV`). Decided by the parent session's approved plan — not re-asked here.

## Users

Two friends on their own phones, playing for fun at different places/times.【inferred from approved plan】 One creates a duel and shares a link; the other opens it and joins. No accounts. The invitation link grants access to join; separate per-player secret credentials authorize gameplay.

## Product Purpose

"Quiz Duel": a private two-player multiple-choice quiz duel. One shared question, two players answering asynchronously on their own phones; a results screen that polls until both finish and names the winner. Success = the full create→share→join→answer→winner flow works end to end.

## Positioning

Privately shared one-question duels between friends, played whenever — the async "play whenever, compare later" mechanic; not a leaderboard app.

## Operating Context

Phone-first use (375px verified); desktop is a sanity width (1440). Play sessions are seconds long per player. Games live in KV for 24h. Only one hardcoded "hello world" test question exists by design; question design comes later.

## Capabilities and Constraints

- Create game (32-character cryptographically random id) → shareable link `/g/:id`; host may play before the friend joins.
- Join `/g/:id` (409 polite error when seat 2 taken), answer once with instant reveal, results poll (~3s) until both done, winner/tie banner.
- Identity = `{id, slot, name, token}` in `sessionStorage` (key `quiz-duel`). The server verifies each player token; losing it loses access to that seat. Names cannot recover credentials.
- KV realities: 1 write/s/key, eventual consistency, no compare-and-swap. Each player has a separate key; poll reads use cacheTtl 30. Concurrent joins and answer updates can still race. This security patch preserves KV and does not claim atomicity.
- Undecided/open: more questions, tie-breakers, names of future screens — question design is explicitly deferred.

## Brand Commitments

Name: "Quiz Duel" (plan-pinned). Voice: playful but short. No established brand assets; visual world is new (see surface brief).

## Evidence on Hand

None. No photos, logos, or customer proof exist — none may be invented. The product's "material" is the game flow itself (statuses, scores, revealed answers).

## Product Principles

1. The duel is the product: two named players, one question, one winner — visible in seconds.
2. Touch-first ergonomics: ≥44px targets, instant feedback, no traps.
3. Honesty with async: the screen always says who is still out.
4. Small surface, fast reads: headlines ≤ 2 lines everywhere.

## Accessibility & Inclusion

Every control keyboard-focusable with an accessible name; ≥44px touch targets; ≥8px gaps; text tiers ≥4.5:1; aria-live for answer reveal and waiting states; no motion required to complete play.
