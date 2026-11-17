import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ListChecks } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { requireActiveProfile } from '@/lib/auth';
import { getMyTasks, hasDatabaseConnection } from '@/lib/db';
import { formatDate, stripHtmlText } from '@/lib/format';

export const metadata = { title: 'My Tasks' };

async function MyTasksContent() {
  const profile = await requireActiveProfile();
  const tasks = hasDatabaseConnection() ? await getMyTasks(profile.id, profile.role) : [];

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
        <ul className="space-y-2.5">
          {tasks.map((task, index) => (
            <li key={task.id} className="anim-pop" style={{ '--i': Math.min(index, 12) }}>
              <Link
                href={`/boards/${task.board_id}?ticketId=${task.id}`}
                prefetch={true}
                className={`row-card surface-tint-${task.due_date && new Date(task.due_date) < new Date(new Date().setHours(0, 0, 0, 0)) ? 'red' : 'blue'} group flex-col !items-stretch gap-3 sm:flex-row sm:!items-center`}
                aria-label={`Open ticket ${task.title}`}
              >
                <div className="min-w-0 flex-1">
                  <h2 className="font-medium text-[var(--foreground)]">
                    <span className="mr-2 font-mono text-xs font-bold text-[var(--primary)]">#{String(task.ticket_number).padStart(3, '0')}</span>
                    {task.title}
                  </h2>
                  <p className="mt-1 truncate text-sm text-[var(--muted)]">{stripHtmlText(task.description) || 'No description'}</p>
                  <p className="mt-2 text-xs text-[var(--muted)]">{task.board_name} · {task.section_name}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                  <StatusBadge priority={task.priority} />
                  {task.due_date && <span className="text-xs text-[var(--muted)]">Due {formatDate(task.due_date)}</span>}
                  <ArrowUpRight size={17} aria-hidden="true" className="text-[var(--muted)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--primary)]" />
                </div>
              </Link>
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
