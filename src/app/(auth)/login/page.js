import { Suspense } from 'react';
import { connection } from 'next/server';
import { KanbanSquare, TriangleAlert } from 'lucide-react';
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
        ? 'Workspace database setup is incomplete.'
        : 'Database unavailable. Check the connection settings and try again.';
    }
  }

  return (
    <section className="login-card" aria-labelledby="login-title">
      <p className="login-eyebrow">{needsSetup ? 'FIRST-TIME SETUP' : 'SIGN IN'}</p>
      <h1 id="login-title">{needsSetup ? 'Create your account' : 'Welcome back'}</h1>
      <div className="login-form-slot">
        {databaseIssue ? (
          <div role="alert" className="login-error">
            <TriangleAlert size={17} aria-hidden="true" />
            <p>{databaseIssue}</p>
          </div>
        ) : databaseConfigured ? (
          <LoginForm needsSetup={needsSetup} />
        ) : (
          <div role="alert" className="login-error">
            <TriangleAlert size={17} aria-hidden="true" />
            <p>Database connection is not configured.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function LoginSkeleton() {
  return (
    <div role="status" aria-busy="true" className="login-card login-skeleton">
      <span className="sr-only">Loading sign-in…</span>
      <Skeleton className="h-7 w-40" />
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
      <div className="login-shell">
        <header className="login-brand">
          <span aria-hidden="true" className="login-logo"><KanbanSquare size={18} strokeWidth={2.3} /></span>
          <span>Project Manager</span>
        </header>
        <Suspense fallback={<LoginSkeleton />}>
          <LoginContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
