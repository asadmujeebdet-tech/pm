import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowUpRight, BriefcaseBusiness } from 'lucide-react';
import CreateAppForm, { DeleteAppButton } from '@/components/forms/CreateAppForm';
import AppIcon from '@/components/ui/AppIcon';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { requireActiveProfile } from '@/lib/auth';
import { getApps, getMembers, hasDatabaseConnection } from '@/lib/db';
import { formatDate } from '@/lib/format';

export const metadata = { title: 'Apps' };

async function AppsContent() {
  const profile = await requireActiveProfile();
  const [apps, members] = hasDatabaseConnection()
    ? await Promise.all([
        getApps(profile),
        profile.role === 'admin' ? getMembers() : Promise.resolve([]),
      ])
    : [[], []];

  return (
    <>
      <PageHeader
        eyebrow="Portfolio"
        title="Apps"
        description={apps.length > 0 ? `${apps.length} ${apps.length === 1 ? 'app' : 'apps'} · manage app details and releases.` : 'Manage company apps, their versions, and release history.'}
        actions={apps.length > 0 ? <CreateAppForm members={members} canAssignUsers={profile.role === 'admin'} /> : null}
      />

      {apps.length === 0 ? (
        <EmptyState
          icon={BriefcaseBusiness}
          title="No apps yet"
          description="Add an app to start tracking versions, releases, and related tasks."
          action={<CreateAppForm members={members} canAssignUsers={profile.role === 'admin'} />}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {apps.map((app, index) => (
            <li key={app.id} className="anim-pop flex" style={{ '--i': Math.min(index, 12) }}>
    <div className={`card lift surface-tint-${app.status === 'active' ? 'green' : 'amber'} relative flex h-full w-full flex-col p-5`}>
      <Link href={`/apps/${app.id}`} aria-label={`View ${app.name} details`} className="absolute inset-0 z-0 rounded-xl" />
      <div className="pointer-events-none relative z-10 flex items-start gap-3">
        <AppIcon name={app.name} src={app.icon_url || (app.icon_path ? `/api/apps/${app.id}/icon` : undefined)} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-[var(--foreground)]">{app.name}</h2>
          <p className="mt-0.5 truncate font-mono text-xs text-[var(--muted)]">{app.package_name || 'No package name'}</p>
        </div>
        <StatusBadge status={app.status || 'active'} />
      </div>

      <dl className="pointer-events-none relative z-10 mb-5 mt-5 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-4 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-[var(--muted)]">Version</dt>
          <dd className="mt-1 truncate font-medium text-[var(--foreground)]">{app.current_version_name || 'Not set'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-[var(--muted)]">Last release</dt>
          <dd className="mt-1 truncate font-medium text-[var(--foreground)]">{formatDate(app.latest_release_date, 'Not released yet')}</dd>
        </div>
      </dl>

      <div className="relative z-10 mt-auto flex items-center justify-between gap-2 border-t border-[var(--border)] pt-4">
        <div className="flex items-center gap-2">
          {profile.role === 'admin' && (
            <>
              <CreateAppForm app={app} members={members} variant="secondary" />
              <DeleteAppButton app={app} />
            </>
          )}
        </div>
        {app.app_url && (
          <a
            href={app.app_url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${app.name}`}
            title={`Open ${app.name}`}
            className="btn btn-ghost btn-icon shrink-0"
          >
            <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function AppsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading apps" cards={0} rows={4} />}>
      <AppsContent />
    </Suspense>
  );
}
