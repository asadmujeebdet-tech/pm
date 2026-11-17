import { Suspense } from 'react';
import { connection } from 'next/server';
import { KanbanSquare, ShieldCheck, TriangleAlert } from 'lucide-react';
import LoginForm from '@/components/forms/LoginForm';
import { Skeleton } from '@/components/ui/Skeleton';
import { hasAnyProfiles } from '@/lib/auth';
import { hasDatabaseConnection } from '@/lib/db';

export const metadata = { title: 'Sign in' };

async function LoginContent({ searchParams }) {
  await connection();
  const query = await searchParams;
  const databaseConfigured = hasDatabaseConnection();
  let needsSetup = false;
  let databaseIssue = '';

  if (databaseConfigured && query.loggedOut !== '1') {
    try {
      needsSetup = !(await hasAnyProfiles());
    } catch (error) {
      console.error('Unable to check workspace setup because PostgreSQL is unavailable:', error);
      databaseIssue = error?.code === '42P01'
        ? 'The workspace database schema is missing. Run supabase/schema.sql for a new project or the provided migration for an existing database.'
        : 'The database could not be reached. Check the Supabase host, username, and password in DATABASE_URL. If Supabase has temporarily blocked connections after authentication failures, correct the credentials and wait for the block to clear before retrying.';
    }
  }

  return (
    <section className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
        {needsSetup ? 'Workspace setup' : 'Company workspace'}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
        {needsSetup ? 'Create workspace admin' : 'Welcome back'}
      </h1>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
        {needsSetup
          ? 'Set up the first administrator. This form is disabled after the first account is created.'
          : 'Sign in with your workspace email and password.'}
      </p>

      <div className="mt-7">
        {databaseIssue ? (
          <div role="alert" className="flex gap-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-4 text-sm text-[var(--foreground)]">
            <TriangleAlert size={18} className="mt-0.5 shrink-0 text-[var(--danger)]" aria-hidden="true" />
            <p>{databaseIssue}</p>
          </div>
        ) : databaseConfigured ? (
          <LoginForm needsSetup={needsSetup} />
        ) : (
          <div role="alert" className="flex gap-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-4 text-sm text-[var(--foreground)]">
            <TriangleAlert size={18} className="mt-0.5 shrink-0 text-[var(--danger)]" aria-hidden="true" />
            <p>
              Database connection is not configured. Set <code className="rounded bg-[var(--neutral)] px-1 py-0.5 font-mono text-xs">DATABASE_URL</code> in <code className="rounded bg-[var(--neutral)] px-1 py-0.5 font-mono text-xs">.env.local</code> and restart the app.
            </p>
          </div>
        )}
      </div>

      {databaseConfigured && !databaseIssue && !needsSetup && (
        <p className="mt-6 flex items-start gap-2 text-xs leading-5 text-[var(--muted)]">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Passwords are stored as salted, one-way hashes, never as readable text.
        </p>
      )}
    </section>
  );
}

function LoginSkeleton() {
  return (
    <div role="status" aria-busy="true" className="w-full max-w-md space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-8">
      <span className="sr-only">Loading sign-in…</span>
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <Skeleton className="h-11 w-full rounded-xl" />
    </div>
  );
}

export default function LoginPage({ searchParams }) {
  return (
    <main className="login-page">
      <div aria-hidden="true" className="login-backdrop" />
      <div className="login-layout">
        <section className="login-showcase" aria-label="Project Manager workspace">
          <div className="login-showcase-grid" aria-hidden="true" />
          <header className="login-brand">
            <span aria-hidden="true" className="login-logo"><KanbanSquare size={19} strokeWidth={2.4} /></span>
            <span>
              <span className="block text-sm font-semibold tracking-tight text-white">Project Manager</span>
              <span className="mt-0.5 block text-xs text-white/55">Work, in good company.</span>
            </span>
          </header>
          <div className="login-showcase-copy">
            <p className="login-kicker"><span aria-hidden="true" /> THE TEAM WORKSPACE</p>
            <h2>Make room for<br />great work.</h2>
            <p>Bring every project, conversation, and next step into one clear view.</p>
          </div>
          <div className="login-board-preview" aria-hidden="true">
            <div className="login-board-topline"><span>Product launch</span><span className="login-board-status">● On track</span></div>
            <div className="login-board-columns">
              <div className="login-board-column">
                <span className="login-board-column-title"><i /> Up next <b>2</b></span>
                <span className="login-board-task"><small>DESIGN</small>Map the first-run flow</span>
                <span className="login-board-task"><small>CONTENT</small>Review launch messaging</span>
              </div>
              <div className="login-board-column">
                <span className="login-board-column-title"><i /> In progress <b>1</b></span>
                <span className="login-board-task login-board-task-active"><small>ENGINEERING</small>Build the new workspace</span>
              </div>
              <div className="login-board-column login-board-column-last">
                <span className="login-board-column-title"><i /> Complete <b>1</b></span>
                <span className="login-board-task"><small>RESEARCH</small>Talk to the people who use it</span>
              </div>
            </div>
            <div className="login-board-footer"><span className="login-avatar-stack"><i>J</i><i>M</i><i>A</i></span><span>Small steps. Big momentum.</span></div>
          </div>
          <p className="login-showcase-foot">A calmer way to move work forward.</p>
        </section>

        <section className="login-panel">
          <div className="login-panel-inner">
            <div className="login-mobile-brand">
              <span aria-hidden="true" className="login-logo"><KanbanSquare size={19} strokeWidth={2.4} /></span>
              <span className="text-sm font-semibold">Project Manager</span>
            </div>
            <div className="login-card-wrap">
              <Suspense fallback={<LoginSkeleton />}>
                <LoginContent searchParams={searchParams} />
              </Suspense>
            </div>
            <p className="login-panel-foot"><ShieldCheck size={14} aria-hidden="true" /> Secure access for your team</p>
          </div>
        </section>
      </div>
    </main>
  );
}
