# 🗺️ Architecture Blueprint: Local Cognitive Gym (Tutor App)
## Project Draft Version 1.0

This document outlines the architectural design for a local-first, desktop-based AI tutoring application. The application functions as a "cognitive gym" designed to sharpen cognitive skills across multiple domains through micro-learning sessions (under 1 hour). It features infinite math variations, rich literary/historical analysis, bite-sized coding sandboxes, interactive systems diagnostics, and spaced-repetition flashcards.

---

## 1. Project Overview & System Philosophy
The application prioritizes performance, complete data ownership, and cost efficiency by running entirely locally on the user's desktop environment. 

### Core Design Pillars:
* **Local-First Executable:** No external cloud dependencies for core workflows, preventing latency and API platform lock-in.
* **Socratic AI Tutoring:** The AI agent acts exclusively as a guide, providing step-by-step logic hints instead of outright revealing final solutions.
* **Procedural & Template-Driven Content:** Avoids stale repetition by generating infinite variations from structured rules, math formulas, and a deep content parsing pipeline.
* **Micro-Learning Format:** Every activity is constrained to a 5-to-20 minute completion window to support sustainable daily habits.

---

## 2. Technology Stack & Ecosystem Selection

| Layer | Technology | Selection Justification |
| :--- | :--- | :--- |
| **App Wrapper** | **Electron** | Provides cross-platform desktop integration, native access to Node.js APIs, and full control over local operating system windows. |
| **Frontend Framework**| **React (TypeScript)** | Provides high performance rendering for UI dashboards, state managers for quizzes, component lifecycle controls for local code sandboxes, and compile-time type-safety. |
| **Styling Engine** | **TailwindCSS** | Facilitates rapid UI design cycles using a utility-first layout approach with zero runtime css cost. |
| **Local Database** | **SQLite (`better-sqlite3`)**| Light-weight, zero-configuration local database file that seamlessly tracks progress, stores flashcards, and manages state. |
| **AI Orchestration** | **Ollama Local Engine** | Standardized local REST interface (`http://localhost:11434`) used to toggle and execute multi-billion parameter models directly on hardware without usage caps. |
| **Primary Local LLMs** | **Qwen 2.5 7B** / **Llama 3.1 8B** | Compact, high-performance base models. **Qwen 2.5 7B** excels at structural coding and complex reasoning; **Llama 3.1 8B** provides excellent natural conversation, logic handling, and creative Socratic tone. |

---

## 3. High-Level Architectural Topology

The application relies on a dual-process architecture splitting frontend execution from native operating system management via Inter-Process Communication (IPC).

```
+-------------------------------------------------------------------------+
|                            ELECTRON APP WRAPPER                         |
|                                                                         |
|  +-------------------------------+     +-----------------------------+  |
|  |       RENDERER PROCESS        |     |        MAIN PROCESS         |  |
|  |   (React, HTML5, View Layer)  |     | (Node.js, File/Sys Access)  |  |
|  +---------------+---------------+     +--------------+--------------+  |
|                  |                                    |                 |
|                  |            IPC Channels            |                 |
|                  +====================================+                 |
|                                                                         |
+-------------------------------------------------------------------------+
                   |                                    |
                   v                                    v
     +---------------------------+        +---------------------------+
     |   OLLAMA API INTERFACE    |        |    SQLITE CORE ENGINE     |
     |  (localhost:11434 Engine) |        |  Progress Tracker / Decks |
     +---------------------------+        +---------------------------+
```

---

## 4. Application Directory Structure & Asset Management

```
/cognitive-gym-root
  ├── /src
  │    ├── /main
  │    │    ├── main.ts                 # Electron bootstrapper & lifecycle
  │    │    └── ipcHandlers.ts          # IPC communications bridge
  │    └── /renderer
  │         ├── index.tsx               # React entry mount point
  │         ├── /components             # Reusable UI parts (Flashcard, Code Sandbox)
  │         ├── /views                  # Module Dashboards (Math, English, Systems)
  │         └── /hooks                  # Unified hooks (useOllama, useDatabase)
  ├── /content-library
  │    ├── /stories                     # Extracted 3-5 paragraph classic sci-fi/literary markdown
  │    ├── /history                     # Short structural analytical breakdowns & events
  │    ├── /math-formulas               # JSON structural files for math matrix templates
  │    ├── /logic-grids                 # Deduction puzzle configuration schema
  │    ├── /systems-logs                # Complex system failure log mocks
  │    └── /flashcards                  # Pre-compiled flashcard matrices (e.g., Military Alphabet)
  ├── package.json
  └── tsconfig.json
```

---

## 5. Storage Layer & Database Relational Schema

SQLite tracks cross-module progression data, spacing configurations, and persistent flashcard decks.

