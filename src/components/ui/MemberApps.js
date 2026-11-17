'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import AppIcon from '@/components/ui/AppIcon';

const VISIBLE = 3;

// Shows the first few apps and folds the rest behind "+N more", so a person who owns
// many apps never stretches the row. Expanded apps scroll inside a capped area.
export default function MemberApps({ apps }) {
  const [open, setOpen] = useState(false);

  if (apps.length === 0) return <p className="text-sm text-[var(--muted)]">No apps</p>;

  const shown = open ? apps : apps.slice(0, VISIBLE);
  const hidden = apps.length - VISIBLE;

  return (
    <div>
      <ul className={`flex flex-wrap gap-1.5 ${open ? 'max-h-36 overflow-y-auto pr-1' : ''}`}>
        {shown.map((app) => (
          <li key={app.id} className="max-w-full">
            <Link
              href={`/apps/${app.id}`}
              title={app.name}
              aria-label={`Open ${app.name}`}
              className="inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
            >
              <AppIcon name={app.name} src={app.src} size="sm" />
            </Link>
          </li>
        ))}
        {hidden > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex min-h-7 items-center gap-1 rounded-full border border-dashed border-[var(--border-strong)] px-2.5 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              {open ? 'Show less' : `+${hidden} more`}
              <ChevronDown size={12} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
