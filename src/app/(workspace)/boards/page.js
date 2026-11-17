import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight, KanbanSquare } from 'lucide-react';
import BoardAdminActions from '@/components/boards/BoardAdminActions';
import FilterGrid from '@/components/ui/FilterGrid';
import CreateBoardForm from '@/components/boards/CreateBoardForm';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { requireActiveProfile } from '@/lib/auth';
import { getApps, getBoards, hasDatabaseConnection } from '@/lib/db';

export const metadata = { title: 'Boards' };

async function BoardsContent() {
  const profile = await requireActiveProfile();
  const databaseConfigured = hasDatabaseConnection();
  const boards = databaseConfigured ? await getBoards(profile) : [];
  const apps = databaseConfigured ? await getApps(profile) : [];

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Boards"
        description="Plan work together, keep tasks moving, and see every project at a glance."
        actions={databaseConfigured ? <CreateBoardForm apps={apps} /> : null}
      />

      {!databaseConfigured ? (
        <div role="alert" className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-5 text-sm text-[var(--foreground)]">
          Configure <code className="rounded bg-[var(--neutral)] px-1 py-0.5 font-mono text-xs">DATABASE_URL</code> to load and create boards.
        </div>
      ) : boards.length === 0 ? (
        <EmptyState
          icon={KanbanSquare}
          title="Start with your first board"
          description="Create a board for a project or team. It will include starter lists, and you can customize the workflow as you go."
        />
      ) : (
        <section aria-label="Your boards">
          <FilterGrid
            placeholder="Search boards…"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 [&>li]:flex"
            emptyText="No boards match your search."
            items={boards.map((board, index) => ({
              id: board.id,
              search: `${board.name} ${board.app_name || ''} ${board.description || ''}`,
              group: 'all',
              node: (
                <article className="board-index-card group relative flex min-h-48 w-full flex-col overflow-hidden rounded-2xl border bg-[var(--surface)] p-5 transition duration-200" style={{ '--board-accent': ['#4f63df', '#1c9a82', '#c47c35', '#8060c7'][index % 4] }}>
                  <Link href={`/boards/${board.id}`} aria-label={`Open ${board.name}`} className="absolute inset-0 z-[1] rounded-2xl focus-visible:outline-[var(--primary)]" />
                  <div className="pointer-events-none relative z-0 flex items-center justify-between">
                    <span className="board-index-mark"><KanbanSquare size={17} aria-hidden="true" /></span>
                    <span className="board-index-label">Board</span>
                  </div>
                  <div className="pointer-events-none relative mt-5">
                    <h2 className="truncate text-base font-semibold text-[var(--foreground)]">{board.name}</h2>
                    <p className="mt-1 truncate text-sm text-[var(--muted)]">{board.app_name || 'Workspace board'}</p>
                    {board.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{board.description}</p>}
                  </div>
                  <div className="relative z-10 mt-auto flex items-center justify-between gap-2 border-t border-[var(--border)] pt-4">
                    <span className="text-xs font-medium text-[var(--muted)]">{board.card_count} {board.card_count === 1 ? 'task' : 'tasks'}</span>
                    <span className="flex items-center gap-2">
                      {profile.role === 'admin' && <BoardAdminActions board={board} apps={apps} />}
                      <ArrowRight size={16} className="pointer-events-none shrink-0 text-[var(--muted)] transition-transform group-hover:translate-x-1 group-hover:text-[var(--primary)]" aria-hidden="true" />
                    </span>
                  </div>
                </article>
              ),
            }))}
          />
        </section>
      )}
    </>
  );
}

export default function BoardsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading boards" cards={3} rows={2} />}>
      <BoardsContent />
    </Suspense>
  );
}
