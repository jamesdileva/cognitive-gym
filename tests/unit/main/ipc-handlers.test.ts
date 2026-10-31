import { describe, expect, it, vi } from 'vitest';
import { buildDbStatus } from '@main/db/dbStatus';
import { openDatabase } from '@main/db/database';
import { createFlashcardsRepo } from '@main/db/repositories/flashcardsRepo';
import { handlePing, registerIpcHandlers, type IpcServices } from '@main/ipcHandlers';
import type { AiGenerateRequest, AiResult, AiStatusResponse } from '@shared/ai-types';
import type { MathHintResult, MathProblem, MathTopicSummary } from '@shared/math-types';
import type { DeckSummary } from '@shared/srs-types';
import type { IngestionReport, IngestedSourceSummary } from '@shared/ingestion-types';
import type {
  DailyFeed,
  EpisodeQuestion,
  EpisodeSummary,
  EpisodeTrack,
  EpisodicIngestReport,
  EpisodicIngestRequest
} from '@shared/episodes-types';
import type { GradeResult, ReadingPassageSummary, ReadingSession } from '@shared/reading-types';
import type { SynthesisReport } from '@shared/synthesis-types';
import type {
  DiagnosticsListItem,
  DiagnosticsSubmitResult,
  CodingProblemView,
  LogicPuzzleView,
  SystemsCaseView,
} from '@shared/diagnostics-types';
import { IPC_CHANNELS } from '@shared/ipc-types';

describe('handlePing', () => {
  it('echoes the payload and stamps the injected clock', () => {
    expect(handlePing({ payload: 'hello-gym' }, 1234)).toEqual({
      echo: 'hello-gym',
      receivedAtMs: 1234
    });
  });

  it('defaults the timestamp to the current time', () => {
    const before = Date.now();
    const response = handlePing({ payload: 'x' });
    expect(response.receivedAtMs).toBeGreaterThanOrEqual(before);
  });
});

