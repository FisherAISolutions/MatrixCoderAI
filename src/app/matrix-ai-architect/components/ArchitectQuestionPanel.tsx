'use client';

import type { ArchitectAnswers, ArchitectQuestion } from '@/lib/matrix-ai-architect';

interface ArchitectQuestionPanelProps {
  questions: ArchitectQuestion[];
  answers: ArchitectAnswers;
  onChange: <K extends keyof ArchitectAnswers>(
    key: K,
    value: ArchitectAnswers[K]
  ) => void;
}

const CATEGORY_LABELS: Record<ArchitectQuestion['category'], string> = {
  foundation: 'Foundation',
  users: 'Users',
  product: 'Product',
  data: 'Data',
  integrations: 'Integrations',
  delivery: 'Delivery',
};

function optionSelected(value: unknown, optionId: string): boolean {
  return Array.isArray(value) ? value.includes(optionId) : value === optionId;
}

export default function ArchitectQuestionPanel({
  questions,
  answers,
  onChange,
}: ArchitectQuestionPanelProps) {
  const groups = questions.reduce<Record<string, ArchitectQuestion[]>>(
    (acc, question) => {
      acc[question.category] = [...(acc[question.category] ?? []), question];
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-5">
      {Object.entries(groups).map(([category, items]) => (
        <section
          key={category}
          className="rounded-2xl border border-slate-800/80 bg-slate-950/55 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.24)]"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-300/80">
            {CATEGORY_LABELS[category as ArchitectQuestion['category']]}
          </p>
          <div className="mt-4 space-y-5">
            {items.map((question) => {
              const value = answers[question.id];
              return (
                <div key={question.id} className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-100">
                    {question.label}
                  </label>
                  <p className="text-xs leading-5 text-slate-400">
                    {question.description}
                  </p>

                  {question.type === 'text' ? (
                    <input
                      value={typeof value === 'string' ? value : ''}
                      onChange={(event) =>
                        onChange(question.id, event.target.value as never)
                      }
                      placeholder={question.placeholder}
                      className="w-full rounded-xl border border-slate-700/80 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-300/80 focus:ring-2 focus:ring-emerald-300/15"
                    />
                  ) : null}

                  {question.type === 'textarea' ? (
                    <textarea
                      value={typeof value === 'string' ? value : ''}
                      onChange={(event) =>
                        onChange(question.id, event.target.value as never)
                      }
                      placeholder={question.placeholder}
                      className="min-h-28 w-full resize-y rounded-xl border border-slate-700/80 bg-slate-900/80 px-4 py-3 text-sm leading-6 text-slate-100 outline-none transition focus:border-emerald-300/80 focus:ring-2 focus:ring-emerald-300/15"
                    />
                  ) : null}

                  {question.type === 'boolean' ? (
                    <div className="grid grid-cols-2 gap-2">
                      {[true, false].map((option) => (
                        <button
                          key={String(option)}
                          type="button"
                          onClick={() => onChange(question.id, option as never)}
                          className={`rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] transition ${
                            value === option
                              ? 'border-emerald-300 bg-emerald-300 text-slate-950'
                              : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-emerald-300/70'
                          }`}
                        >
                          {option ? 'Yes' : 'No'}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {question.options &&
                  (question.type === 'select' || question.type === 'multiselect') ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {question.options.map((option) => {
                        const selected = optionSelected(value, option.id);
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                              if (question.type === 'multiselect') {
                                const current = Array.isArray(value) ? value : [];
                                const next = selected
                                  ? current.filter((item) => item !== option.id)
                                  : [...current, option.id];
                                onChange(question.id, next as never);
                              } else {
                                onChange(question.id, option.id as never);
                              }
                            }}
                            className={`rounded-xl border p-3 text-left transition ${
                              selected
                                ? 'border-emerald-300 bg-emerald-300/12 shadow-[0_0_24px_rgba(52,211,153,0.10)]'
                                : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
                            }`}
                          >
                            <span className="block text-sm font-semibold text-slate-100">
                              {option.label}
                            </span>
                            {option.description ? (
                              <span className="mt-1 block text-xs leading-5 text-slate-400">
                                {option.description}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
