# 🏁 Sprint Roadmap — Cognitive Gym

Delivery plan turning `docs/architecture.md`, `docs/blueprint.md`, and `docs/book-to-shortstories.md` into working software. Process rules (the sprint loop, DoD, git conventions) live in [AGENTS.md](AGENTS.md).

**Sprint loop (every sprint):** ① Scope + Plan → ② Implement → ③ Verify (tests, typecheck, lint, smoke) → ④ Commit + Push.

---

## Status Board

| Sprint | Title | Maps to architecture phase | Status |
| :-- | :-- | :-- | :-- |
| 0 | Foundation & Tooling | Phase 1 (partial) | ✅ Done |
| 1 | Data Layer (SQLite + Migrations) | Phase 1 | ✅ Done |
| 2 | Ollama Orchestration & Bake-Off Panel | Phase 2 | ✅ Done |
| 3 | Socratic Math Module MVP | Phase 3 | ✅ Done |
| 4 | Flashcards & Leitner Spaced Repetition | Phase 4 | ✅ Done |
| 5 | Ingestion Pipeline v1 (PDF → DB) | Phase 3 | ✅ Done |
| 6 | Episodic Reader ("30-Day Book Gym") | Phase 3 + book-to-shortstories | ✅ Done |
| 7 | Reading Room (Literature & History) | Phase 3–4 | ✅ Done |
| 8 | Coding Sandbox + Logic & Systems | Phase 4 | ⬜ Not started |
| 9 | Synthetic Seed Pipeline | blueprint.md §1 | ⬜ Not started |
| 10 | Gamification & Packaging | Phase 5 | ⬜ Not started |

---

## Test Assets (local only — never commit)

- `Wolves of the Calla - Stephen King.pdf` (repo root, ~3.9 MB) — real-world fixture for Sprints 5–7. Untracked via `.gitignore`; all derived text stays in the local SQLite DB only (see AGENTS.md §6).
- Synthetic/public-domain fixtures live in `tests/fixtures/` for committed tests.

---

## Sprint 0 — Foundation & Tooling

**Goal:** A runnable Electron + React + TypeScript shell with the full dev/test toolchain wired, so every later sprint starts from a verified baseline.

**Scope & plan:**
- Scaffold repo: Electron, React 19, TypeScript (strict), Vite 8 (via `electron-vite`), TailwindCSS 4, `better-sqlite3` dependency (Electron-ABI verified).
- Set up Vitest (unit + integration), ESLint + Prettier, `npm run dev / test / typecheck / lint / build` scripts.
- Create directory skeleton per architecture.md §4: `src/main`, `src/renderer` (`/components`, `/views`, `/hooks`), `src/shared`, `content-library/*`, `tests/`.
- Add `.gitignore` (node_modules, build output, root `*.pdf` test assets, local DB files).
- Minimal window loads React view; one typed IPC ping-pong channel proves the process bridge.

**Verify:** IPC ping test (mocked), toolchain smoke tests pass, typecheck/lint clean, `npm run dev` shows the shell.
**Exit:** commit `chore: sprint 0 — electron/react/ts scaffold with test toolchain`, push.

## Sprint 1 — Data Layer

**Goal:** Persistent local storage with the full relational schema and a clean repository API.

**Scope & plan:**
- Migration runner (versioned, ordered, testable) over `better-sqlite3`.
- Schemas from all three docs: `user_progress`, `flashcards` (architecture.md §5), `content_pool`, `interactive_prompts` (blueprint.md §4), `book_episodes`, `user_reading_streaks` (book-to-shortstories.md).
- Typed repository/DAO layer (`src/main/db/*`) exposed to renderer via IPC.
- Fixture seeds for dev mode.

**Verify:** migrations run fresh + incrementally; CRUD tests per table against a temp DB; FK cascade tests; repo round-trip through IPC.
**Exit:** commit + push, status board updated.

## Sprint 2 — Ollama Orchestration & Bake-Off Panel

