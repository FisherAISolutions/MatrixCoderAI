'use client';
/**
 * Reusable screenshot block for the landing page.
 *
 * - If `src` is provided, renders the real image (Next.js <Image>) and
 *   gracefully falls back to the green placeholder if the file is missing
 *   (e.g. you haven't dropped the PNG into /public yet).
 * - If `src` is omitted, renders the labelled placeholder as before.
 *
 * Lives outside `page.tsx` because Next.js App Router page files are
 * only allowed to export a single default route component (plus the
 * documented metadata-style named exports) — adding arbitrary named
 * exports trips the type validator at build time.
 */

import Image from 'next/image';
import { useState } from 'react';

export default function ScreenshotPlaceholder({
  label,
  hint,
  src,
  alt,
}: {
  label: string;
  hint: string;
  /** Absolute path under /public, e.g. "/assets/landing/workspace-chat.png" */
  src?: string;
  /** Optional override for the <img alt>. Defaults to `label`. */
  alt?: string;
}) {
  const [errored, setErrored] = useState(false);
  const showImage = Boolean(src) && !errored;

  return (
    <div className="h-full w-full bg-matrix-surface relative">
      {showImage ? (
        <Image
          src={src as string}
          alt={alt ?? label}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover"
          priority={false}
          onError={() => setErrored(true)}
          data-testid="landing-screenshot-image"
        />
      ) : (
        <>
          {/* Diagonal hatching makes the placeholder obviously a placeholder
           *  without looking ugly. Fades naturally when the real screenshot
           *  ships in (just pass a `src` to this component). */}
          <div
            className="absolute inset-0 opacity-50"
            style={{
              background:
                'repeating-linear-gradient(45deg, rgba(10,92,37,0.35) 0 8px, transparent 8px 16px)',
            }}
            aria-hidden="true"
          />
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-matrix-green-muted">
                screenshot placeholder
              </p>
              <p className="mt-3 text-lg sm:text-2xl font-bold tracking-[0.04em] text-matrix-green neon-text-glow">
                {label}
              </p>
              <p className="mt-3 text-[11px] tracking-widest text-matrix-green-muted">
                {hint}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
