import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { parseFigureSegments } from '@shared/figure-markers';
import type { TextSegmentOrFigure } from '@shared/figure-markers';

const imageCache = new Map<string, string>();

/** Fetches a figure PNG (base64) once per relPath, cached in-module. */
export function useFigureImage(relPath: string | null): string | null {
  const [base64, setBase64] = useState<string | null>(() =>
    relPath ? (imageCache.get(relPath) ?? null) : null
  );

  useEffect(() => {
    if (!relPath) {
      setBase64(null);
      return;
    }
    const cached = imageCache.get(relPath);
    if (cached) {
      setBase64(cached);
      return;
    }
    let cancelled = false;
    void window.api.figuresFetch({ relPath }).then(({ base64: fetched }) => {
      if (!cancelled && fetched) {
        imageCache.set(relPath, fetched);
        setBase64(fetched);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [relPath]);

  return base64;
}

/** Renders parsed segments: text paragraphs and figure images inline. */
export function FigureAwareText({ text, className }: { text: string; className?: string }): JSX.Element {
  const segments = parseFigureSegments(text);
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === 'text' ? (
          <p key={index} className={className}>
            {segment.text}
          </p>
        ) : (
          <FigureBlock key={index} segment={segment} />
        )
      )}
    </>
  );
}

function FigureBlock({ segment }: { segment: TextSegmentOrFigure & { kind: 'figure' } }): JSX.Element {
  const base64 = useFigureImage(segment.relPath);
  return (
    <figure className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      {base64 && (
        <img
          src={`data:image/png;base64,${base64}`}
          alt={`Figure from page ${segment.page}`}
          className="mx-auto max-h-96 rounded"
        />
      )}
      <figcaption className="mt-2 text-xs text-zinc-500">
        Figure (page {segment.page}): {segment.description}
      </figcaption>
    </figure>
  );
}
