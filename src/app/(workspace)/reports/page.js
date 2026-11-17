import { Suspense } from 'react';
import Link from 'next/link';
import { EmptyState, PageHeader, Panel, StatCard } from '@/components/ui/primitives';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { requireActiveProfile } from '@/lib/auth';
import { getReportBoards, getReportCards, hasDatabaseConnection } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { buildReport } from '@/lib/reports';

export const metadata = { title: 'Reports' };

const priorityColor = { critical: 'bg-rose-500', high: 'bg-orange-500', medium: 'bg-amber-400', low: 'bg-emerald-500' };

function Bar({ value, max, className = 'bg-[var(--primary)]' }) {
  const pct = max > 0 ? Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--neutral)]" role="presentation">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

async function ReportsContent() {
  const profile = await requireActiveProfile();
  const connected = hasDatabaseConnection();
  const [cards, boards] = connected ? await Promise.all([getReportCards(profile), getReportBoards(profile)]) : [[], []];
  const r = buildReport(cards, boards);
  const maxPipeline = Math.max(0, ...r.pipeline.map((p) => p.count));
  const maxLoad = Math.max(0, ...r.workload.map((p) => p.open));
  const openByPriority = r.priority.reduce((n, p) => n + p.count, 0);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Delivery status, workload and risk across every board. Lists named Completed, Done, Closed or Released count as finished."
        actions={<a href="/api/reports/export" className="btn btn-secondary">Export CSV</a>}
      />

      {cards.length === 0 ? (
        <EmptyState title="Nothing to report yet" description="Create a board and add tasks. Delivery, workload and risk figures will appear here." />
      ) : (
        <div className="space-y-6">
          <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Open tasks" value={r.totals.open} hint={`${r.totals.all} in total`} tone="blue" />
            <StatCard label="Completed" value={r.totals.done} hint={`${r.totals.completion}% completion`} tone="green" />
            <StatCard label="Overdue" value={r.totals.overdue} hint="Past due, not completed" tone={r.totals.overdue ? 'red' : 'green'} />
            <StatCard label="Due in 7 days" value={r.totals.dueSoon} hint="Needs a plan this week" tone="amber" />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Pipeline" subtitle="Tasks per list, across all boards" tone="blue">
              <ul className="space-y-3">
                {r.pipeline.map((p) => (
                  <li key={p.name} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-4 text-sm">
                    <span className="truncate">{p.name}</span>
                    <Bar value={p.count} max={maxPipeline} />
                    <span className="text-right tabular-nums">{p.count}</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Open work by priority" subtitle="Excludes completed tasks" tone="amber">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--neutral)]" role="img" aria-label="Open work by priority">
                {r.priority.map((p) => p.count > 0 && (
                  <div key={p.name} className={priorityColor[p.name]} style={{ width: `${(p.count / openByPriority) * 100}%` }} />
                ))}
              </div>
              <ul className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                {r.priority.map((p) => (
                  <li key={p.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 capitalize text-[var(--muted)]">
                      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${priorityColor[p.name]}`} />
                      {p.name}
                    </span>
                    <span className="tabular-nums">{p.count}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <Panel title="Board progress" subtitle="Completion and risk per board" tone="green" className="overflow-hidden !p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-y border-[var(--border)] bg-[var(--neutral)] text-left text-xs text-[var(--muted)]">
                    <th className="px-5 py-2.5 font-medium">Board</th>
                    <th className="px-3 py-2.5 font-medium">Progress</th>
                    <th className="px-3 py-2.5 text-right font-medium">Tasks</th>
                    <th className="px-3 py-2.5 text-right font-medium">Done</th>
                    <th className="px-3 py-2.5 text-right font-medium">Overdue</th>
                    <th className="px-5 py-2.5 font-medium">Last activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {r.boards.map((b) => (
                    <tr key={b.id} className="hover:bg-[var(--neutral)]">
                      <td className="px-5 py-3">
                        <Link href={`/boards/${b.id}`} className="font-medium hover:text-[var(--primary)]">{b.name}</Link>
                        {b.app_name && <p className="text-xs text-[var(--muted)]">{b.app_name}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-28"><Bar value={b.progress} max={100} /></div>
                          <span className="w-9 text-xs tabular-nums text-[var(--muted)]">{b.progress}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{b.total}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{b.done}</td>
                      <td className={`px-3 py-3 text-right tabular-nums ${b.overdue ? 'text-[var(--danger)]' : 'text-[var(--muted)]'}`}>{b.overdue}</td>
                      <td className="px-5 py-3 text-[var(--muted)]">{b.last ? formatDate(new Date(b.last)) : 'No activity'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Panel title="Team workload" subtitle="Open tasks per person" tone="purple">
              {r.workload.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No open tasks are assigned.</p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {r.workload.map((p) => (
                    <li key={p.name} className="grid grid-cols-[1fr_8rem_2rem] items-center gap-4 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {p.overdue > 0 && <span className="text-[var(--danger)]">{p.overdue} overdue</span>}
                          {p.overdue > 0 && ' · '}
                          {p.high} high priority
                        </p>
                      </div>
                      <Bar value={p.open} max={maxLoad} />
                      <span className="text-right text-sm tabular-nums">{p.open}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Needs attention" subtitle="Oldest overdue tasks first" tone="red">
              {r.attention.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Nothing is overdue.</p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {r.attention.map((t) => (
                    <li key={t.id} className="surface-tint-red flex items-start justify-between gap-4 rounded-lg border p-3">
                      <div className="min-w-0">
                        <Link href={`/boards/${t.board_id}?ticketId=${t.id}`} className="block truncate text-sm font-medium hover:text-[var(--primary)]">
                          <span className="mr-1.5 font-mono text-[11px] text-[var(--muted)]">#{String(t.ticket_number || 0).padStart(3, '0')}</span>
                          {t.title}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                          {t.board_name} · {t.section_name}{t.assignees?.length ? ` · ${t.assignees.join(', ')}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="text-xs text-[var(--danger)]">{formatDate(t.due_date)}</span>
                        <StatusBadge status={t.priority} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading reports" />}>
      <ReportsContent />
    </Suspense>
  );
}
