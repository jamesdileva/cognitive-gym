import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDiagnosticsContent } from '@main/diagnostics/diagnosticsLoader';
import { createDiagnosticsService } from '@main/diagnostics/diagnosticsService';
import type {
  ModuleType,
  UserProgressRow
} from '@main/db/repositories/userProgressRepo';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const CONTENT = loadDiagnosticsContent(join(REPO_ROOT, 'content-library'));

function makeProgressSpy() {
  const attempts: { moduleType: ModuleType; contentItemId: string; successful: boolean }[] = [];
  return {
    attempts,
    recordAttempt: vi.fn(
      (input: { moduleType: ModuleType; contentItemId: string; successful: boolean }): UserProgressRow => {
        attempts.push(input);
        return {
          id: attempts.length,
          module_type: input.moduleType,
          content_item_id: input.contentItemId,
          difficulty_rank: 1,
          total_attempts: 1,
          successful_attempts: input.successful ? 1 : 0,
          last_attempted_timestamp: new Date().toISOString()
        };
      }
    )
  };
}

function makeEngine(score: number | null, hintText = 'Look at the loop bounds.') {
  return {
    generateWithEngine: vi.fn(async (_request: { system?: string }) => ({
      text:
        score === null
          ? hintText
          : JSON.stringify({ score, feedback: 'Reasoning noted. What does the final iteration touch?' }),
      model: 'test-model',
      metrics: { latencyMs: 1, promptTokens: null, completionTokens: null, tokensPerSecond: null }
    }))
  };
}

let progressSpy: ReturnType<typeof makeProgressSpy>;

beforeEach(() => {
  progressSpy = makeProgressSpy();
});

describe('diagnosticsService — coding room', () => {
  it('opens problems without shipping the bug criteria', () => {
    const service = createDiagnosticsService({
      engine: makeEngine(null),
      progress: progressSpy,
      content: CONTENT
    });

    const { item } = service.open('coding', 'coding_off_by_one_01');
    expect(item).toMatchObject({ title: 'The Average That Crashes', language: 'python' });
    expect(JSON.stringify(item)).not.toContain('off-by-one');
    expect(JSON.stringify(item)).not.toContain('IndexError');
  });

  it('grades the bug identification and records a coding attempt', async () => {
    const service = createDiagnosticsService({
      engine: makeEngine(85),
      progress: progressSpy,
      content: CONTENT
    });

    const outcome = await service.submit({
      kind: 'coding',
      id: 'coding_off_by_one_01',
      answer: 'readings[i + 1] reads past the end on the last iteration; use readings[i].'
    });

    expect(outcome).toMatchObject({ kind: 'graded', ok: true, score: 85 });
    expect(progressSpy.attempts).toEqual([
      { moduleType: 'coding', contentItemId: 'coding_off_by_one_01', successful: true }
    ]);
  });

  it('renders the registry code-diagnostics prompt for the hint ladder', async () => {
    const engine = makeEngine(null, 'The final index overruns the array. What does range() yield last?');
    const service = createDiagnosticsService({ engine, progress: progressSpy, content: CONTENT });

    const hint = await service.codingHint('coding_off_by_one_01', 'I am stuck.');

    expect(hint.ok).toBe(true);
    const call = engine.generateWithEngine.mock.calls[0][0];
    expect(call.system).toContain('Do not overwrite or output the corrected full file script');
    expect(call.system).toContain('three incremental, progressive hints');
    expect(call.system).toContain('summarize_readings should return the average');
    expect(call.system).toContain('readings[i + 1]');
    expect(hint.ok && hint.hint).toContain('overruns the array');
  });
});

