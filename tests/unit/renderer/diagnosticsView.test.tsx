// @vitest-environment jsdom
/**
 * Renderer regression tests (Sprint 10 audit). These exist because the
 * Diagnostics tab shipped a blank-screen bug: a child component called the
 * state hook a second time, so its `item` was always empty. SSR/click-through
 * rendering catches that class of hook-duplication bug.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DiagnosticsView from '@renderer/views/DiagnosticsView';
import type { GymApi } from '@shared/api-contract';
import type {
  DiagnosticsListItem,
  DiagnosticsSubmitResult
} from '@shared/diagnostics-types';

// The renderer contract — mocked at the preload boundary.
const mockApi: Pick<GymApi, 'diagContent' | 'diagOpen' | 'diagSubmit' | 'diagHint'> = {
  diagContent: vi.fn(async () => ({
    items: [
      {
        id: 'coding_off_by_one_01',
        title: 'The Average That Crashes',
        detail: 'python · summarize_readings should return the average'
      }
    ] as DiagnosticsListItem[]
  })),
  diagOpen: vi.fn(async () => ({
    item: {
      id: 'coding_off_by_one_01',
      title: 'The Average That Crashes',
      language: 'python',
      goal: 'summarize_readings should return the average of the list.',
      code: 'def summarize_readings(readings):\n    ...'
    }
  })),
  diagSubmit: vi.fn(
    async (): Promise<DiagnosticsSubmitResult> => ({
      kind: 'graded',
      ok: true,
      score: 85,
      feedback: 'Strong. One more consideration?'
    })
  ),
  diagHint: vi.fn(async (): Promise<{ ok: true; hint: string }> => ({
    ok: true,
    hint: 'Check the loop bounds.'
  }))
};

beforeEach(() => {
  vi.clearAllMocks();
  window.api = mockApi as unknown as GymApi;
});

afterEach(() => {
  cleanup();
});

describe('DiagnosticsView (click-through regression)', () => {
  it('renders the item list on mount', async () => {
    render(<DiagnosticsView />);
    await waitFor(() => {
      expect(mockApi.diagContent).toHaveBeenCalled();
      expect(screen.getByText('The Average That Crashes')).toBeTruthy();
    });
  });

  it('opens the session view when a card is clicked (was: blank screen)', async () => {
    render(<DiagnosticsView />);
    const card = await screen.findByText('The Average That Crashes');
    fireEvent.click(card);

    // The session must show the problem — the old double-hook bug rendered
    // an empty <div /> here because the child owned a second hook instance.
    await waitFor(() => {
      expect(mockApi.diagOpen).toHaveBeenCalledWith({
        kind: 'coding',
        id: 'coding_off_by_one_01'
      });
      expect(screen.getByText('← List')).toBeTruthy();
      expect(screen.getByText(/summarize_readings should return the average/)).toBeTruthy();
    });
  });

  it('returns to the list from the session view', async () => {
    render(<DiagnosticsView />);
    fireEvent.click(await screen.findByText('The Average That Crashes'));
    fireEvent.click(await screen.findByText('← List'));
    await waitFor(() => {
      expect(screen.getByText('The Average That Crashes')).toBeTruthy();
    });
  });
});
