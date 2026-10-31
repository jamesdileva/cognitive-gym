import { useCallback, useEffect, useState } from 'react';
import type {
  CodingProblemView,
  DiagnosticsKind,
  DiagnosticsListItem,
  DiagnosticsSubmitResult,
  LogicPuzzleView,
  LogicRow,
  SystemsCaseView
} from '@shared/diagnostics-types';

export type OpenItem = CodingProblemView | LogicPuzzleView | SystemsCaseView;

export interface HintState {
  loading: boolean;
  hint?: string;
  error?: string;
}

/**
 * Shared state for the three diagnostics rooms: list → open → submit/hint.
 * One session instance serves all three kinds via the `kind` discriminator.
 */
export function useDiagnostics(kind: DiagnosticsKind) {
  const [items, setItems] = useState<DiagnosticsListItem[]>([]);
  const [item, setItem] = useState<OpenItem | null>(null);
  const [answer, setAnswer] = useState('');
  const [board, setBoard] = useState<LogicRow[]>([]);
  const [result, setResult] = useState<DiagnosticsSubmitResult | null>(null);
  const [hint, setHint] = useState<HintState>({ loading: false });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    const { items: fresh } = await window.api.diagContent({ kind });
    setItems(fresh);
  }, [kind]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openItem = useCallback(
    async (id: string): Promise<void> => {
      const { item: fresh } = await window.api.diagOpen({ kind, id });
      setItem(fresh);
      setResult(null);
      setAnswer('');
      setHint({ loading: false });
      if (kind === 'logic' && 'rowCategory' in fresh) {
        const puzzle = fresh as LogicPuzzleView;
        setBoard(puzzle.fillCategories.map(() => ({})));
      } else {
        setBoard([]);
      }
    },
    [kind]
  );

  const closeItem = useCallback((): void => {
    setItem(null);
    setResult(null);
    setAnswer('');
    setBoard([]);
    setHint({ loading: false });
  }, []);

  const setRowValue = useCallback((rowIndex: number, category: string, value: string): void => {
    setBoard((prev) =>
      prev.map((row, index) => (index === rowIndex ? { ...row, [category]: value } : row))
    );
  }, []);

  const submit = useCallback(async (): Promise<void> => {
    if (!item || busy) return;
    setBusy(true);
    try {
      const payload = kind === 'logic' ? board : answer;
      const outcome = await window.api.diagSubmit({ kind, id: item.id, answer: payload });
      setResult(outcome);
    } finally {
      setBusy(false);
    }
  }, [item, busy, kind, board, answer]);

  const requestHint = useCallback(async (): Promise<void> => {
    if (!item || hint.loading) return;
    setHint({ loading: true });
    try {
      const payload = kind === 'logic' ? board : answer || '(no attempt yet)';
      const outcome = await window.api.diagHint({ kind, id: item.id, answer: payload });
      setHint(
        outcome.ok
          ? { loading: false, hint: outcome.hint }
          : { loading: false, error: `${outcome.failure.kind}: ${outcome.failure.message}` }
      );
    } finally {
      // loading state cleared above on both paths
    }
  }, [item, hint.loading, kind, board, answer]);

  const canSubmit =
    kind === 'logic'
      ? board.length > 0 && board.every((row) => Object.values(row).every((v) => v !== ''))
      : answer.trim().length > 0;

  return {
    items,
    item,
    answer,
    board,
    result,
    hint,
    busy,
    canSubmit,
    refresh,
    openItem,
    closeItem,
    setAnswer,
    setRowValue,
    submit,
    requestHint
  };
}
