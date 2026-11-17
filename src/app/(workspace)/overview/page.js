import { Suspense } from 'react';
import { ArrowUpRight, Columns3 } from 'lucide-react';
import StageBoard from '@/components/boards/StageBoard';
import { ActionButton, EmptyState, PageHeader } from '@/components/ui/primitives';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { requireActiveProfile } from '@/lib/auth';
import { getStageBoard, hasDatabaseConnection } from '@/lib/db';

export const metadata = { title: 'Home' };

async function OverviewContent() {
  const profile = await requireActiveProfile();
  const data = hasDatabaseConnection()
    ? await getStageBoard(profile)
    : { stages: [], cards: [], sectionMap: {} };

  return (
    <>
      <PageHeader
        eyebrow="Your workspace"
        title="Project stages"
        description="A live view of work across your boards. Find a ticket, follow its progress, or move it to the next stage."
        actions={<ActionButton href="/boards" variant="secondary">Explore boards <ArrowUpRight size={15} aria-hidden="true" /></ActionButton>}
      />
      {data.stages.length === 0 ? (
        <EmptyState
          icon={Columns3}
          title="No stages yet"
          description="Create a board and its stages (Planning, Development, QA…) will appear here."
          action={<ActionButton href="/boards">Open boards</ActionButton>}
        />
      ) : (
        <StageBoard stages={data.stages} cards={data.cards} sectionMap={data.sectionMap} isAdmin={profile.role === 'admin'} />
      )}
    </>
  );
}

export default function OverviewPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading stages" />}>
      <OverviewContent />
    </Suspense>
  );
}