**Goal:** One wrapper for all AI calls with live engine switching, plus the developer bake-off UI.

**Scope & plan:**
- `OllamaClient` in `src/main/ollama/`: health check, model list, `generate`/`chat` (non-streaming; streaming deferred to Sprint 7's chat UI), latency + tokens/sec metrics, typed failure kinds.
- Engine setting (Qwen 2.5 7B ⇄ Llama 3.1 8B) persisted in DB (`app_settings`, migration v2), switchable at runtime — never hardcoded.
- **Prompt registry** (`src/shared/prompts/`): Socratic Math/Logic template, Code Diagnostics template, Literary Compressor & Evaluator, Socratic Hint Tree Builder, Episodic Chunker — verbatim from the docs.
- Bake-Off Tester Panel view: same prompt → both models side-by-side, latency/token metrics, tone comparison.

**Verify:** client tested against a mocked Ollama HTTP server (success, timeout, malformed JSON, non-JSON model output); prompt registry snapshot tests; manual panel smoke with real Ollama if available.
**Exit:** commit + push.

## Sprint 3 — Socratic Math Module MVP

**Goal:** First user-facing module: infinite procedural math with Socratic hinting.

**Scope & plan:**
- Math template engine: load `/content-library/math-formulas/*.json`, parse `random_int_range` style variable specs, seed deterministic instances.
- Ship seed templates: Power Rule (Calc 1) from the docs + 2–3 more (linear equations, exponent rules).
- Problem renderer view + step-by-step Socratic hint flow (hint tiers, never the answer) using the registry prompts.
- Write attempts + success to `user_progress`.

**Verify:** generator determinism (same seed → same problem), variable bounds respected, template resolution unit tests, hint-flow integration test with mocked Ollama, progress persistence test.
**Exit:** commit + push.

## Sprint 4 — Flashcards & Leitner SRS

**Goal:** Spaced-repetition flashcards with the Leitner box algorithm.

**Scope & plan:**
- Leitner scheduler (boxes 1–5, promotion/demotion rules, `next_review_due` computation) as a pure, heavily-tested module.
- Deck + card CRUD UI; "due today" review queue; pre-compiled decks in `/content-library/flashcards` (e.g., Military Alphabet).
- Review session view (5–20 min micro-session format).

**Verify:** exhaustive Leitner transition tests (correct/incorrect × all boxes), due-date scheduling math, DB integration, UI smoke.
**Exit:** commit + push.

## Sprint 5 — Ingestion Pipeline v1

**Goal:** Turn a local PDF/EPUB/TXT into structured, question-bearing content in SQLite.

**Scope & plan:**
- File picker → structural extraction (strip headers/footers, chapter detection via typography) with `pdf` parsing lib (unpdf; EPUB via adm-zip spine walk).
- Chunking engine: 300–600 word reading blocks, paragraph-edge safe, never mid-sentence (book-to-shortstories.md rules). Deviation: distillation consumes the reading chunks directly — the doc's separate 1500-token windowing pass was redundant, so it was dropped (one chunking pass instead).
- Distillation step via Ollama (Literary Compressor & Evaluator prompt): 3 comprehension questions + solution vectors; strict JSON validation with bounded retry, then write to `content_pool` / `interactive_prompts`. The model's `content_chunk` is validated but never stored — the pipeline's own chunk is (untrusted-output rule).
- Ingestion progress UI + library management (list/reingest/delete ingested books).

**Verify:** extraction unit tests on committed public-domain fixture; chunk-boundary tests (property-based: no chunk ends mid-sentence); distillation contract tests with mocked LLM incl. malformed-JSON retry path; **manual end-to-end run on the root PDF** (results stay local).
**Exit:** commit + push.

## Sprint 6 — Episodic Reader ("30-Day Book Gym")

**Goal:** The book-to-shortstories.md experience: a book becomes ~30 daily episodes.

**Scope & plan:**
- Episodic chunking agent (episodicChunkingPrompt from the doc): narrative hooks/cliffhangers, 1-sentence recaps for canonical episodes.
- Track tagging: `is_canonical` serialized (locked order, spoiler-safe) vs `independent` anthology (shufflable).
- Daily reader view: episode text + Socratic question side panel; `user_reading_streaks` updates; "next episode" gating.
- Anthology mixing: shuffled independent episodes woven into the daily feed.

**Verify:** ordering engine tests (canonical locked, anthology shuffled deterministically per seed), streak/date-rollover tests, gating tests, UI smoke.
**Exit:** commit + push.

## Sprint 7 — Reading Room (Literature & History)

**Goal:** Comprehension practice over ingested + synthetic passages with AI semantic grading.

**Scope & plan:**
- Reading session view: passage + interpretive questions, free-text answers.
- Grading flow: local model scores answer against the stored solution vector (semantic criteria, not multiple choice), returns feedback + score.
- Wire results into `user_progress` and difficulty ranking; `/content-library/history` seed content.

**Verify:** grading prompt contract tests (mocked model), score persistence, guardrail test that feedback never emits the full model answer, UI smoke.
**Exit:** commit + push.

## Sprint 8 — Coding Sandbox + Logic & Systems

**Goal:** The remaining three practice rooms.

**Scope & plan:**
- Coding diagnostics: read-only broken-code viewer, error-spotting flow, hint ladder via Code Diagnostics prompt; goal-based (fix the bug, not rewrite).
- Logic grids: deduction puzzle schema in `/content-library/logic-grids`, assertion board, contradiction alerts from the model.
- Systems failures: log/config failure mocks in `/content-library/systems-logs`, user proposes fix, model validates.

**Verify:** sandbox state machine tests, logic-grid consistency checking with mocked model, schema validation for all three content types, UI smoke.
**Exit:** commit + push.

## Sprint 9 — Synthetic Seed Pipeline

**Goal:** Zero-source generation so the app is rich before any book is imported.

**Scope & plan:**
- Math question factory (blueprint.md §1A) and short-story synthesis (§1B: 4-paragraph Asimov-style dilemma + 3 analytical parameters).
- Batch seeding CLI/panel: generate N modules per category with schema validation; dedupe by uuid into `content_pool` with `source_type='synthetic'`.

**Verify:** generated payload schema validation (property tests), dedupe/idempotent re-run tests, mocked-model batch generation, manual quality review via bake-off panel.
**Exit:** commit + push.

## Sprint 10 — Gamification & Packaging

**Goal:** Make the habit stick, then ship installers.

**Scope & plan:**
- Daily streaks dashboard, progress scatter plots (diagnostic speed over time), module mastery overview.
- Performance pass (startup time, DB query review).
- Production builds: Windows `.exe` (NSIS) + macOS `.dmg`; verify packaged app runs with local SQLite + Ollama.

**Verify:** e2e smoke suite against packaged build (or dev-equivalent), streak/plot data tests, installer launch verification.
**Exit:** commit + push, tag `v0.1.0`.

---

## Risks & Standing Decisions

- **7B/8B models are weak at strict JSON** → all LLM outputs are schema-validated with bounded retries (designed in from Sprint 2, not bolted on).
- **Copyrighted test book** → extraction is exercised manually on the local PDF; committed fixtures are synthetic/public-domain only.
- **Ollama may not be running during dev** → every AI-dependent test uses mocks; real-model checks are explicit manual steps.
- **better-sqlite3 is a native module** → pinned to the Electron ABI via rebuild step documented in Sprint 0.
- **Book front matter produces junk chunks** (real-book E2E finding, Sprint 6) → the chunker tops up below-minimum chunks from the next unit at sentence boundaries instead of flushing small ones.

## Post-v0.1 Backlog (not scheduled)

Session pause/resume, multiple user profiles, EPUB ingestion hardening, Socratic tree visualization, export/import of decks, auto-update channel.
