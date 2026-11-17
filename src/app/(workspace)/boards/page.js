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
                <div
                  className={`group relative flex min-h-44 w-full flex-col overflow-hidden rounded-xl border border-white/10 p-5 text-white shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-pop)] ${
                    ['bg-gradient-to-br from-indigo-600 to-violet-800', 'bg-gradient-to-br from-cyan-600 to-blue-800', 'bg-gradient-to-br from-emerald-600 to-teal-800'][index % 3]
                  }`}
                >
                  <Link href={`/boards/${board.id}`} aria-label={`Open ${board.name}`} className="absolute inset-0 z-0 rounded-xl focus-visible:outline-white" />
                  <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full border-[24px] border-white/10 transition-transform duration-500 group-hover:scale-110" />
                  <div className="pointer-events-none relative">
                    <h2 className="truncate text-lg font-semibold">{board.name}</h2>
                    <p className="mt-1 truncate text-xs text-white/75">{board.app_name || 'No application'}</p>
                    {board.description && <p className="mt-2 line-clamp-2 text-sm text-white/80">{board.description}</p>}
                  </div>
                  <div className="relative z-10 mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-white/80">
                    {profile.role === 'admin' ? <BoardAdminActions board={board} apps={apps} /> : <span>{board.card_count} {board.card_count === 1 ? 'task' : 'tasks'}</span>}
                    <ArrowRight size={15} className="pointer-events-none shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </div>
                </div>
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
