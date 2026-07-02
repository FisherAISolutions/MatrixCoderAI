import type { ReactNode } from 'react';
import type { BuildSuiteAppearance, BuildSuiteItem } from '@/lib/build-suite/types';

function MiniBars({ tone = 'emerald' }: { tone?: 'emerald' | 'cyan' | 'purple' | 'blue' | 'amber' }) {
  const color =
    tone === 'cyan'
      ? 'bg-cyan-300'
      : tone === 'purple'
        ? 'bg-fuchsia-300'
        : tone === 'blue'
          ? 'bg-blue-300'
          : tone === 'amber'
            ? 'bg-amber-300'
            : 'bg-emerald-300';

  return (
    <div className="grid gap-1.5">
      <span className={`h-1.5 w-10 rounded-full ${color}`} />
      <span className="h-1.5 w-16 rounded-full bg-white/18" />
      <span className="h-1.5 w-12 rounded-full bg-white/12" />
    </div>
  );
}

function PreviewFrame({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative mt-5 h-32 overflow-hidden border border-emerald-500/20 bg-black/35 p-3 shadow-inner ${className}`}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/55 to-transparent" />
      {children}
    </div>
  );
}

function AppearanceMockup({ appearance }: { appearance: BuildSuiteAppearance }) {
  const isLight = appearance === 'light';

  return (
    <PreviewFrame
      className={
        isLight
          ? 'border-slate-200 bg-slate-50 text-slate-950'
          : 'border-emerald-500/25 bg-slate-950 text-white'
      }
    >
      <div
        className={`mb-3 flex items-center justify-between border p-2 ${
          isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/5'
        }`}
      >
        <span
          className={`h-6 w-6 rounded-md ${isLight ? 'bg-blue-500' : 'bg-emerald-300'}`}
        />
        <div className="flex gap-1.5">
          <span className={`h-2 w-8 rounded-full ${isLight ? 'bg-slate-200' : 'bg-white/20'}`} />
          <span className={`h-2 w-8 rounded-full ${isLight ? 'bg-slate-200' : 'bg-white/20'}`} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={`h-12 border ${
              isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/5'
            }`}
          />
        ))}
      </div>
    </PreviewFrame>
  );
}

function PaletteMockup({ item }: { item: BuildSuiteItem }) {
  const id = item.id;
  const palette =
    id === 'light-saas-blue'
      ? ['bg-blue-500', 'bg-sky-200', 'bg-white', 'bg-slate-200']
      : id === 'light-emerald-office'
        ? ['bg-emerald-500', 'bg-teal-100', 'bg-white', 'bg-slate-200']
        : id === 'light-warm-product'
          ? ['bg-amber-400', 'bg-orange-100', 'bg-white', 'bg-stone-200']
          : id === 'dark-matrix-green'
            ? ['bg-emerald-300', 'bg-green-700', 'bg-black', 'bg-slate-900']
            : id === 'dark-slate-cyan'
              ? ['bg-cyan-300', 'bg-slate-700', 'bg-slate-950', 'bg-blue-950']
              : ['bg-lime-300', 'bg-fuchsia-500', 'bg-slate-950', 'bg-purple-950'];

  return (
    <PreviewFrame>
      <div className="grid h-full grid-cols-4 gap-2">
        {palette.map((color, index) => (
          <div key={`${color}-${index}`} className={`${color} border border-white/10`} />
        ))}
      </div>
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
        <MiniBars tone={item.category === 'Light' ? 'blue' : 'emerald'} />
        <span className="h-9 w-9 rounded-full border border-white/20 bg-white/10" />
      </div>
    </PreviewFrame>
  );
}

function StyleMockup({ item }: { item: BuildSuiteItem }) {
  const text = `${item.id} ${item.label} ${item.tags.join(' ')}`.toLowerCase();

  if (/glass/.test(text)) {
    return (
      <PreviewFrame className="bg-gradient-to-br from-cyan-500/15 via-white/5 to-fuchsia-500/15">
        <div className="mx-auto mt-2 h-20 w-4/5 border border-white/30 bg-white/15 shadow-[0_18px_50px_rgba(255,255,255,0.12)] backdrop-blur">
          <div className="m-3 h-2 w-16 rounded-full bg-white/60" />
          <div className="mx-3 mt-6 h-3 rounded-full bg-white/25" />
        </div>
      </PreviewFrame>
    );
  }

  if (/cyber|matrix/.test(text)) {
    return (
      <PreviewFrame className="bg-black">
        <div className="grid h-full grid-cols-4 gap-1 opacity-70">
          {[...Array(16)].map((_, index) => (
            <span key={index} className="border border-emerald-500/20 bg-emerald-400/5" />
          ))}
        </div>
        <div className="absolute left-5 top-5 h-16 w-28 border border-emerald-300 bg-emerald-300/10 shadow-[0_0_28px_rgba(52,211,153,0.2)]" />
      </PreviewFrame>
    );
  }

  if (/apple|editorial|mobile/.test(text)) {
    return (
      <PreviewFrame className="bg-slate-100">
        <div className="mx-auto h-full w-3/5 rounded-[24px] border border-slate-200 bg-white p-3 shadow-xl">
          <div className="h-5 w-20 rounded-full bg-slate-900" />
          <div className="mt-4 grid gap-2">
            <span className="h-3 rounded-full bg-slate-200" />
            <span className="h-3 w-4/5 rounded-full bg-slate-200" />
            <span className="mt-3 h-8 rounded-2xl bg-blue-500" />
          </div>
        </div>
      </PreviewFrame>
    );
  }

  if (/material/.test(text)) {
    return (
      <PreviewFrame className="bg-slate-100">
        <div className="grid h-full gap-2">
          <div className="h-8 rounded-md bg-blue-600 shadow-md" />
          <div className="grid grid-cols-2 gap-2">
            <span className="h-14 rounded-md bg-white shadow-md" />
            <span className="h-14 rounded-md bg-white shadow-md" />
          </div>
        </div>
      </PreviewFrame>
    );
  }

  if (/fluent/.test(text)) {
    return (
      <PreviewFrame className="bg-gradient-to-br from-slate-100 to-blue-100">
        <div className="grid h-full grid-cols-[44px_1fr] gap-2">
          <div className="rounded-lg bg-white/70 shadow-sm" />
          <div className="grid gap-2">
            <span className="rounded-lg bg-white/80 shadow-sm" />
            <span className="rounded-lg bg-blue-500/80 shadow-sm" />
          </div>
        </div>
      </PreviewFrame>
    );
  }

  return (
    <PreviewFrame>
      <div className="grid h-full grid-cols-[0.8fr_1.2fr] gap-2">
        <div className="border border-emerald-500/20 bg-emerald-400/10 p-2">
          <MiniBars />
        </div>
        <div className="grid gap-2">
          <span className="border border-white/10 bg-white/8" />
          <span className="border border-white/10 bg-white/8" />
          <span className="border border-white/10 bg-white/8" />
        </div>
      </div>
    </PreviewFrame>
  );
}

function LayoutMockup({ item }: { item: BuildSuiteItem }) {
  const text = `${item.id} ${item.label} ${item.tags.join(' ')}`.toLowerCase();

  if (/sidebar/.test(text)) {
    return (
      <PreviewFrame>
        <div className="grid h-full grid-cols-[44px_1fr] gap-2">
          <div className="grid gap-2 border border-emerald-500/20 bg-emerald-400/10 p-2">
            <span className="bg-emerald-300" />
            <span className="bg-white/20" />
            <span className="bg-white/20" />
          </div>
          <div className="grid gap-2">
            <span className="border border-white/10 bg-white/10" />
            <span className="border border-white/10 bg-white/10" />
          </div>
        </div>
      </PreviewFrame>
    );
  }

  if (/top|landing/.test(text)) {
    return (
      <PreviewFrame>
        <div className="grid h-full grid-rows-[28px_1fr] gap-2">
          <div className="flex items-center justify-between border border-emerald-500/20 bg-white/8 px-2">
            <span className="h-3 w-10 rounded-full bg-emerald-300" />
            <span className="h-3 w-24 rounded-full bg-white/20" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <span className="border border-white/10 bg-white/10" />
            <span className="border border-white/10 bg-emerald-400/10" />
          </div>
        </div>
      </PreviewFrame>
    );
  }

  if (/bottom|mobile|tabs/.test(text)) {
    return (
      <PreviewFrame>
        <div className="mx-auto grid h-full w-20 grid-rows-[1fr_18px] gap-2 rounded-2xl border border-white/20 bg-white/8 p-2">
          <div className="grid gap-1.5">
            <span className="rounded bg-emerald-300/50" />
            <span className="rounded bg-white/15" />
          </div>
          <div className="grid grid-cols-3 gap-1">
            <span className="rounded-full bg-emerald-300" />
            <span className="rounded-full bg-white/25" />
            <span className="rounded-full bg-white/25" />
          </div>
        </div>
      </PreviewFrame>
    );
  }

  if (/bento|dashboard/.test(text)) {
    return (
      <PreviewFrame>
        <div className="grid h-full grid-cols-3 grid-rows-2 gap-2">
          <span className="col-span-2 border border-white/10 bg-emerald-400/10" />
          <span className="border border-white/10 bg-white/10" />
          <span className="border border-white/10 bg-white/10" />
          <span className="col-span-2 border border-white/10 bg-cyan-400/10" />
        </div>
      </PreviewFrame>
    );
  }

  return (
    <PreviewFrame>
      <div className="grid h-full grid-cols-2 gap-3">
        <span className="border border-emerald-500/20 bg-emerald-400/10" />
        <span className="border border-white/10 bg-white/10" />
      </div>
    </PreviewFrame>
  );
}

function ComponentMockup({ item }: { item: BuildSuiteItem }) {
  const text = `${item.id} ${item.label} ${item.tags.join(' ')}`.toLowerCase();

  if (/table/.test(text)) {
    return (
      <PreviewFrame>
        <div className="grid gap-2">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="grid grid-cols-[1fr_48px_32px] gap-2">
              <span className="h-4 rounded bg-white/12" />
              <span className="h-4 rounded bg-emerald-300/35" />
              <span className="h-4 rounded bg-white/18" />
            </div>
          ))}
        </div>
      </PreviewFrame>
    );
  }

  if (/chart|metric/.test(text)) {
    return (
      <PreviewFrame>
        <div className="flex h-full items-end gap-2">
          {[42, 70, 52, 88, 62, 96].map((height, index) => (
            <span
              key={height + index}
              className="flex-1 rounded-t bg-gradient-to-t from-emerald-500 to-cyan-300"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </PreviewFrame>
    );
  }

  if (/form|crud/.test(text)) {
    return (
      <PreviewFrame>
        <div className="grid gap-2">
          <span className="h-5 rounded bg-white/10" />
          <span className="h-5 rounded bg-white/10" />
          <span className="h-12 rounded bg-white/10" />
          <span className="h-7 w-24 rounded bg-emerald-300" />
        </div>
      </PreviewFrame>
    );
  }

  if (/calendar|schedule/.test(text)) {
    return (
      <PreviewFrame>
        <div className="grid h-full grid-cols-7 gap-1">
          {[...Array(21)].map((_, index) => (
            <span
              key={index}
              className={`rounded-sm ${index % 5 === 0 ? 'bg-emerald-300' : 'bg-white/12'}`}
            />
          ))}
        </div>
      </PreviewFrame>
    );
  }

  if (/kanban/.test(text)) {
    return (
      <PreviewFrame>
        <div className="grid h-full grid-cols-3 gap-2">
          {[0, 1, 2].map((column) => (
            <div key={column} className="grid content-start gap-1.5 border border-white/10 bg-white/5 p-1.5">
              <span className="h-2 rounded bg-emerald-300/70" />
              <span className="h-6 rounded bg-white/12" />
              <span className="h-6 rounded bg-white/12" />
            </div>
          ))}
        </div>
      </PreviewFrame>
    );
  }

  if (/notification/.test(text)) {
    return (
      <PreviewFrame>
        <div className="grid gap-2">
          {[0, 1, 2].map((itemIndex) => (
            <div key={itemIndex} className="flex items-center gap-2 border border-white/10 bg-white/8 p-2">
              <span className="h-5 w-5 rounded-full bg-emerald-300" />
              <span className="h-3 flex-1 rounded bg-white/20" />
            </div>
          ))}
        </div>
      </PreviewFrame>
    );
  }

  return (
    <PreviewFrame>
      <div className="grid h-full grid-cols-2 gap-2">
        <span className="border border-white/10 bg-white/10" />
        <span className="border border-white/10 bg-emerald-400/10" />
        <span className="col-span-2 border border-white/10 bg-cyan-400/10" />
      </div>
    </PreviewFrame>
  );
}

function AppTypeMockup({ item }: { item: BuildSuiteItem }) {
  return (
    <PreviewFrame>
      <div className="grid h-full grid-cols-[1.1fr_0.9fr] gap-3">
        <div className="grid gap-2">
          <MiniBars tone={item.id.includes('expense') ? 'amber' : 'emerald'} />
          <div className="grid grid-cols-2 gap-2">
            <span className="h-10 border border-white/10 bg-white/10" />
            <span className="h-10 border border-white/10 bg-emerald-400/10" />
          </div>
        </div>
        <div className="grid gap-2">
          <span className="border border-white/10 bg-white/8" />
          <span className="border border-white/10 bg-cyan-400/10" />
          <span className="border border-white/10 bg-white/8" />
        </div>
      </div>
    </PreviewFrame>
  );
}

function UtilityMockup({ item }: { item: BuildSuiteItem }) {
  const text = `${item.id} ${item.label} ${item.tags.join(' ')}`.toLowerCase();

  if (/ai|assistant|search|draft/.test(text)) {
    return (
      <PreviewFrame>
        <div className="grid h-full grid-cols-[38px_1fr] gap-3">
          <span className="grid place-items-center rounded-full border border-emerald-300 bg-emerald-300/15 text-xs text-emerald-100">
            AI
          </span>
          <div className="grid gap-2">
            <span className="h-4 rounded bg-white/18" />
            <span className="h-4 rounded bg-white/12" />
            <span className="h-8 rounded border border-emerald-300/40 bg-emerald-300/10" />
          </div>
        </div>
      </PreviewFrame>
    );
  }

  if (/integration|storage|api|auth|csv/.test(text)) {
    return (
      <PreviewFrame>
        <div className="flex h-full items-center justify-center gap-3">
          <span className="h-12 w-12 border border-emerald-300 bg-emerald-300/15" />
          <span className="h-px w-12 bg-emerald-300" />
          <span className="h-12 w-12 border border-cyan-300 bg-cyan-300/15" />
        </div>
      </PreviewFrame>
    );
  }

  if (/animation|motion|transition/.test(text)) {
    return (
      <PreviewFrame>
        <div className="relative h-full">
          <span className="absolute left-2 top-3 h-12 w-12 rounded-full bg-emerald-300/30 blur-sm" />
          <span className="absolute left-11 top-8 h-12 w-12 rounded-full bg-cyan-300/40" />
          <span className="absolute bottom-4 right-3 h-8 w-24 rounded-full bg-white/12" />
        </div>
      </PreviewFrame>
    );
  }

  return (
    <PreviewFrame>
      <div className="mx-auto h-full w-20 rounded-[24px] border border-white/20 bg-white/8 p-2">
        <div className="grid h-full grid-rows-[1fr_18px] gap-2">
          <span className="rounded-xl bg-emerald-300/35" />
          <span className="rounded-full bg-white/20" />
        </div>
      </div>
    </PreviewFrame>
  );
}

export function BuildSuiteCardPreview({ item }: { item: BuildSuiteItem }) {
  const text = `${item.id} ${item.category} ${item.tags.join(' ')}`.toLowerCase();

  if (/light|dark|matrix|slate|emerald|purple|palette/.test(text)) {
    return <PaletteMockup item={item} />;
  }

  if (/style|saas|editorial|operational|glass|cyber|apple|material|fluent/.test(text)) {
    return <StyleMockup item={item} />;
  }

  if (/layout|nav|sidebar|split|tabs|bento|landing/.test(text)) {
    return <LayoutMockup item={item} />;
  }

  if (/component|table|form|chart|calendar|kanban|notification|crud/.test(text)) {
    return <ComponentMockup item={item} />;
  }

  if (/ai|integration|storage|api|auth|csv|animation|motion|mobile|capacitor/.test(text)) {
    return <UtilityMockup item={item} />;
  }

  return <AppTypeMockup item={item} />;
}

export function BuildSuiteAppearancePreview({
  appearance,
}: {
  appearance: BuildSuiteAppearance;
}) {
  return <AppearanceMockup appearance={appearance} />;
}
