import { randomUUID } from 'node:crypto';
import type { IngestedSourceSummary } from '@shared/ingestion-types';
import type { GymDatabase } from '../database';

export type ContentModule = 'math' | 'english' | 'coding' | 'history' | 'logic';
export type SourceType = 'synthetic' | 'user_ingested';

export interface ContentPoolRow {
  id: number;
  uuid: string;
  module: ContentModule;
  sub_topic: string | null;
  source_type: SourceType;
  source_title: string | null;
  passage_body: string;
  created_at: string;
}

export interface InteractivePromptRow {
  id: number;
  content_pool_uuid: string;
  question_index: number;
  prompt_text: string;
  solution_criteria: string | null;
  hint_tier_1: string | null;
  hint_tier_2: string | null;
  hint_tier_3: string | null;
}

export interface ContentPromptInput {
  questionIndex: number;
  promptText: string;
  solutionCriteria?: string;
  hintTier1?: string;
  hintTier2?: string;
  hintTier3?: string;
}

export interface InsertContentInput {
  module: ContentModule;
  subTopic?: string;
  sourceType: SourceType;
  sourceTitle?: string;
  passageBody: string;
  prompts: ContentPromptInput[];
}

export interface ContentWithPrompts {
  content: ContentPoolRow;
  prompts: InteractivePromptRow[];
}

/**
 * The content store fed by both the synthetic factory (Sprint 9) and the
 * ingestion pipeline (Sprint 5). Content and its prompts are always written
 * atomically, and prompts die with their content (FK cascade).
 */
export function createContentPoolRepo(db: GymDatabase) {
  const insertPrompt = db.prepare(
    `
    INSERT INTO interactive_prompts (
      content_pool_uuid, question_index, prompt_text,
      solution_criteria, hint_tier_1, hint_tier_2, hint_tier_3
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `
  );

  return {
    /** Writes one content item and its prompts in a single transaction. Returns the new uuid. */
    insertWithPrompts(input: InsertContentInput): string {
      const uuid = randomUUID();
      const write = db.transaction(() => {
        db.prepare(
          `
          INSERT INTO content_pool (uuid, module, sub_topic, source_type, source_title, passage_body)
          VALUES (?, ?, ?, ?, ?, ?)
          `
        ).run(
          uuid,
          input.module,
          input.subTopic ?? null,
          input.sourceType,
          input.sourceTitle ?? null,
          input.passageBody
        );
        for (const prompt of input.prompts) {
          insertPrompt.run(
            uuid,
            prompt.questionIndex,
            prompt.promptText,
            prompt.solutionCriteria ?? null,
            prompt.hintTier1 ?? null,
            prompt.hintTier2 ?? null,
            prompt.hintTier3 ?? null
          );
        }
      });
      write();
      return uuid;
    },

    getByUuid(uuid: string): ContentWithPrompts | undefined {
      const content = db.prepare('SELECT * FROM content_pool WHERE uuid = ?').get(uuid) as
        | ContentPoolRow
        | undefined;
      if (!content) return undefined;
      const prompts = db
        .prepare('SELECT * FROM interactive_prompts WHERE content_pool_uuid = ? ORDER BY question_index')
        .all(uuid) as InteractivePromptRow[];
      return { content, prompts };
    },

    /** Lightweight listing for library views — passage bodies can be large. */
    listSummaries(): Omit<ContentPoolRow, 'passage_body'>[] {
      return db
        .prepare(
          `
          SELECT id, uuid, module, sub_topic, source_type, source_title, created_at
          FROM content_pool ORDER BY created_at DESC
          `
        )
        .all() as Omit<ContentPoolRow, 'passage_body'>[];
    },

    /** FK ON DELETE CASCADE removes the item's prompts with it. */
    deleteByUuid(uuid: string): boolean {
      return db.prepare('DELETE FROM content_pool WHERE uuid = ?').run(uuid).changes > 0;
    },

    /** Library summaries grouped by source (book) for one source type. */
    listSourceSummaries(sourceType: SourceType): IngestedSourceSummary[] {
      return db
        .prepare(
          `
          SELECT c.source_title AS sourceTitle,
                 COUNT(DISTINCT c.uuid) AS chunkCount,
                 COUNT(p.id) AS questionCount,
                 MIN(c.created_at) AS createdAt
          FROM content_pool c
          LEFT JOIN interactive_prompts p ON p.content_pool_uuid = c.uuid
          WHERE c.source_type = ?
          GROUP BY c.source_title
          ORDER BY createdAt DESC
          `
        )
        .all(sourceType) as IngestedSourceSummary[];
    },

    /** Deletes every chunk (and, by cascade, every prompt) of one source. */
    deleteBySource(sourceTitle: string, sourceType: SourceType): number {
      return db
        .prepare('DELETE FROM content_pool WHERE source_title = ? AND source_type = ?')
        .run(sourceTitle, sourceType).changes;
    }
  };
}

export type ContentPoolRepo = ReturnType<typeof createContentPoolRepo>;
