import { useCallback, useState } from 'react';
import type { AiFailure, GenerationResult } from '@shared/ai-types';

export type SideStatus = 'idle' | 'running' | 'done' | 'error';

export interface BakeOffSide {
  status: SideStatus;
  result?: GenerationResult;
  failure?: AiFailure;
}

export type BakeOffSideKey = 'left' | 'right';

const initialSide: BakeOffSide = { status: 'idle' };

/**
 * Runs the same prompt against two models concurrently and tracks each side
 * independently — one model failing must not hide the other's result.
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

  const run = useCallback(
    async (
      prompt: string,
      system: string | undefined,
      leftModel: string,
      rightModel: string
    ): Promise<void> => {
      setSides({ left: { status: 'running' }, right: { status: 'running' } });

      const settle = async (model: string): Promise<BakeOffSide> => {
        const outcome = await window.api.aiGenerate({ model, prompt, system });
        return outcome.ok
          ? { status: 'done', result: outcome.result }
          : { status: 'error', failure: outcome.failure };
      };

      const [left, right] = await Promise.all([settle(leftModel), settle(rightModel)]);
      setSides({ left, right });
    },
    []
  );

  const reset = useCallback((): void => {
    setSides({ left: initialSide, right: initialSide });
  }, []);

  return { sides, isRunning: sides.left.status === 'running' || sides.right.status === 'running', run, reset };
}
