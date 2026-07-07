import type { BuildSuiteSelection } from '../types';
import { buildBuildSuitePreviewModel } from './model';
import type { BuildSuitePreviewModel } from './types';

interface BuildSuiteLivePreviewPanelProps {
  selection: BuildSuiteSelection;
}

function classNames(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function MiniMetricCards({ model }: { model: BuildSuitePreviewModel }) {
  const { classes } = model;
  return (
    <div className="grid grid-cols-3 gap-2">
      {['Users', 'Revenue', 'Tasks'].map((label, index) => (
        <div
          key={label}
          className={classNames(
            'rounded-lg border p-3',
            classes.panel,
            classes.border
          )}
        >
          <div className={classNames('text-[10px] uppercase tracking-[0.18em]', classes.mutedText)}>
            {label}
          </div>
          <div className={classNames('mt-2 text-xl font-bold', classes.text)}>
            {index === 0 ? '2.4k' : index === 1 ? '$18k' : '86%'}
          </div>
          <div className={classNames('mt-2 h-1 rounded-full', classes.accent)} />
        </div>
      ))}
    </div>
  );
}

function MiniCharts({ model }: { model: BuildSuitePreviewModel }) {
  const { classes } = model;
  return (
    <div className={classNames('rounded-xl border p-4', classes.panel, classes.border)}>
      <div className="flex items-center justify-between">
        <span className={classNames('text-xs font-semibold', classes.text)}>Live analytics</span>
        <span className={classNames('rounded-full border px-2 py-1 text-[10px]', classes.softAccent)}>
          Chart
        </span>
      </div>
      <div className="mt-4 flex h-24 items-end gap-2">
        {[44, 68, 38, 80, 56, 92, 72].map((height, index) => (
          <div
            key={`${height}-${index}`}
            className="flex-1 rounded-t-md bg-current opacity-80"
            style={{ height: `${height}%` }}
          >
            <div className={classNames('h-full rounded-t-md', classes.accent)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniTable({ model }: { model: BuildSuitePreviewModel }) {
  const { classes } = model;
  return (
    <div className={classNames('rounded-xl border p-4', classes.panel, classes.border)}>
      <div className={classNames('text-xs font-semibold', classes.text)}>Data table</div>
      <div className="mt-3 space-y-2">
        {['Atlas Corp', 'Northstar', 'River Studio'].map((row, index) => (
          <div
            key={row}
            className={classNames(
              'grid grid-cols-[1fr_auto] rounded-lg border px-3 py-2 text-xs',
              classes.border,
              model.appearance === 'dark' ? 'bg-black/20' : 'bg-slate-50'
            )}
          >
            <span className={classes.text}>{row}</span>
            <span className={classes.mutedText}>{index === 0 ? 'Active' : 'Review'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniForm({ model }: { model: BuildSuitePreviewModel }) {
  const { classes } = model;
  return (
    <div className={classNames('rounded-xl border p-4', classes.panel, classes.border)}>
      <div className={classNames('text-xs font-semibold', classes.text)}>Smart form</div>
      <div className="mt-3 space-y-2">
        <div className={classNames('h-9 rounded-lg border', classes.border, model.appearance === 'dark' ? 'bg-slate-950/60' : 'bg-white')} />
        <div className={classNames('h-9 rounded-lg border', classes.border, model.appearance === 'dark' ? 'bg-slate-950/60' : 'bg-white')} />
        <button className={classNames('h-9 w-full rounded-lg text-xs font-bold', classes.button)}>
          Save record
        </button>
      </div>
    </div>
  );
}

function MiniSpecialWidgets({ model }: { model: BuildSuitePreviewModel }) {
  const { classes, widgets } = model;
  const items = [
    widgets.notifications ? ['Notifications', '3 alerts ready'] : undefined,
    widgets.aiPanel ? ['AI Assistant', 'Suggested next action'] : undefined,
    widgets.stripeCard ? ['Subscription', 'Plan checkout ready'] : undefined,
    widgets.databaseStatus ? ['Database', 'Sync layer connected'] : undefined,
    widgets.calendar ? ['Calendar', '4 events today'] : undefined,
    widgets.kanban ? ['Kanban', '12 cards moving'] : undefined,
  ].filter((item): item is string[] => Boolean(item));

  if (!items.length) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map(([title, detail]) => (
        <div
          key={title}
          className={classNames('rounded-xl border p-3', classes.panel, classes.border)}
        >
          <div className={classNames('text-xs font-semibold', classes.text)}>{title}</div>
          <div className={classNames('mt-1 text-[11px]', classes.mutedText)}>{detail}</div>
        </div>
      ))}
    </div>
  );
}

function PreviewNav({ model }: { model: BuildSuitePreviewModel }) {
  const { classes } = model;
  const navItems = ['Home', 'Data', 'Insights'];
  return (
    <div
      className={classNames(
        'flex items-center justify-between rounded-xl border p-3',
        classes.elevatedPanel
      )}
    >
      <div>
        <div className={classNames('text-sm font-bold', classes.text)}>
          {model.appTitle}
        </div>
        <div className={classNames('text-[11px]', classes.mutedText)}>
          {model.layoutLabel}
        </div>
      </div>
      <div className="hidden gap-2 sm:flex">
        {navItems.map((item) => (
          <span
            key={item}
            className={classNames(
              'rounded-full px-3 py-1 text-[11px]',
              item === 'Home' ? classes.button : classes.softAccent
            )}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function PreviewSidebar({ model }: { model: BuildSuitePreviewModel }) {
  const { classes } = model;
  return (
    <aside className={classNames('hidden rounded-xl border p-3 lg:block', classes.panel, classes.border)}>
      <div className={classNames('text-xs font-bold uppercase tracking-[0.22em]', classes.accentText)}>
        Menu
      </div>
      <div className="mt-4 space-y-2">
        {['Overview', 'Records', 'Settings'].map((item, index) => (
          <div
            key={item}
            className={classNames(
              'rounded-lg px-3 py-2 text-xs',
              index === 0 ? classes.button : classes.softAccent
            )}
          >
            {item}
          </div>
        ))}
      </div>
    </aside>
  );
}

function PreviewBody({ model }: { model: BuildSuitePreviewModel }) {
  const { classes, widgets } = model;
  return (
    <div className="space-y-3">
      <section className={classNames('rounded-2xl border p-5', classes.elevatedPanel)}>
        <div className={classNames('text-[10px] uppercase tracking-[0.28em]', classes.accentText)}>
          Live mock app
        </div>
        <h3 className={classNames('mt-3 text-2xl font-black tracking-normal', classes.text)}>
          {model.appTitle}
        </h3>
        <p className={classNames('mt-2 text-xs leading-5', classes.mutedText)}>
          {model.styleLabel} with {model.paletteLabel}. This preview updates from the selected marketplace metadata.
        </p>
        <div className="mt-4 flex gap-2">
          <button className={classNames('rounded-full px-4 py-2 text-xs font-bold', classes.button)}>
            Primary action
          </button>
          <button className={classNames('rounded-full border px-4 py-2 text-xs', classes.softAccent)}>
            Details
          </button>
        </div>
      </section>

      {widgets.cards ? <MiniMetricCards model={model} /> : null}

      <div className={classNames('grid gap-3', model.navigation === 'bento' ? 'sm:grid-cols-2' : '')}>
        {widgets.charts ? <MiniCharts model={model} /> : null}
        {widgets.tables ? <MiniTable model={model} /> : null}
        {widgets.forms ? <MiniForm model={model} /> : null}
      </div>

      <MiniSpecialWidgets model={model} />
    </div>
  );
}

export function BuildSuiteLivePreviewPanel({
  selection,
}: BuildSuiteLivePreviewPanelProps) {
  const model = buildBuildSuitePreviewModel(selection);
  const { classes } = model;

  return (
    <aside className="lg:sticky lg:top-5 lg:self-start">
      <div className="border border-emerald-500/25 bg-black/35 p-4 shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-emerald-300">
              Live Preview
            </p>
            <p className="mt-2 text-xs text-emerald-50/60">
              Mock app, generated locally from selections.
            </p>
          </div>
          <span className="border border-emerald-500/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-200">
            Instant
          </span>
        </div>

        <div
          className={classNames(
            'mt-4 overflow-hidden rounded-2xl border p-3',
            classes.frame,
            model.styleFlags.neon ? 'border-cyan-300/60' : 'border-white/10'
          )}
        >
          <div className={classNames('rounded-xl p-3', classes.surface)}>
            {model.navigation === 'sidebar' ? (
              <div className="grid gap-3 lg:grid-cols-[96px_1fr]">
                <PreviewSidebar model={model} />
                <PreviewBody model={model} />
              </div>
            ) : (
              <div className="space-y-3">
                <PreviewNav model={model} />
                <PreviewBody model={model} />
                {model.navigation === 'bottom' ? (
                  <div className={classNames('grid grid-cols-3 rounded-xl border p-2', classes.panel, classes.border)}>
                    {['Home', 'Add', 'AI'].map((item, index) => (
                      <div
                        key={item}
                        className={classNames(
                          'rounded-lg py-2 text-center text-[11px]',
                          index === 1 ? classes.button : classes.mutedText
                        )}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