```sql
-- Tracks user metric logs across all active domains
CREATE TABLE user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_type TEXT NOT NULL,         -- 'math', 'english', 'history', 'coding', 'systems'
    content_item_id TEXT NOT NULL,     -- Points to a specific content file or math template formula
    difficulty_rank INTEGER DEFAULT 1,  -- Track competency grading scalar
    total_attempts INTEGER DEFAULT 0,
    successful_attempts INTEGER DEFAULT 0,
    last_attempted_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Handles customized or packaged spaced repetition flashcard objects
CREATE TABLE flashcards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_name TEXT NOT NULL,           -- e.g., 'Military Alphabet', 'Python Syntax'
    front_prompt TEXT NOT NULL,        -- 'A', 'lambda arguments: expression'
    back_answer TEXT NOT NULL,         -- 'Alpha', 'Anonymous inline function definition'
    leitner_box_position INTEGER DEFAULT 1, -- Spaced repetition tier index (Box 1 to Box 5)
    next_review_due DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. Functional Core Module Designs

### A. Dynamic Socratic Math Hub (Infinite Variety Engine)
* **Goal:** Practice K-12 math concepts through Calculus 1 & 2 without running out of variations.
* **Mechanism:** Rather than hardcoding simple equations, store a parameterized pattern string. The main application engine replaces placeholders via random numeric seeding before showing it to the client.
* **Data Model Example (`/math-formulas/calc1_derivatives.json`):**
  ```json
  {
    "template_id": "calc1_power_rule_01",
    "topic": "Calculus 1 - Power Rule",
    "formula_string": "f(x) = {coeff}x^{power}",
    "variables": {
      "coeff": "random_int_range(2, 12)",
      "power": "random_int_range(3, 8)"
    },
    "ideal_solution_steps": [
      "Bring the exponent {power} to the front and multiply by coefficient {coeff}.",
      "The new coefficient becomes ({coeff} * {power}).",
      "Subtract 1 from the original power value.",
      "Result is f'(x) = ({coeff} * {power})x^({power} - 1)"
    ]
  }
  ```

### B. Literature & History Analytical Rooms
* **Goal:** Extract and test high-level critical thinking, reading comprehension, and synthesis skills using user books and public texts.
* **Mechanism:** Long textual classics or files are pre-chunked down into focused 3-to-5 paragraph sub-sections.
* **AI Evaluation Pipeline:** The application displays the reading segment alongside 2 interpretive questions. The user provides a written textual response. The local model grades the reasoning quality based on a strict semantic boundary rather than a rigid multiple-choice system.

### C. Coding Diagnostic Sandbox
* **Goal:** Debug pre-broken code scripts, targeting an overall time frame of under an hour.
* **Mechanism:** The view layer instantiates a read-only code display highlighting deliberate syntax errors or logic bugs. 
* **The Diagnostic Interface:** If the user fails to identify the error, they request automated analysis. The system transmits the active source code, language context, and error boundaries directly to Ollama for evaluation.

### D. Interactive Logic & Systems Diagnosis (Cognitive Gym Expansions)
* **Goal:** Test structural engineering analysis, pattern tracking, lateral thinking, and troubleshooting skills.
* **Logic Matrices:** Store logical deduction puzzles (e.g., Einstein riddle permutations) in tabular arrays. The user tests assertions, while the LLM monitors structural consistency and alerts the user to contradictions.
* **Systems Failures:** Textual log entries or configurations simulating failure profiles (e.g., server networking drops, automated machinery shutdowns). The user reads through the trace and proposes a solution, which the LLM validates against standard structural manuals.

---

## 7. The AI Bake-Off & Prompt Engineering Layer

To facilitate seamless real-world comparison testing between **Llama 3.1 8B** and **Qwen 2.5 7B**, the backend encapsulates Ollama calls in a wrapper class. This allows the user to switch the processing engine dynamically via an internal application dashboard setting.

### Standard System Prompts Configuration

#### Math & Logic Socratic Prompt Template:
```text
SYSTEM: You are a strict, supportive Socratic math tutor. The student is practicing a problem with the following parameters:
- Core Problem: {computed_problem}
- Structural Correct Steps: {solution_steps}

Your primary operational rules are:
1. NEVER reveal the final mathematical answer or write the completed equation step.
2. Evaluate the user's input text to identify their precise logical error.
3. Formulate a response consisting of EXACTLY ONE highly specific guiding question. This question must prompt the user toward making the next logical micro-deduction on their own.
```

#### Code Diagnostics Helper Prompt Template:
```text
SYSTEM: You are an expert system debugging assistant. The user is troubleshooting a broken script code block.
- Target Correct Output Goal: {code_goal}
- Current Buggy Script Code: {user_code}

Your execution rules are:
1. Do not overwrite or output the corrected full file script for the user.
2. Provide a 2-sentence summary identifying the functional nature of the mistake (e.g., variable scope pollution, infinite indexing boundaries).
3. Generate a structured list of three incremental, progressive hints that guide the user to fix the line structure manually.
```

---

## 8. Development Implementation Strategy & Milestones

1. **Phase 1: Inter-Process Architecture Setup**
   * Bootstrap Electron + React + TypeScript repository.
   * Configure basic IPC pipes between client view and system backend.
   * Instantiate local SQLite schema engine.

2. **Phase 2: Local AI Interfacing (Bake-Off Panel)**
   * Bind standard local fetch routing interfaces pointing directly to `localhost:11434`.
   * Program a dedicated "AI Engine Tester Panel" UI where developers can paste an identical response request to both Llama 3.1 and Qwen 2.5 side-by-side to review latency, token speeds, and tone.

3. **Phase 3: Formula Seeding & Extraction Engines**
   * Write math template engine parsers.
   * Write basic ingestion utilities to chunk raw text source books or markdown folders into database-friendly structures.

4. **Phase 4: Spaced Repetition Flashcards & Logic Sandboxes**
   * Hook up Leitner tracking algorithms to database timestamps.
   * Standardize CSS components for interactive logic boards and code review themes.

5. **Phase 5: Gamification & System Packaging**
   * Build beautiful daily progress streaks and visual scatter plots graphing diagnostic speed improvements.
   * Compile and generate optimized native builds (`.dmg`, `.exe`) for local distribution.
