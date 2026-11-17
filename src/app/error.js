'use client';

import { RotateCcw, TriangleAlert } from 'lucide-react';

export default function GlobalError({ reset }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-12">
      <div role="alert" className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--danger-soft)] text-[var(--danger)]">
          <TriangleAlert size={22} aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Something went wrong</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          We couldn&apos;t load this page. Check your connection and try again.
        </p>
        <button type="button" onClick={() => reset()} className="btn btn-primary mt-6">
          <RotateCcw size={16} aria-hidden="true" />
          Try again
        </button>
      </div>
    </main>
  );
}
