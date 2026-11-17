import { Suspense } from 'react';
import { Columns3 } from 'lucide-react';
import StageBoard from '@/components/boards/StageBoard';
import AddStageDialog from '@/components/boards/AddStageDialog';
import { CreateTicketDialog } from '@/components/boards/TicketDialog';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { requireActiveProfile } from '@/lib/auth';
import { getApps, getMembers, getStageBoard, getTicketCreationBoards, hasDatabaseConnection } from '@/lib/db';

export const metadata = { title: 'Home' };

async function OverviewContent() {
  const profile = await requireActiveProfile();
  const connected = hasDatabaseConnection();
  const [data, boards, apps, members] = connected
    ? await Promise.all([
      getStageBoard(profile),
      getTicketCreationBoards(profile),
      getApps(profile),
      profile.role === 'admin' ? getMembers() : Promise.resolve([]),
    ])
    : [{ stages: [], cards: [], sectionMap: {} }, [], [], []];

  return (
    <>
      <PageHeader
        eyebrow="Your workspace"
        title="Project stages"
        description="A live view of work across your projects. Find a ticket, follow its progress, or move it to the next stage."
        actions={connected && (
          <div className="flex flex-wrap items-center gap-2">
            {profile.role === 'admin' && <AddStageDialog />}
            <CreateTicketDialog boards={boards} apps={apps} members={members} canAssignWorkspaceMembers={profile.role === 'admin'} canManageTicketFields={profile.role === 'admin'} />
          </div>
        )}
      />
      {data.stages.length === 0 ? (
        <EmptyState
          icon={Columns3}
          title="No project stages yet"
          description="Project stages will appear here once they are set up by an administrator."
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
