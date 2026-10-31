import type { SynthesisReport } from '@shared/synthesis-types';
import type { IngestProgress } from '@shared/ingestion-types';
import type { ContentPoolRepo } from '../db/repositories/contentPoolRepo';
import type { AiEngineService } from '../ollama/engine';
import { createMathFactory } from './mathFactory';
import { createStoryArchitect } from './storyArchitect';

export interface SynthesisServiceDeps {
  engine: Pick<AiEngineService, 'generateWithEngine'>;
  contentPool: ContentPoolRepo;
  /** Where generated math templates persist (userData/math-templates). */
  mathTemplatesDir: string;
}

/** Hard sci-fi seeds for the story factory — original topic prompts. */
const STORY_TOPICS = [
  'a lighthouse keeper who starts receiving signals from tomorrow',
  'an archive that lends memories out for interest',
  'the last translator of a language spoken only by machines',
  'a city where shadows are registered, taxed, and occasionally stolen',
  'a courier carrying the first message out of a colony that went silent',
  'a observatory that discovers the stars are being rearranged politely',
  'a locksmith who builds keys for doors that do not exist yet',
  'an exam that determines which citizens are allowed to remember the war',
  'a terraforming crew that finds their weather running six seconds late',
  'a mathematician who proves the universe is finite and someone files an appeal',
  'a rescue ship that can only save people who agree to forget the rescue',
  'a library where every book is a contract with its reader'
];

/**
 * The synthetic seed pipeline (blueprint.md §1): zero-source generation so
 * content exists before any book is imported. Stories land in content_pool
 * (source_type 'synthetic', unique uuid per story) and surface in the Reading
 * Room; math templates persist as files and surface in Math Gym.
 */
export function createSynthesisService(deps: SynthesisServiceDeps) {
  const storyArchitect = createStoryArchitect({ engine: deps.engine });
  const mathFactory = createMathFactory({ engine: deps.engine, outputDir: deps.mathTemplatesDir });

  return {
    async generateStories(
      count: number,
      onProgress?: (progress: IngestProgress) => void
    ): Promise<SynthesisReport> {
      const failures: SynthesisReport['failures'] = [];
      let generated = 0;
      let questionCount = 0;

      for (let index = 0; index < count; index += 1) {
        const topic = STORY_TOPICS[index % STORY_TOPICS.length];
        onProgress?.({ stage: 'stories', current: index + 1, total: count });
        const outcome = await storyArchitect.synthesize(topic);
        if (!outcome.ok) {
          failures.push({ chunkIndex: index, reason: outcome.reason });
          continue;
        }
        deps.contentPool.insertWithPrompts({
          module: 'english',
          subTopic: 'Synthetic Fiction',
          sourceType: 'synthetic',
          sourceTitle: outcome.story.title,
          passageBody: outcome.story.storyText,
          prompts: outcome.story.questions.map((question) => ({
            questionIndex: question.questionIndex,
            promptText: question.promptText,
            solutionCriteria: question.solutionCriteria
          }))
        });
        generated += 1;
        questionCount += outcome.story.questions.length;
      }

      return { requested: count, generated, questionCount, failures };
    },

    async generateMathTemplates(
      count: number,
      onProgress?: (progress: IngestProgress) => void
    ): Promise<SynthesisReport> {
      const failures: SynthesisReport['failures'] = [];
      const seenIds = new Set(mathFactory.existingTemplateIds());
      let generated = 0;

      for (let index = 0; index < count; index += 1) {
        onProgress?.({ stage: 'math-templates', current: index + 1, total: count });
        const outcome = await mathFactory.generate();
        if (!outcome.ok) {
          failures.push({ chunkIndex: index, reason: outcome.reason });
          continue;
        }
        // Cross-run dedupe: a re-generated id already persisted is a retry
        // artifact, not new content.
        if (seenIds.has(outcome.template.template_id)) {
          failures.push({
            chunkIndex: index,
            reason: `duplicate template_id '${outcome.template.template_id}'`
          });
          continue;
        }
        seenIds.add(outcome.template.template_id);
        mathFactory.persist(outcome.template);
        generated += 1;
      }

      return { requested: count, generated, questionCount: 0, failures };
    }
  };
}

export type SynthesisService = ReturnType<typeof createSynthesisService>;
