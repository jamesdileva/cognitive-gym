# 📘 Ingestion & Generation Blueprint

This blueprint outlines how the Local AI Agent auto-generates content without external source material, and how it handles ingestion when parsing your private digital library (PDFs, EPUBs, TXTs).

---

## 1. Zero-Source Content Generation (Synthetic Seed Pipeline)

To populate the database with thousands of fresh challenges *before* you import books, the app utilizes **Synthetic Seed Injection**. The local LLM uses precise, parameterized prompts to generate valid, self-contained educational micro-modules.

### A. Infinite Math Question Factory
Instead of storing static math assets, the agent generates data structures containing the problem, variable bounds, algebraic steps, and Socratic hints.

```json
{
  "module": "math",
  "category": "Calculus 1",
  "topic": "Power Rule Derivatives",
  "difficulty_level": 3,
  "dynamic_parameters": {
    "coefficient": "random_int(2, 9)",
    "power": "random_int(3, 6)"
  },
  "generation_prompt": "Generate a unique math problem matching form: f(x) = {coefficient}x^{power}. Provide the derivative problem, the definitive final solution step, and 3 progressive, non-revealing Socratic hints."
}
```

### B. Literary Short-Story Synthesis
The local LLM is capable of drafting compelling, Asimov-style sci-fi snippets or historical deep dives under 500 words to test critical reading comprehension.

```yaml
System Prompt Matrix:
  Role: "Master Short Story Architect"
  Style Constraints: "Hard Sci-Fi, high lexical diversity, reminiscent of Isaac Asimov or Arthur C. Clarke."
  Structural Constraints: "Exactly 4 paragraphs. Must embed a core logical, philosophical, or scientific dilemma."
  Output Requirement: "Return a JSON payload matching the target schema containing the text and 3 analytical evaluation parameters."
```

---

## 2. Ingestion Pipeline Schema (For Personal Books)

When you choose to ingest a local digital asset, the system transitions from a zero-source generator to a **hybrid processing pipeline**.

```
[ Local File Input (.pdf / .epub) ]
               │
               ▼
┌─────────────────────────────────────────┐
│     Step 1: Structural Extraction       │  <- Code-based (Regex/PDFMiner)
│  • Strip headers, footers, & margins    │
│  • Locate chapter breaks via typography  │
└─────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│       Step 2: AI Window Chunking        │  <- LLM-based Token Control
│  • Slice raw stream into 1500-token blocks│
│  • Enforce paragraph-edge continuity     │
└─────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│       Step 3: Cognitive Distillation     │  <- Local AI Agent (Ollama)
│  • Synthesize 3 deep comprehension Qs  │
│  • Construct localized Socratic tree    │
└─────────────────────────────────────────┘
               │
               ▼
[ Write to Local SQLite Database ]
```

---

## 3. Targeted Agent Prompts (System Layer)

These raw system prompts are sent to your local Ollama connection (`Llama 3.1 8B` or `Qwen 2.5 7B`) to control the curation window.

### Prompt 1: The Literary Compressor & Evaluator
```text
You are the Reading Room Ingestion Agent. You are presented with a raw textual segment extracted from a classic book or historical document.

YOUR TASK:
1. Isolate a clean, high-impact reading block between 300 and 500 words. Do not truncate mid-sentence.
2. Craft 3 complex reading comprehension questions that require deep textual synthesis, deduction, or stylistic analysis (College Level).
3. For each question, draft a "Solution Vector"—the key criteria an ideal student answer must contain.

OUTPUT FORMAT:
You must output exclusively in valid, escape-compliant JSON. Do not include markdown wraps or introductory text.

{
  "content_chunk": "Extracted text here...",
  "meta": {
    "estimated_reading_time_seconds": 120,
    "lexical_density_score": 0.85
  },
  "evaluations": [
    {
      "question_number": 1,
      "question_text": "How does the author manipulate temporal perspective in the second paragraph?",
      "solution_vector": "Must identify the transition from omniscient past to internal monologue present tense."
    }
  ]
}
```

### Prompt 2: The Socratic Hint Tree Builder
```text
You are a Socratic Guide Engine. You will be passed a math formula pattern, a coding problem, or a logic grid alongside its definitive solution steps.

YOUR BOUNDARIES:
- Never provide the final code, equation answer, or immediate answer string.
- You must draft a 3-tier progressive hint matrix.
- Hint 1: Conceptual alignment (e.g., "Look at how the components relate...").
- Hint 2: Operational guidance (e.g., "Recall the power rule rules where you multiply...").
- Hint 3: Diagnostic observation (e.g., "Check your signs. What happens when you subtract 1 from a negative exponent?").

OUTPUT FORMAT:
Ensure strict JSON serialization arrays matching keys: ["hint_1", "hint_2", "hint_3"].
```

---

## 4. SQLite Content Mapping Target

The resulting data from both the **Synthetic Factory** and the **Ingestion Pipeline** maps directly into these integrated core tables:

```sql
CREATE TABLE content_pool (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE,
    module TEXT CHECK(module IN ('math', 'english', 'coding', 'history', 'logic')),
    sub_topic TEXT,               -- e.g., 'Linear Algebra', 'Golden Age Sci-Fi'
    source_type TEXT,              -- 'synthetic' OR 'user_ingested'
    source_title TEXT,             -- Name of book file or generator pattern seed
    passage_body TEXT,             -- The code string, math problem, or story text
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE interactive_prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_pool_uuid TEXT,
    question_index INTEGER,
    prompt_text TEXT,              -- The actual question or challenge objective
    solution_criteria TEXT,        -- Validation guidance or final math value
    hint_tier_1 TEXT,              -- Socratic Nudge 1
    hint_tier_2 TEXT,              -- Socratic Nudge 2
    hint_tier_3 TEXT,              -- Socratic Nudge 3
    FOREIGN KEY(content_pool_uuid) REFERENCES content_pool(uuid) ON DELETE CASCADE
);
```