describe('diagnosticsService — logic room', () => {
  it('opens the board without the solution', () => {
    const service = createDiagnosticsService({
      engine: makeEngine(null),
      progress: progressSpy,
      content: CONTENT
    });

    const { item } = service.open('logic', 'logic_harbor_01');
    expect(JSON.stringify(item)).not.toContain('"solution"');
    expect(JSON.stringify(item)).not.toContain('Ines", "Pet": "heron');
    expect(item).toMatchObject({ rowCategory: 'Keeper' });
  });

  it('checks the board deterministically and records a systems attempt', () => {
    const service = createDiagnosticsService({
      engine: makeEngine(null),
      progress: progressSpy,
      content: CONTENT
    });

    const correctRows = [
      { Keeper: 'Ines', Pet: 'heron', Lamp: 'red' },
      { Keeper: 'Bram', Pet: 'cat', Lamp: 'blue' },
      { Keeper: 'Sol', Pet: 'eel', Lamp: 'green' }
    ];
    const solved = service.submit({ kind: 'logic', id: 'logic_harbor_01', answer: correctRows });
    expect(solved).toEqual({ kind: 'logic', correct: true, note: expect.stringContaining('Solved') });
    expect(progressSpy.attempts).toEqual([
      { moduleType: 'systems', contentItemId: 'logic_harbor_01', successful: true }
    ]);

    const wrong = service.submit({
      kind: 'logic',
      id: 'logic_harbor_01',
      answer: [
        { Keeper: 'Ines', Pet: 'cat', Lamp: 'red' },
        { Keeper: 'Bram', Pet: 'heron', Lamp: 'blue' },
        { Keeper: 'Sol', Pet: 'eel', Lamp: 'green' }
      ]
    });
    expect(wrong).toMatchObject({ kind: 'logic', correct: false });
    expect(progressSpy.attempts[1].successful).toBe(false);
  });

  it('rejects incomplete boards without a model call', () => {
    const engine = makeEngine(null);
    const service = createDiagnosticsService({ engine, progress: progressSpy, content: CONTENT });

    const outcome = service.submit({
      kind: 'logic',
      id: 'logic_harbor_01',
      answer: [{ Keeper: 'Ines', Pet: 'heron', Lamp: 'red' }]
    });
    expect(outcome).toMatchObject({ kind: 'logic', correct: false });
    expect(engine.generateWithEngine).not.toHaveBeenCalled();
    expect(progressSpy.attempts[0].successful).toBe(false);
  });

  it('asks the model for a contradiction alert on the partial board', async () => {
    const engine = makeEngine(null, 'Assignment 3 breaks clue 3 — the eel lamp must be green. Re-check Sol.');
    const service = createDiagnosticsService({ engine, progress: progressSpy, content: CONTENT });

    const hint = await service.logicHint('logic_harbor_01', [
      { Keeper: 'Sol', Pet: 'eel', Lamp: 'red' }
    ]);

    expect(hint.ok).toBe(true);
    const call = engine.generateWithEngine.mock.calls[0][0];
    expect(call.system).toContain('Ines keeps the heron');
    expect(call.system).toContain('without ever stating the final solution');
  });
});

describe('diagnosticsService — systems room', () => {
  it('grades the diagnosis against the stored criteria', async () => {
    const service = createDiagnosticsService({
      engine: makeEngine(75),
      progress: progressSpy,
      content: CONTENT
    });

    const outcome = await service.submit({
      kind: 'systems',
      id: 'systems_upstream_502_01',
      answer: 'web.3 blocked its event loop for 61s; router timed out at 30s. Restart and move heavy work off the request path.'
    });

    expect(outcome).toMatchObject({ kind: 'graded', ok: true, score: 75 });
    expect(progressSpy.attempts).toEqual([
      { moduleType: 'systems', contentItemId: 'systems_upstream_502_01', successful: true }
    ]);
  });

  it('maps grades below the threshold to unsuccessful attempts', async () => {
    const service = createDiagnosticsService({
      engine: makeEngine(30),
      progress: progressSpy,
      content: CONTENT
    });
    await service.submit({ kind: 'systems', id: 'systems_backup_full_01', answer: 'router bug' });
    expect(progressSpy.attempts[0]).toMatchObject({ moduleType: 'systems', successful: false });
  });
});

describe('diagnosticsService — cross-room guards', () => {
  it('throws on unknown ids and kinds', () => {
    const service = createDiagnosticsService({
      engine: makeEngine(null),
      progress: progressSpy,
      content: CONTENT
    });
    expect(() => service.open('coding', 'nope')).toThrow(/Unknown coding problem/);
    expect(() => service.open('logic', 'nope')).toThrow(/Unknown logic grid/);
    expect(() => service.open('systems', 'nope')).toThrow(/Unknown systems case/);
  });

  it('lists items for every room', () => {
    const service = createDiagnosticsService({
      engine: makeEngine(null),
      progress: progressSpy,
      content: CONTENT
    });
    expect(service.list('coding').items).toHaveLength(2);
    expect(service.list('logic').items).toHaveLength(1);
    expect(service.list('systems').items).toHaveLength(2);
  });
});
