import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiFailure, GenerationResult } from '@shared/ai-types';

export type SideStatus = 'idle' | 'running' | 'done' | 'error';

export interface BakeOffSide {
  status: SideStatus;
  result?: GenerationResult;
  failure?: AiFailure;
  /** Tokens rendered live while the side is running. */
  streaming?: string;
}

export type BakeOffSideKey = 'left' | 'right';

const initialSide: BakeOffSide = { status: 'idle' };

/**
 * Runs the same prompt against two models concurrently and tracks each side
 * independently — one model failing must not hide the other's result. Tokens
 * stream live into `streaming` while the run is in flight.
 */
export function useBakeOff(): {
  sides: Record<BakeOffSideKey, BakeOffSide>;
  isRunning: boolean;
  run: (prompt: string, system: string | undefined, leftModel: string, rightModel: string) => Promise<void>;
  reset: () => void;
} {
  const [sides, setSides] = useState<Record<BakeOffSideKey, BakeOffSide>>({
    left: initialSide,
    right: initialSide
  });

  // Streaming chunks arrive via global events; route them by streamId.
  // A ref (not state) — routing is imperative and must not re-render.
  const streamIds = useRef<Record<string, BakeOffSideKey>>({});
  const buffers = useRef<Record<string, string>>({});

  useEffect(() => {
    return window.api.onStreamChunk((event) => {
      const side = streamIds.current[event.streamId];
      if (!side) return;
      buffers.current[event.streamId] = (buffers.current[event.streamId] ?? '') + event.token;
      setSides((prev) => ({
        ...prev,
        [side]: {
          ...prev[side],
          status: 'running',
          streaming: buffers.current[event.streamId]
        }
      }));
    });
  }, []);

  const run = useCallback(
    async (
      prompt: string,
      system: string | undefined,
      leftModel: string,
      rightModel: string
    ): Promise<void> => {
      setSides({ left: { status: 'running' }, right: { status: 'running' } });
      buffers.current = {};

      const settle = async (side: BakeOffSideKey, model: string): Promise<BakeOffSide> => {
        const streamId = `bakeoff-${side}-${Date.now()}`;
        streamIds.current[streamId] = side;
        const outcome = await window.api.aiStreamGenerate({ streamId, model, prompt, system });
        delete streamIds.current[streamId];
        const buffered = buffers.current[streamId];
        delete buffers.current[streamId];
        return outcome.ok
          ? { status: 'done', result: outcome.result }
          : { status: 'error', failure: outcome.failure, streaming: buffered };
      };

      const [left, right] = await Promise.all([
        settle('left', leftModel),
        settle('right', rightModel)
      ]);
      setSides({ left, right });
    },
    []
  );

  const reset = useCallback((): void => {
    setSides({ left: initialSide, right: initialSide });
    buffers.current = {};
  }, []);

  return {
    sides,
    isRunning: sides.left.status === 'running' || sides.right.status === 'running',
    run,
    reset
  };
}