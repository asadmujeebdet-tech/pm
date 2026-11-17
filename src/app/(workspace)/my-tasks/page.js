import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, ListChecks } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import AppIcon from '@/components/ui/AppIcon';
import { requireActiveProfile } from '@/lib/auth';
import { getMyTasks, hasDatabaseConnection } from '@/lib/db';
import { formatDate, stripHtmlText } from '@/lib/format';

export const metadata = { title: 'My Tasks' };

async function MyTasksContent() {
  const profile = await requireActiveProfile();
  const tasks = hasDatabaseConnection() ? await getMyTasks(profile.id) : [];

  return (
    <>
      <PageHeader
        eyebrow="Personal"
        title="My Tasks"
        description="A focused list of cards assigned to you across your workspace boards."
      />

      {!hasDatabaseConnection() ? (
        <div role="alert" className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-5 text-sm text-[var(--foreground)]">
          Configure <code className="rounded bg-[var(--neutral)] px-1 py-0.5 font-mono text-xs">DATABASE_URL</code> to load your tasks.
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No tasks assigned"
          description="When a teammate assigns a card to you, it will appear here with its board, list, and due date."
          action={<Link href="/boards" className="btn btn-secondary">Browse boards</Link>}
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {tasks.map((task, index) => (
            <li key={task.id} className="anim-pop" style={{ '--i': Math.min(index, 12) }}>
              <article className={`card lift surface-tint-${task.due_date && new Date(task.due_date) < new Date(new Date().setHours(0, 0, 0, 0)) ? 'red' : 'blue'} flex h-full flex-col p-5`}>
                <div className="flex items-start gap-3">
                  <AppIcon
                    name={task.app_name || task.title}
                    src={task.app_icon_url || (task.app_icon_path ? `/api/apps/${task.app_id}/icon` : undefined)}
                    size="lg"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-bold text-[var(--primary)]">#{String(task.ticket_number).padStart(3, '0')}</p>
                    <h2 className="mt-1 line-clamp-2 text-base font-semibold leading-6 text-[var(--foreground)]">{task.title}</h2>
                  </div>
                  {task.priority && <StatusBadge priority={task.priority} />}
                </div>
                <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-[var(--muted)]">{stripHtmlText(task.description) || 'No description'}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
                  {task.app_name && <span className="max-w-full truncate">{task.app_name}</span>}
                  <span className="truncate">{task.board_name} · {task.section_name}</span>
                  {task.due_date && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays size={14} aria-hidden="true" />
                      Due {formatDate(task.due_date)}
                    </span>
                  )}
                </div>
                <div className="mt-auto flex justify-end pt-4">
                  <Link href={`/boards/${task.board_id}?ticketId=${task.id}`} className="btn btn-secondary">
                    See more details
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function MyTasksPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading tasks" cards={0} rows={4} />}>
      <MyTasksContent />
    </Suspense>
  );
}
