import { Suspense } from 'react';
import { ArrowUpRight, Columns3, Layers3, ListTodo, Siren } from 'lucide-react';
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

  const criticalCount = data.cards.filter((card) => ['urgent', 'critical'].includes(card.priority)).length;

  return (
    <>
      <PageHeader
        eyebrow="Your workspace"
        title="Project stages"
        description="A live view of work across your boards. Find a ticket, follow its progress, or move it to the next stage."
        actions={<ActionButton href="/boards" variant="secondary">Explore boards <ArrowUpRight size={15} aria-hidden="true" /></ActionButton>}
      />
      {data.stages.length > 0 && (
        <section aria-label="Workspace summary" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="overview-metric">
            <span className="overview-metric-icon overview-metric-icon-primary"><ListTodo size={18} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="overview-metric-label">Tickets in view</p>
              <p className="overview-metric-value">{data.cards.length}</p>
            </div>
            <span className="overview-metric-note">Across all boards</span>
          </div>
          <div className="overview-metric">
            <span className="overview-metric-icon overview-metric-icon-blue"><Layers3 size={18} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="overview-metric-label">Workflow stages</p>
              <p className="overview-metric-value">{data.stages.length}</p>
            </div>
            <span className="overview-metric-note">Shared workflow</span>
          </div>
          <div className="overview-metric">
            <span className="overview-metric-icon overview-metric-icon-amber"><Siren size={18} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="overview-metric-label">Urgent tickets</p>
              <p className="overview-metric-value">{criticalCount}</p>
            </div>
            <span className="overview-metric-note">Needs attention</span>
          </div>
        </section>
      )}
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