describe('registerIpcHandlers', () => {
  const sampleProblem: MathProblem = {
    templateId: 'calc1_power_rule_01',
    seed: 1,
    topic: 'Calculus 1 — Power Rule',
    display: 'Differentiate: f(x) = 3x^5'
  };

  const noopServices: IpcServices = {
    dbStatus: () => ({ migrationVersion: 4, tableCounts: {}, totalRows: 0 }),
    aiStatus: async () => ({ engine: 'qwen2.5:7b', models: [], ollamaAvailable: false }),
    aiSetEngine: async (model: string) => ({ engine: model }),
    aiGenerate: async (_request: AiGenerateRequest): Promise<AiResult> => ({
      ok: false,
      failure: { kind: 'unreachable', message: 'not wired in this test' }
    }),
    mathTopics: () => ({ topics: [] as MathTopicSummary[] }),
    mathNewProblem: () => ({ problem: sampleProblem }),
    mathCheckAnswer: () => ({ correct: false, note: '' }),
    mathReveal: () => ({ steps: [], answer: '' }),
    mathHint: async (): Promise<MathHintResult> => ({ ok: true, hint: 'Look at the exponent.' }),
    srsDecks: () => ({ decks: [] as DeckSummary[] }),
    srsDraw: () => ({ card: null }),
    srsReveal: () => ({ back: '' }),
    srsGrade: () => ({ back: '', box: 1, nextDueDays: 1 }),
    ingestSelectFile: async () => ({ path: null }),
    ingestRun: async (): Promise<IngestionReport> => ({
      title: 'x',
      kind: 'txt',
      chunkCount: 0,
      ingestedCount: 0,
      questionCount: 0,
      failures: []
    }),
    ingestLibrary: () => ({ sources: [] as IngestedSourceSummary[] }),
    ingestDelete: () => ({ deleted: false }),
    epIngest: async (_request: EpisodicIngestRequest): Promise<EpisodicIngestReport> => ({
      title: 'x',
      kind: 'txt',
      chunkCount: 0,
      ingestedCount: 0,
      questionCount: 0,
      failures: []
    }),
    epTracks: () => ({ tracks: [] as EpisodeTrack[] }),
    epFeed: () => ({ feed: {} as DailyFeed }),
    epFinish: () => ({ nextEpisodeNumber: null }),
    epQuestions: () => ({ questions: [] as EpisodeQuestion[] }),
    epList: () => ({ episodes: [] as EpisodeSummary[] }),
    readPassages: () => ({ passages: [] as ReadingPassageSummary[] }),
    readStart: () => ({ session: {} as ReadingSession }),
    readSubmit: async (): Promise<GradeResult> => ({ ok: true, score: 90, feedback: 'good' }),
    diagContent: () => ({ items: [] as DiagnosticsListItem[] }),
    diagOpen: () => ({ item: {} as CodingProblemView | LogicPuzzleView | SystemsCaseView }),
    diagSubmit: async (): Promise<DiagnosticsSubmitResult> => ({
      kind: 'logic',
      correct: true,
      note: ''
    }),
    diagHint: async () => ({ ok: true, hint: '' }),
    synthStories: async (): Promise<SynthesisReport> => ({
      requested: 0,
      generated: 0,
      questionCount: 0,
      failures: []
    }),
    synthMath: async (): Promise<SynthesisReport> => ({
      requested: 0,
      generated: 0,
      questionCount: 0,
      failures: []
    }),
    dashOverview: () => ({ dailyStreak: 0, dueCards: 0, modules: [], activity: [] })
  };

  const capture = (): Map<string, unknown> => {
    const handlers = new Map<string, unknown>();
    registerIpcHandlers(
      { handle: (channel, handler) => void handlers.set(channel, handler) },
      noopServices
    );
    return handlers;
  };

  it('registers exactly one handler per contract channel, in order', () => {
    const registrar = { handle: vi.fn() };
    registerIpcHandlers(registrar, noopServices);

    const channels = registrar.handle.mock.calls.map((call) => call[0]);
    expect(channels).toEqual([
      IPC_CHANNELS.ping,
      IPC_CHANNELS.dbStatus,
      IPC_CHANNELS.aiStatus,
      IPC_CHANNELS.aiSetEngine,
      IPC_CHANNELS.aiGenerate,
      IPC_CHANNELS.mathTopics,
      IPC_CHANNELS.mathNewProblem,
      IPC_CHANNELS.mathCheckAnswer,
      IPC_CHANNELS.mathReveal,
      IPC_CHANNELS.mathHint,
      IPC_CHANNELS.srsDecks,
      IPC_CHANNELS.srsDraw,
      IPC_CHANNELS.srsReveal,
      IPC_CHANNELS.srsGrade,
      IPC_CHANNELS.ingestSelectFile,
      IPC_CHANNELS.ingestRun,
      IPC_CHANNELS.ingestLibrary,
      IPC_CHANNELS.ingestDelete,
      IPC_CHANNELS.epIngest,
      IPC_CHANNELS.epTracks,
      IPC_CHANNELS.epFeed,
      IPC_CHANNELS.epList,
      IPC_CHANNELS.epFinish,
      IPC_CHANNELS.epQuestions,
      IPC_CHANNELS.readPassages,
      IPC_CHANNELS.readStart,
      IPC_CHANNELS.readSubmit,
      IPC_CHANNELS.diagContent,
      IPC_CHANNELS.diagOpen,
      IPC_CHANNELS.diagSubmit,
      IPC_CHANNELS.diagHint,
      IPC_CHANNELS.synthStories,
      IPC_CHANNELS.synthMath,
      IPC_CHANNELS.dashOverview
    ]);
  });

  it('wires the ping handler to the pure logic', () => {
    const pingHandler = capture().get(IPC_CHANNELS.ping) as (
      event: unknown,
      request: { payload: string }
    ) => unknown;
    expect(pingHandler({}, { payload: 'bridge-test' })).toEqual({
      echo: 'bridge-test',
      receivedAtMs: expect.any(Number)
    });
  });

  it('round-trips a real database through the dbStatus handler (repo → IPC)', () => {
    const db = openDatabase(':memory:');
    createFlashcardsRepo(db).create({ deckName: 'd', frontPrompt: 'f', backAnswer: 'b' });

    const handlers = new Map<string, unknown>();
    registerIpcHandlers(
      { handle: (channel, handler) => void handlers.set(channel, handler) },
      { ...noopServices, dbStatus: () => buildDbStatus(db) }
    );

    const dbStatusHandler = handlers.get(IPC_CHANNELS.dbStatus) as () => unknown;
    expect(dbStatusHandler()).toEqual({
      migrationVersion: 4,
      tableCounts: {
        flashcards: 1,
        user_progress: 0,
        content_pool: 0,
        interactive_prompts: 0,
        book_episodes: 0,
        user_reading_streaks: 0
      },
      totalRows: 1
    });
  });

  it('delegates ai channels to the engine service', async () => {
    const aiStatus = vi.fn(async (): Promise<AiStatusResponse> => ({
      engine: 'llama3.1:8b',
      models: ['llama3.1:8b'],
      ollamaAvailable: true
    }));
    const aiSetEngine = vi.fn(async (model: string) => ({ engine: model }));
    const aiGenerate = vi.fn(async (): Promise<AiResult> => ({
      ok: true,
      result: {
        text: 'hi',
        model: 'qwen2.5:7b',
        metrics: { latencyMs: 5, promptTokens: 1, completionTokens: 1, tokensPerSecond: 200 }
      }
    }));

    const handlers = new Map<string, unknown>();
    registerIpcHandlers(
      { handle: (channel, handler) => void handlers.set(channel, handler) },
      { ...noopServices, aiStatus, aiSetEngine, aiGenerate }
    );

    const statusHandler = handlers.get(IPC_CHANNELS.aiStatus) as () => Promise<AiStatusResponse>;
    await expect(statusHandler()).resolves.toEqual({
      engine: 'llama3.1:8b',
      models: ['llama3.1:8b'],
      ollamaAvailable: true
    });

    const setEngineHandler = handlers.get(IPC_CHANNELS.aiSetEngine) as (
      event: unknown,
      model: string
    ) => Promise<{ engine: string }>;
    await expect(setEngineHandler({}, 'm2')).resolves.toEqual({ engine: 'm2' });
    expect(aiSetEngine).toHaveBeenCalledWith('m2');

    const generateHandler = handlers.get(IPC_CHANNELS.aiGenerate) as (
      event: unknown,
      request: AiGenerateRequest
    ) => Promise<AiResult>;
    const request: AiGenerateRequest = { model: 'qwen2.5:7b', prompt: 'p' };
    const outcome = await generateHandler({}, request);
    expect(outcome.ok).toBe(true);
    expect(aiGenerate).toHaveBeenCalledWith(request);
  });

  it('delegates math channels to the math service', async () => {
    const mathTopics = vi.fn(() => ({ topics: [] }));
    const mathNewProblem = vi.fn(() => ({ problem: sampleProblem }));
    const mathCheckAnswer = vi.fn(() => ({ correct: true, note: 'Correct.' }));
    const mathReveal = vi.fn(() => ({ steps: ['s1'], answer: 'x = 6' }));
    const mathHint = vi.fn(async (): Promise<MathHintResult> => ({ ok: true, hint: 'Check the exponent.' }));

    const handlers = new Map<string, unknown>();
    registerIpcHandlers(
      { handle: (channel, handler) => void handlers.set(channel, handler) },
      { ...noopServices, mathTopics, mathNewProblem, mathCheckAnswer, mathReveal, mathHint }
    );

    (handlers.get(IPC_CHANNELS.mathTopics) as () => unknown)();
    const newProblem = (
      handlers.get(IPC_CHANNELS.mathNewProblem) as (event: unknown, request: unknown) => unknown
    )({}, { templateId: 'calc1_power_rule_01' });
    const check = (
      handlers.get(IPC_CHANNELS.mathCheckAnswer) as (event: unknown, request: unknown) => unknown
    )({}, { problem: sampleProblem, answer: 'x = 6' });
    (handlers.get(IPC_CHANNELS.mathReveal) as (event: unknown, request: unknown) => unknown)(
      {},
      { problem: sampleProblem }
    );
    await (
      handlers.get(IPC_CHANNELS.mathHint) as (event: unknown, request: unknown) => Promise<unknown>
    )({}, { problem: sampleProblem, userMessage: 'why?' });

    expect(mathTopics).toHaveBeenCalledOnce();
    expect(mathNewProblem).toHaveBeenCalledWith({ templateId: 'calc1_power_rule_01' });
    expect(newProblem).toEqual({ problem: sampleProblem });
    expect(check).toEqual({ correct: true, note: 'Correct.' });
    expect(mathReveal).toHaveBeenCalledWith({ problem: sampleProblem });
    expect(mathHint).toHaveBeenCalledWith({ problem: sampleProblem, userMessage: 'why?' });
  });
});
