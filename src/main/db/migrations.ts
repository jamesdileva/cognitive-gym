import type { Migration } from './migrator';

/**
 * Schema v1 — the union of all three product docs:
 *  - architecture.md §5: user_progress, flashcards
 *  - blueprint.md §4: content_pool, interactive_prompts
 *  - book-to-shortstories.md: book_episodes, user_reading_streaks
 *
 * Hardening added on top of the doc drafts (documented here, as AGENTS.md §3
 * requires validating data at boundaries):
 *  - NOT NULL on identifiers/bodies, CHECK constraints on enums and ranges
 *  - UNIQUE(module_type, content_item_id) so progress is an upsertable row per item
 *  - UNIQUE(book_title, episode_number) so a book cannot define an episode twice
 *  - UNIQUE(content_pool_uuid, question_index) so question sets stay ordered & unique
 *  - indexes for the access patterns the repos use
 *
 * Timestamp convention: every timestamp written by repositories is an ISO-8601
 * UTC string (Date.prototype.toISOString), which compares correctly with plain
 * string operators. Column defaults (CURRENT_TIMESTAMP) are a fallback only.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial-schema',
    up: `
      CREATE TABLE user_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        module_type TEXT NOT NULL CHECK (module_type IN ('math', 'english', 'history', 'coding', 'systems')),
        content_item_id TEXT NOT NULL,
        difficulty_rank INTEGER NOT NULL DEFAULT 1 CHECK (difficulty_rank >= 1),
        total_attempts INTEGER NOT NULL DEFAULT 0 CHECK (total_attempts >= 0),
        successful_attempts INTEGER NOT NULL DEFAULT 0 CHECK (successful_attempts >= 0),
        last_attempted_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (module_type, content_item_id)
      );
      CREATE INDEX idx_user_progress_module ON user_progress (module_type);

      CREATE TABLE flashcards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deck_name TEXT NOT NULL,
        front_prompt TEXT NOT NULL,
        back_answer TEXT NOT NULL,
        leitner_box_position INTEGER NOT NULL DEFAULT 1 CHECK (leitner_box_position BETWEEN 1 AND 5),
        next_review_due DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_flashcards_deck ON flashcards (deck_name);
      CREATE INDEX idx_flashcards_due ON flashcards (next_review_due);

      CREATE TABLE content_pool (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL UNIQUE,
        module TEXT NOT NULL CHECK (module IN ('math', 'english', 'coding', 'history', 'logic')),
        sub_topic TEXT,
        source_type TEXT NOT NULL CHECK (source_type IN ('synthetic', 'user_ingested')),
        source_title TEXT,
        passage_body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_content_pool_module ON content_pool (module);

      CREATE TABLE interactive_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_pool_uuid TEXT NOT NULL,
        question_index INTEGER NOT NULL,
        prompt_text TEXT NOT NULL,
        solution_criteria TEXT,
        hint_tier_1 TEXT,
        hint_tier_2 TEXT,
        hint_tier_3 TEXT,
        UNIQUE (content_pool_uuid, question_index),
        FOREIGN KEY (content_pool_uuid) REFERENCES content_pool (uuid) ON DELETE CASCADE
      );
      CREATE INDEX idx_interactive_prompts_content ON interactive_prompts (content_pool_uuid);

      CREATE TABLE book_episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_title TEXT NOT NULL,
        episode_number INTEGER NOT NULL CHECK (episode_number >= 1),
        episode_title TEXT,
        content_text TEXT NOT NULL,
        is_canonical INTEGER NOT NULL DEFAULT 1 CHECK (is_canonical IN (0, 1)),
        UNIQUE (book_title, episode_number)
      );
      CREATE INDEX idx_book_episodes_book ON book_episodes (book_title, episode_number);

      CREATE TABLE user_reading_streaks (
        book_title TEXT NOT NULL PRIMARY KEY,
        current_episode INTEGER NOT NULL DEFAULT 1 CHECK (current_episode >= 1),
        last_read_date TIMESTAMP
      );
    `
  },
  {
    version: 2,
    name: 'app-settings',
    up: `
      CREATE TABLE app_settings (
        key TEXT NOT NULL PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
  },
  {
    version: 3,
    name: 'episode-recaps-and-questions',
    up: `
      ALTER TABLE book_episodes ADD COLUMN episode_recap TEXT;
      ALTER TABLE book_episodes ADD COLUMN content_uuid
        REFERENCES content_pool (uuid) ON DELETE SET NULL;
    `
  },
  {
    version: 4,
    name: 'activity-log-and-review-tracking',
    up: `
      CREATE TABLE attempt_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        module_type TEXT NOT NULL,
        content_item_id TEXT NOT NULL,
        successful INTEGER NOT NULL CHECK (successful IN (0, 1)),
        created_at TIMESTAMP NOT NULL
      );
      CREATE INDEX idx_attempt_log_created ON attempt_log (created_at);
      ALTER TABLE flashcards ADD COLUMN last_reviewed_at TIMESTAMP;
    `
  }
];
