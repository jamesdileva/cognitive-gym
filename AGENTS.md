# AGENTS.md — Working Agreement for AI Coding Agents & Humans

This file governs how work is done in the **Cognitive Gym** repository. Read it fully before writing code. The product vision lives in `docs/architecture.md`, `docs/blueprint.md`, and `docs/book-to-shortstories.md`; the delivery plan lives in `sprint-roadmap.md`.

---

## 1. Project Snapshot

A **local-first desktop AI tutoring app** ("cognitive gym") built with **Electron + React (TypeScript) + TailwindCSS + SQLite (better-sqlite3) + Ollama** (`http://localhost:11434`, switchable between Qwen 2.5 7B and Llama 3.1 8B). It delivers micro-learning sessions (5–20 min) across five modules: Socratic Math, Literature & History reading rooms, Coding diagnostics, Logic & Systems, and Leitner flashcards. It also ingests personal books (PDF/EPUB/TXT) and converts them into episodic daily reading tracks.

**Non-negotiable product principles** (from `docs/architecture.md`):

1. **Local-first** — core workflows never require cloud services.
2. **Socratic-only AI** — the AI guides with questions and hints; it must **never reveal final answers** in UI or prompts.
3. **Procedural & template-driven content** — infinite variations from parameterized templates, not static hardcoded items.
4. **Micro-learning** — every activity fits a 5–20 minute window.

---

## 2. Sprint Workflow (mandatory loop)

Every sprint follows the same four-stage loop. Do not skip stages; do not merge stages ad hoc.

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. SCOPE + PLAN    Restate the sprint goal from sprint-roadmap, │
│                    list concrete deliverables, identify risks,  │
│                    and write the task list BEFORE coding.       │
│ 2. IMPLEMENT       Build to the plan; keep changes scoped to    │
│                    the sprint; follow §3 standards.             │
│ 3. VERIFY          Run the full test suite + typecheck + lint.  │
│                    A sprint is NOT done with failing or skipped │
│                    tests. New code ships with new tests.        │
│ 4. COMMIT + PUSH   Conventional Commits (§5). One logical       │
│                    commit per deliverable, or one sprint commit │
│                    when deliverables are cohesive. Push to      │
│                    origin only after verification passes.       │
└─────────────────────────────────────────────────────────────────┘
```

**Definition of Done (every sprint):**

- [ ] All roadmap deliverables for the sprint exist and work.
- [ ] `npm test` passes (all new logic unit-tested; AI paths tested against mocks).
- [ ] `npm run typecheck` and `npm run lint` pass with zero errors.
- [ ] Manual smoke check of any UI built (`npm run dev`).
- [ ] Work committed with a Conventional Commit message and pushed.
- [ ] `sprint-roadmap.md` status table updated (e.g., ✅ done).

---

## 3. Coding Standards

- **TypeScript strict mode** everywhere; no `any` unless unavoidable and commented; no non-null `!` assertions on external data.
- **Process boundaries:** Renderer code never touches Node/SQLite/Ollama directly. All access goes through typed IPC channels defined in `src/main/ipcHandlers.ts` with a shared `src/shared/ipc-types.ts` contract.
- **File naming:** components `PascalCase.tsx`, hooks `useCamelCase.ts`, engines/services `camelCase.ts`. Tests live in `tests/` mirroring `src/` structure (unit) and `tests/e2e/` for smoke.
- **Error handling:** validate all data crossing boundaries (IPC payloads, Ollama JSON responses, parsed files). Ollama output is **untrusted text** — always schema-validate before writing to SQLite.
- **No secrets in the repo** (there should be none — everything is local).
- **Match surrounding style**; formatting is enforced by Prettier, linting by ESLint.

## 4. Commands (established in Sprint 0)

| Command | Purpose |
| :-- | :-- |
| `npm run dev` | Run the Electron app in dev mode |
| `npm test` | Run Vitest unit/integration tests |
| `npm run typecheck` | `tsc --noEmit` across main + renderer configs |
| `npm run lint` | ESLint check |
| `npm run build` | Production build of renderer + main |

## 5. Git Conventions

- **Conventional Commits:** `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:` (e.g., `feat(math): procedural power-rule generator`).
- Commit and push **only after the verification stage passes**.
- Work happens on `main` for planning docs; implementation sprints use short-lived feature branches (`sprint/N-<topic>`) merged to `main` after verification, unless the user directs otherwise.

## 6. Content, Copyright & Privacy Guardrails

- **Never commit books, PDFs, or extracted book text.** Test assets like `Wolves of the Calla - Stephen King.pdf` (repo root) are personal local fixtures — keep them untracked via `.gitignore` (`*.pdf` at root; adjust later for packaged assets).
- Ingested/derived book content (chunks, episodes, questions) lives **only in the local SQLite database**; never write it into source files, fixtures, or test snapshots.
- Committed test fixtures must be **synthetic or public-domain** text only.
- All user data stays on-device (SQLite in the app's userData directory). No telemetry, no external calls beyond `localhost:11434`.

## 7. AI Behavior Contract (domain rules agents must preserve)

- Socratic prompts (see `docs/architecture.md` §7, `docs/blueprint.md` §3) must be stored in a single **prompt registry** module — never inlined ad hoc in UI code.
- Any code path that surfaces AI output must assume it may attempt to leak the answer; the system prompts must instruct otherwise, and UI copy must reinforce "hints only."
- Ingestion agents must emit **strict, escape-compliant JSON**; parsers validate against the schemas in `docs/blueprint.md` §4 and reject/retry on failure.
- Model selection (Qwen vs Llama) is always user-switchable via the bake-off/engine setting — never hardcode a model.

## 8. When Instructions Conflict

Product requirements live in `docs/`; process lives here and in `sprint-roadmap.md`. If a doc and this file conflict on **how** to work, this file wins; if they conflict on **what** to build, the docs win, and the discrepancy should be raised with the user before implementing.
