import { Suspense } from 'react';
import { connection } from 'next/server';
import { ShieldCheck, TriangleAlert } from 'lucide-react';
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
    <main className="login-page relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--bg)] px-4 py-12">
      <div aria-hidden="true" className="login-glow pointer-events-none absolute inset-0 z-0" />
      <div aria-hidden="true" className="login-orbs pointer-events-none absolute inset-0 z-0">
        <span className="login-orb login-orb-1" />
        <span className="login-orb login-orb-2" />
        <span className="login-orb login-orb-3" />
      </div>
      <div className="login-brand relative z-10 mb-8 flex items-center gap-3">
        <span aria-hidden="true" className="login-logo flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary)] text-sm font-bold tracking-wide text-[var(--primary-foreground)] shadow-[var(--shadow-soft)]">PM</span>
        <div>
          <p className="text-lg font-semibold tracking-tight text-[var(--foreground)]">Project Management</p>
          <p className="text-xs text-[var(--muted)]">Internal team workspace</p>
        </div>
      </div>
      <Suspense fallback={<LoginSkeleton />}>
        <div className="login-card-wrap relative z-10 flex w-full justify-center">
          <LoginContent searchParams={searchParams} />
        </div>
      </Suspense>
      <p className="relative z-10 mt-6 text-center text-xs text-[var(--muted)]">Secure access for your company team</p>
    </main>
  );
}
