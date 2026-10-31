import { describe, expect, it } from 'vitest';
import { PROMPT_REGISTRY, getPromptTemplate, renderPrompt } from '@shared/prompts';

describe('prompt registry', () => {
  it('contains the six shipped system prompts with unique ids', () => {
    expect(PROMPT_REGISTRY.map((t) => t.id)).toMatchInlineSnapshot(`
      [
        "socratic-math",
        "code-diagnostics",
        "literary-compressor",
        "hint-tree-builder",
        "episodic-chunker",
        "reading-grader",
      ]
    `);
    expect(new Set(PROMPT_REGISTRY.map((t) => t.id)).size).toBe(PROMPT_REGISTRY.length);
  });

  it('declares every placeholder the template actually uses', () => {
    for (const template of PROMPT_REGISTRY) {
      const used = new Set([...template.template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
      for (const declared of template.placeholders) {
        expect(used.has(declared), `${template.id} must use {${declared}}`).toBe(true);
      }
    }
  });
});

describe('Socratic guardrails (AGENTS.md §7 — hints only, never answers)', () => {
  it('math tutor forbids revealing the answer and demands exactly one question', () => {
    const t = getPromptTemplate('socratic-math');
    expect(t.template).toContain('NEVER reveal the final mathematical answer');
    expect(t.template).toContain('EXACTLY ONE highly specific guiding question');
  });

  it('code diagnostics forbids outputting the corrected file', () => {
    const t = getPromptTemplate('code-diagnostics');
    expect(t.template).toContain('Do not overwrite or output the corrected full file script');
    expect(t.template).toContain('three incremental, progressive hints');
  });

  it('hint tree builder forbids final answers and defines the 3-tier matrix', () => {
    const t = getPromptTemplate('hint-tree-builder');
    expect(t.template).toContain('Never provide the final code, equation answer');
    expect(t.template).toContain('3-tier progressive hint matrix');
    expect(t.template).toContain('["hint_1", "hint_2", "hint_3"]');
  });
});

describe('ingestion prompt constraints', () => {
  it('literary compressor demands strict JSON and bounded extraction', () => {
    const t = getPromptTemplate('literary-compressor');
    expect(t.template).toContain('valid, escape-compliant JSON');
    expect(t.template).toContain('300 and 500 words');
    expect(t.template).toContain('Do not truncate mid-sentence');
  });

  it('episodic chunker enforces the 300-600 word episode window', () => {
    const t = getPromptTemplate('episodic-chunker');
    expect(t.template).toContain('300 to 600 words');
    expect(t.template).toContain('Never cut off mid-sentence or mid-scene');
  });
});

describe('reading grader guardrails (hints only, no answer key leakage)', () => {
  it('grades against the solution vector but forbids revealing it', () => {
    const t = getPromptTemplate('reading-grader');
    expect(t.template).toContain('NEVER reveal, restate, or paraphrase the solution vector');
    expect(t.template).toContain('exactly ONE guiding question');
    expect(t.template).toContain('{"score": <integer 0-100>, "feedback"');
    expect(t.placeholders).toEqual(['passage', 'question', 'solution_criteria', 'answer']);
  });
});

describe('renderPrompt', () => {
  it('fills declared placeholders and leaves unknown tokens visible', () => {
    const rendered = renderPrompt('socratic-math', {
      computed_problem: 'f(x) = 3x^5',
      solution_steps: 'power rule',
      not_a_placeholder: 'x'
    });
    expect(rendered).toContain('Core Problem: f(x) = 3x^5');
    expect(rendered).toContain('Structural Correct Steps: power rule');
    expect(rendered).not.toContain('{computed_problem}');
  });

  it('throws on unknown template ids', () => {
    expect(() => renderPrompt('nope')).toThrow(/Unknown prompt template/);
  });
});
