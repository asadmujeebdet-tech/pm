import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import BoardWorkspace from '@/components/boards/BoardWorkspace';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { requireActiveProfile } from '@/lib/auth';
import { getBoardData } from '@/lib/db';

async function BoardContent({ params, searchParams }) {
  const [{ boardId }, query] = await Promise.all([params, searchParams]);
  const profile = await requireActiveProfile();
  const board = await getBoardData(boardId, profile);
  if (!board) notFound();
  const initialCardId = typeof query.ticketId === 'string' ? query.ticketId : null;
  const revision = JSON.stringify([
    board.updated_at,
    board.sections.map(({ id, title, position, updated_at }) => [id, title, position, updated_at]),
    board.cards.map(({ id, title, section_id, position, updated_at, comment_count }) => [
      id,
      title,
      section_id,
      position,
      updated_at,
      comment_count,
    ]),
    board.board_members.map(({ profile_id, role }) => [profile_id, role]),
  ]);

  return <BoardWorkspace key={revision} initialBoard={board} initialCardId={initialCardId} />;
}

export default function BoardPage({ params, searchParams }) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading board" cards={3} rows={2} />}>
      <BoardContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
