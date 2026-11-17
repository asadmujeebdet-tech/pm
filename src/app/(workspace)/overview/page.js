import { Suspense } from 'react';
import Link from 'next/link';
import { BriefcaseBusiness, ListChecks } from 'lucide-react';
import AppIcon from '@/components/ui/AppIcon';
import { ActionButton, EmptyState, PageHeader, Panel, StatCard } from '@/components/ui/primitives';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { requireActiveProfile } from '@/lib/auth';
import { getMyTasks, getOverviewStats, getRecentAppActivity, hasDatabaseConnection } from '@/lib/db';
import { formatDate } from '@/lib/format';

export const metadata = { title: 'Overview' };

async function OverviewContent() {
  const profile = await requireActiveProfile();
  const isConnected = hasDatabaseConnection();
  const statsData = isConnected ? await getOverviewStats(profile) : { totalApps: 0, activeApps: 0, totalMembers: 0, totalTasks: 0 };
  const recentApps = isConnected ? await getRecentAppActivity(profile) : [];
  const myTasks = isConnected ? await getMyTasks(profile.id, profile.role) : [];

  const totalApps = Number(statsData.totalApps) || 0;
  const activeApps = Number(statsData.activeApps) || 0;
  const activeShare = totalApps > 0 ? Math.round((activeApps / totalApps) * 100) : 0;
  const firstName = String(profile.full_name || '').trim().split(/\s+/)[0];

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const soon = new Date(today); soon.setDate(soon.getDate() + 7);
  const dueOf = (t) => (t.due_date ? new Date(t.due_date) : null);
  const overdue = myTasks.filter((t) => dueOf(t) && dueOf(t) < today);
  const dueSoon = myTasks.filter((t) => dueOf(t) && dueOf(t) >= today && dueOf(t) <= soon);

  const stats = [
    { label: 'Apps in portfolio', value: totalApps, tone: 'blue', hint: totalApps === 0 ? 'Add your first app to get started' : `${activeApps} active · ${activeShare}% of portfolio` },
    { label: 'Team members', value: statsData.totalMembers, tone: 'purple', hint: 'With workspace access' },
    { label: 'Open tasks', value: statsData.totalTasks, tone: 'amber', hint: 'Across all boards' },
    { label: 'My overdue', value: overdue.length, tone: overdue.length ? 'red' : 'green', hint: `${dueSoon.length} due in the next 7 days` },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
        description="Department status at a glance: portfolio health, workload, and what needs attention this week."
        actions={
          <>
            {profile.role === 'admin' && (
              <ActionButton href="/apps">
                Add app
              </ActionButton>
            )}
            <ActionButton href="/boards" variant="secondary">Open boards</ActionButton>
          </>
        }
      />

      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <Panel
          title="Release activity"
          subtitle="Most recently updated apps"
          tone="green"
          action={recentApps.length > 0 ? <Link href="/apps" className="text-sm font-medium text-[var(--primary)] hover:underline">View all</Link> : null}
        >
          {recentApps.length === 0 ? (
            <EmptyState
              compact
              icon={BriefcaseBusiness}
              title="No app updates yet"
              description="Create your first app and its release activity will show up here."
            />
          ) : (
            <ul className="space-y-2.5">
              {recentApps.map((app, index) => (
                <li key={app.id} className="anim-pop" style={{ '--i': index }}>
                  <Link href={`/apps/${app.id}`} className={`row-card surface-tint-${app.status === 'active' ? 'green' : 'amber'}`}>
                    <AppIcon name={app.name} src={app.icon_url || (app.icon_path ? `/api/apps/${app.id}/icon` : undefined)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[var(--foreground)]">{app.name}</p>
                      <p className="mt-0.5 truncate text-sm text-[var(--muted)]">{app.current_version_name ? `v${String(app.current_version_name).replace(/^v/i, '')}` : 'No version set'}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <StatusBadge status={app.status || 'active'} />
                      <span className="text-xs text-[var(--muted)]">{formatDate(app.latest_release_date, 'No release date')}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Needs your attention"
          subtitle="Your tasks, soonest due first"
          tone={overdue.length > 0 ? 'red' : 'amber'}
          action={myTasks.length > 0 ? <Link href="/my-tasks" className="text-sm font-medium text-[var(--primary)] hover:underline">View all</Link> : null}
        >
          {myTasks.length === 0 ? (
            <EmptyState
              compact
              icon={ListChecks}
              title="No tasks assigned"
              description="Tasks appear here once you are assigned work on a board."
              action={<ActionButton href="/boards" variant="secondary">Open boards</ActionButton>}
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {[...myTasks].sort((a, b) => (dueOf(a)?.getTime() ?? Infinity) - (dueOf(b)?.getTime() ?? Infinity)).slice(0, 6).map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/boards/${task.board_id}?ticketId=${task.id}`}
                    className={`row-card surface-tint-${dueOf(task) && dueOf(task) < today ? 'red' : dueOf(task) && dueOf(task) <= soon ? 'amber' : 'blue'} justify-between`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--foreground)] hover:text-[var(--primary)]">
                        <span className="mr-1.5 font-mono text-[10px] font-bold text-[var(--primary)]">#{String(task.ticket_number).padStart(3, '0')}</span>
                        {task.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{task.board_name} · {task.section_name}</p>
                    </div>
                    {task.due_date && (
                      <span className={`shrink-0 text-xs ${dueOf(task) < today ? 'font-medium text-[var(--danger)]' : 'text-[var(--muted)]'}`}>
                        {dueOf(task) < today ? 'Overdue · ' : 'Due '}{formatDate(task.due_date)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

export default function OverviewPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading overview" />}>
      <OverviewContent />
    </Suspense>
  );
}
