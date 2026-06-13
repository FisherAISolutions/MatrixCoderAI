'use client';
/**
 * Landing-page FAQ accordion.
 *
 * Six high-objection questions. Answers honest, short, in-product voice.
 */

import { useState } from 'react';
import { Plus, Minus } from 'lucide-react';

const FAQ = [
  {
    q: 'Is the code I generate actually mine?',
    a: 'Yes — every file Matrix Coder AI emits is a standard Next.js + TypeScript file. Export the zip and deploy anywhere. No proprietary runtime, no DRM, no lock-in.',
  },
  {
    q: 'What happens if the AI breaks my project?',
    a: 'Every AI turn runs through the SEARCH/REPLACE patcher, which only applies edits that match the current file content. Failed patches surface a clear "Patch rejected" message — nothing is silently overwritten.',
  },
  {
    q: 'Does Matrix Coder AI work on existing projects?',
    a: 'Yes. Drop in a zip or import a public GitHub repo. The Repository Context layer feeds the AI exactly the files it needs, so feature requests land as minimal patches rather than full rewrites.',
  },
  {
    q: 'How do you keep my code private?',
    a: 'Generated files live in your Supabase project, scoped to your account via row-level security. The AI requests carry only the files relevant to the current turn — never your full workspace.',
  },
  {
    q: 'Can I use a different OpenAI model?',
    a: 'GPT-4.1 is the default. To upgrade to GPT-5 (or any other model your key has access to), set NEXT_PUBLIC_AI_MODEL in the env and redeploy. Everything else stays the same.',
  },
  {
    q: 'What about browser support for the in-browser sandbox?',
    a: 'WebContainer needs a cross-origin-isolated, modern browser (Chrome, Edge, Firefox, Safari 17+). On older browsers the validation pipeline gracefully skips and you can still use the editor + chat.',
  },
];

export default function LandingFAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="flex flex-col gap-px bg-matrix-border" data-testid="landing-faq">
      {FAQ.map((item, idx) => {
        const isOpen = open === idx;
        return (
          <button
            type="button"
            key={item.q}
            onClick={() => setOpen(isOpen ? null : idx)}
            className="text-left bg-matrix-bg hover:bg-matrix-card transition-colors p-6 lg:p-7 flex gap-4 items-start group"
            aria-expanded={isOpen}
            data-testid={`landing-faq-item-${idx}`}
          >
            <span className="mt-1 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center border border-matrix-border text-matrix-green group-hover:border-matrix-green transition-colors">
              {isOpen ? <Minus size={12} /> : <Plus size={12} />}
            </span>
            <div className="flex-1">
              <p className="text-sm sm:text-base font-bold tracking-[0.04em] text-matrix-green">
                {item.q}
              </p>
              <div
                className={`grid transition-all duration-300 ease-out ${
                  isOpen
                    ? 'grid-rows-[1fr] opacity-100 mt-3'
                    : 'grid-rows-[0fr] opacity-0 mt-0'
                }`}
              >
                <p className="overflow-hidden text-sm leading-relaxed text-matrix-readable">
                  {item.a}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
