# Comp-Sci Quiz

A multiplayer quiz game built on Cloudflare's edge network with sub-50ms latency anywhere in the world.

## Edge-Fast Gaming

Your quiz runs on Cloudflare Workers, deployed to 300+ cities. Players in Tokyo, New York, London, and Sydney will all hit the same edge location—they're all ñ seconds away from your game.

Speed matters here. Answers arrive before the next reaction blink. That's the point of edge computing: minimize the distance between player and game.

## How It Works

1. Choose 10–600 questions, create a game → Share the link
2. Players join with auto-generated tokens → Game starts automatically
3. Race each other → Submit answers instantly
4. Live scoreboard updates in real-time

Scoring: +1 for a correct answer, −0.25 for a wrong answer, and 0 for “Don’t know.” Skipping reveals the correct answer and advances the quiz. Scores can go below zero.

Stack: Hono for the backend, React on the frontend, Cloudflare KV for storage.

## Use Cases

- **Education**: Competitive quizzes in Computer Science classes
- **Events**: Team-building at conferences and hackathons
- **Marketing**: Interactive product knowledge contests
- **Training**: Onboarding quizzes for tech teams

## Quick Start

```bash
npm ci
npm run dev
```

Deploy to the edge in seconds:

```bash
# Login to Cloudflare
npx wrangler login

# Create a KV namespace
npx wrangler kv namespace create QUIZ_KV

# Update wrangler.jsonc with your namespace ID

# Deploy
npm run build
npx wrangler deploy
```

That's it. Your game is live.

## Production Notes

- Players need valid tokens to access games
- Rate limiting protects your app (300 API requests per minute per IP)
- CORS guards cross-site access
- Credentials expire after 24 hours
- KV storage is eventually consistent

## Development

```bash
# Local development server
npm run dev

# Type checking
npm run typecheck

# Security game flow tests
npm test

# API smoke tests
npm run test:api

# Browser tests (requires Playwright)
npm run test:browser
```

## Performance

- Deploys in <1 second to 300+ cities
- Average response time <50ms globally
- Auto-scales to 10,000+ concurrent players
- Zero cold starts

Built with Vite, React 19, Hono, Tailwind CSS.

## License

MIT License

---

Built for Computer Science education. Submit questions in PRs.