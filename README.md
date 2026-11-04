# Cognitive Gym 🧠

Local-first desktop AI tutoring app — micro-learning sessions (5–20 min) across math, reading, coding, logic, and memory, powered entirely by your own machine: **Electron + React (TypeScript) + SQLite + Ollama**.

**Status:** `v0.1.2` — all ten roadmap sprints delivered (see the [releases](https://github.com/jamesdileva/cognitive-gym/releases)).

| Document | Purpose |
| :-- | :-- |
| [`docs/`](docs/) | Product idea, architecture, and ingestion blueprint |
| [`AGENTS.md`](AGENTS.md) | Working agreement — sprint loop, standards, guardrails |
| [`sprint-roadmap.md`](sprint-roadmap.md) | Sprint-by-sprint delivery plan with live status |

## The gym

| Surface | What you do |
| :-- | :-- |
| **Dashboard** (Home) | Daily streak, module mastery, 30-day activity chart |
| **Math Gym** | Infinite procedural problems with a Socratic hint tutor |
| **Flashcards** | Leitner spaced repetition over validated deck files |
| **Daily Read** | Books as episodic tracks — serialized novels or shuffled anthologies |
| **Reading Room** | Free-text comprehension answers, graded semantically against hidden criteria |
| **Diagnostics** | Broken-code hunt, deduction grids, log-trace failure diagnosis |
| **Library** | Ingest personal books (PDF/EPUB/TXT) into local exercises |
| **Generator** | Zero-source synthesis — new stories and math templates from your local model |
| **AI Bake-Off** | Compare Qwen vs Llama side-by-side; pick your engine |

Everything runs locally: content lives in a SQLite database in your user data directory, and all model calls go to `http://localhost:11434` (Ollama). No cloud, no telemetry.

## Development

```bash
npm install
npm run dev        # run the Electron app with HMR
npm test           # Vitest unit/integration tests
npm run test:watch # tests in watch mode
npm run typecheck  # main + renderer TS projects
npm run lint       # ESLint
npm run format     # Prettier
npm run build      # production build (out/)
```

## Packaging

```bash
npm run dist       # NSIS installer + unpacked build (release/)
npm run dist:dir   # unpacked build only (faster)
npm run dist:mac   # dmg (macOS only)
```

Artifacts land in `release/` (git-ignored). `better-sqlite3` is rebuilt against the Electron ABI automatically and unpacked from the asar; `content-library/` ships inside the package.

> **Note:** `Wolves of the Calla - Stephen King.pdf` in the repo root is a personal local fixture for testing the ingestion pipeline and is intentionally git-ignored. Never commit books or extracted book text — see AGENTS.md §6.
