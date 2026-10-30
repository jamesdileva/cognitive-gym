# Cognitive Gym 🧠

Local-first desktop AI tutoring app — micro-learning sessions (5–20 min) across math, reading, coding, logic, and memory, powered entirely by your own machine: **Electron + React (TypeScript) + SQLite + Ollama**.

| Document | Purpose |
| :-- | :-- |
| [`docs/`](docs/) | Product idea, architecture, and ingestion blueprint |
| [`AGENTS.md`](AGENTS.md) | Working agreement — sprint loop, standards, guardrails |
| [`sprint-roadmap.md`](sprint-roadmap.md) | Sprint-by-sprint delivery plan with live status |

## Development

```bash
npm install
npm run dev        # run the Electron app with HMR
npm test           # Vitest unit/integration tests
npm test:watch     # tests in watch mode
npm run typecheck  # main + renderer TS projects
npm run lint       # ESLint
npm run build      # production build
```

> **Note:** `Wolves of the Calla - Stephen King.pdf` in the repo root is a personal local fixture for testing the ingestion pipeline (Sprint 5+) and is intentionally git-ignored. Never commit books or extracted book text — see AGENTS.md §6.
