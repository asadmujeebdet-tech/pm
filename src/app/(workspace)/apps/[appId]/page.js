import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays, ExternalLink, ListChecks, PackageCheck } from 'lucide-react';
import AppIcon from '@/components/ui/AppIcon';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { EmptyState, Panel } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { requireActiveProfile } from '@/lib/auth';
import { getAppDetails, getAppDetailsActivity, hasDatabaseConnection } from '@/lib/db';
import { formatDate } from '@/lib/format';

async function AppDetailsPanels({ app, profile }) {
  const { ticket_count: ticketCount, status_distribution: statusDistribution, tickets, recent_activity: recentActivity } =
    await getAppDetailsActivity(app.id, profile);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
      <div className="space-y-6">
        <Panel title="Related tickets" subtitle={`${ticketCount} tickets across accessible projects`} tone="blue">
          {tickets.length === 0 ? (
            <EmptyState compact icon={ListChecks} title="No tickets yet" description="Tickets linked to this app will appear here." />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {tickets.map((ticket) => (
                <li key={ticket.id} className="py-3 first:pt-0 last:pb-0">
                  <Link href={`/tickets/${ticket.board_id}?ticketId=${ticket.id}`} className="surface-tint-blue flex min-w-0 items-center gap-3 rounded-xl border p-3">
                    <span className="shrink-0 font-mono text-xs font-bold text-[var(--primary)]">#{String(ticket.ticket_number).padStart(3, '0')}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--foreground)] hover:text-[var(--primary)]">{ticket.title}</span>
                    <span className="hidden shrink-0 text-xs text-[var(--muted)] sm:inline">{ticket.section_name}</span>
                    <StatusBadge status={ticket.priority} />
                  </Link>
                  <p className="mt-1 pl-11 text-xs text-[var(--muted)]">{ticket.board_name} · Updated {formatDate(ticket.updated_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent activity" subtitle="Recent comments and updates for this app" tone="purple">
          {recentActivity.length === 0 ? (
            <EmptyState compact icon={CalendarDays} title="No recent activity" description="Ticket discussions and release updates will appear here." />
          ) : (
            <ul className="space-y-3">
              {recentActivity.map((item) => item.activity_type === 'comment' ? (
                <li key={`comment-${item.id}`} className="surface-tint-purple rounded-xl border p-3">
                  <p className="text-sm text-[var(--foreground)]">
                    <span className="font-medium">{item.author_name}</span> commented on{' '}
                    <Link className="font-medium text-[var(--primary)] hover:underline" href={`/tickets/${item.board_id}?ticketId=${item.card_id}`}>
                      #{String(item.ticket_number).padStart(3, '0')} {item.ticket_title}
                    </Link>
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{item.content}</p>
                  <time className="mt-2 block text-[11px] text-[var(--muted)]">{formatDate(item.created_at)}</time>
                </li>
              ) : (
                <li key={`update-${item.id}`} className="surface-tint-green rounded-xl border p-3">
                  <p className="text-sm font-medium text-[var(--foreground)]">{item.title} · v{item.version_name}</p>
                  {item.description && <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{item.description}</p>}
                  <p className="mt-2 text-[11px] text-[var(--muted)]">
                    {item.status} · {formatDate(item.release_date || item.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel title="Tickets by status" tone="amber">
          {statusDistribution.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">There is no ticket status distribution yet.</p>
          ) : (
            <ul className="space-y-3">
              {statusDistribution.map((item) => (
                <li key={item.status} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-[var(--muted)]">{item.status}</span>
                  <span className="font-semibold tabular-nums text-[var(--foreground)]">{item.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Release information" tone="green">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-[var(--primary-soft)] p-2 text-[var(--primary)]"><PackageCheck size={17} aria-hidden="true" /></span>
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">{app.current_version_name || 'Version not set'}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Released {formatDate(app.latest_release_date, 'Date not set')}</p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

async function AppDetailsContent({ params }) {
  const { appId } = await params;
  const profile = await requireActiveProfile();
  const appDetails = hasDatabaseConnection() ? await getAppDetails(appId, profile) : null;
  if (!appDetails) notFound();
  const app = appDetails;

  const iconSource = app.icon_url || (app.icon_path ? `/api/apps/${app.id}/icon` : undefined);

  return (
    <>
      <div className="mb-6">
        <Link href="/apps" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]">
          <ArrowLeft size={15} aria-hidden="true" />
          Apps
        </Link>
      </div>

      <section className="card surface-tint-blue mb-6 flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-7">
        <AppIcon name={app.name} src={iconSource} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">{app.name}</h1>
            <StatusBadge status={app.status || 'active'} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[var(--muted)]">
            {app.app_url && (
              <a href={app.app_url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 truncate font-medium text-[var(--primary)] hover:underline">
                <ExternalLink size={14} aria-hidden="true" />
                {app.app_url}
              </a>
            )}
            {app.play_store_account && (
              <span>
                <strong className="font-semibold text-[var(--foreground)]">Developer Account:</strong>{' '}
                {app.play_store_account}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 border-t border-[var(--border)] pt-4 text-sm sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          <div>
            <p className="text-xs text-[var(--muted)]">Latest version</p>
            <p className="mt-1 font-semibold text-[var(--foreground)]">{app.current_version_name || 'Not set'}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--muted)]">Last release</p>
            <p className="mt-1 font-semibold text-[var(--foreground)]">{formatDate(app.latest_release_date, 'Not released')}</p>
          </div>
        </div>
      </section>

      <Suspense fallback={<PageSkeleton label="Loading project details" cards={2} rows={3} />}>
        <AppDetailsPanels app={app} profile={profile} />
      </Suspense>
    </>
  );
}

export default function AppDetailsPage({ params }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading app" />}>
      <AppDetailsContent params={params} />
    </Suspense>
  );
}
