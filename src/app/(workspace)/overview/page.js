import { Suspense } from 'react';
import { Columns3 } from 'lucide-react';
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
        eyebrow="Home"
        title="Project stages"
        description="Every ticket by stage, with the time it has spent in each one. Drag a ticket to another stage to move it; admins are notified."
        actions={<ActionButton href="/boards" variant="secondary">Open boards</ActionButton>}
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
