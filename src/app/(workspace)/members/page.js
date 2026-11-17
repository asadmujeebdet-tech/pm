import { Users } from 'lucide-react';
import CreateMemberForm, { DeleteMemberButton } from '@/components/forms/CreateMemberForm';
import MemberApps from '@/components/ui/MemberApps';
import FilterGrid from '@/components/ui/FilterGrid';
import { Avatar, EmptyState, PageHeader } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { requireAdmin } from '@/lib/auth';
import { getApps, getBoardsForMemberManagement, getMemberTicketStats, getMembers, hasDatabaseConnection } from '@/lib/db';

export const metadata = { title: 'Members' };

// This page reads the authenticated user and live database data at request time.
// Keep it out of static prerendering without remounting the shared AppShell.
export const instant = false;

function Stat({ label, value, tone }) {
  const toneClasses = {
    neutral: 'bg-[var(--neutral)] text-[var(--foreground)]',
    blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
    green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    red: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  };
  return (
    <div className={`min-w-[3.25rem] rounded-lg px-2.5 py-2 text-center ${toneClasses[tone] || toneClasses.neutral}`}>
      <p className="text-lg font-semibold tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
    </div>
  );
}

async function MembersContent() {
  const profile = await requireAdmin();
  const connected = hasDatabaseConnection();
  const [members, apps, boards, stats] = connected
    ? await Promise.all([getMembers(), getApps(profile), getBoardsForMemberManagement(), getMemberTicketStats()])
    : [[], [], [], {}];
  const sortedMembers = [...members].sort((left, right) => {
    if (left.role === right.role) return 0;
    return left.role === 'admin' ? -1 : 1;
  });
  const appsById = new Map(apps.map((app) => [app.id, app]));

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Members"
        description={members.length > 0 ? `${members.length} ${members.length === 1 ? 'account' : 'accounts'} in the workspace.` : 'Create and manage workspace accounts.'}
        actions={members.length > 0 ? <CreateMemberForm apps={apps} boards={boards} /> : null}
      />

      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No team members yet"
          description="Add a user to create the first workspace account."
          action={<CreateMemberForm apps={apps} boards={boards} />}
        />
      ) : (
        <FilterGrid
          placeholder="Search members…"
          className="space-y-3"
          emptyText="No members match your search."
          items={sortedMembers.map((member) => {
            const displayName = member.full_name || member.email;
            const s = stats[member.id] || { total: 0, open: 0, done: 0, overdue: 0 };
            const memberApps = (member.assigned_app_ids || []).map((id) => appsById.get(id)).filter(Boolean);
            return {
              id: member.id,
              search: `${displayName} ${member.email} ${memberApps.map((a) => a.name).join(' ')}`,
              group: member.role === 'admin' ? 'admin' : 'member',
              node: (
                <div className={`card lift surface-tint-${member.status === 'active' ? member.role === 'admin' ? 'purple' : 'blue' : 'amber'} grid gap-x-6 gap-y-4 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_auto_auto] xl:items-center`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={displayName} src={member.avatar_path ? `/api/avatars/${member.id}` : undefined} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--foreground)]">
                        {displayName}
                        {member.id === profile.id && <span className="ml-2 text-xs font-normal text-[var(--muted)]">(you)</span>}
                      </p>
                      <p className="truncate text-sm text-[var(--muted)]">{member.email}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <StatusBadge status={member.role || 'member'} />
                        <StatusBadge status={member.status || 'active'} />
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 md:col-span-2 xl:col-span-1">
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Apps · {memberApps.length}</p>
                    <MemberApps apps={memberApps.map((app) => ({ id: app.id, name: app.name, src: app.icon_url || (app.icon_path ? `/api/apps/${app.id}/icon` : undefined) }))} />
                  </div>

                  <div className="grid grid-cols-4 gap-2 md:col-start-1 xl:col-start-auto" aria-label="Ticket stats">
                    <Stat label="Tickets" value={s.total} />
                    <Stat label="Open" value={s.open} tone="blue" />
                    <Stat label="Done" value={s.done} tone="green" />
                    <Stat label="Overdue" value={s.overdue} tone="red" />
                  </div>

                  <div className="flex min-w-[10.5rem] flex-wrap items-center justify-end gap-2 md:col-start-2 md:row-start-1 xl:col-start-auto xl:row-start-auto">
                    <CreateMemberForm member={member} apps={apps} boards={boards} variant="secondary" />
                    {member.id !== profile.id && <DeleteMemberButton member={member} />}
                  </div>
                </div>
              ),
            };
          })}
        />
      )}
    </>
  );
}

export default function MembersPage() {
  return <MembersContent />;
}
