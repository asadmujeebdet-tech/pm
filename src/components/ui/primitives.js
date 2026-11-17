import Link from 'next/link';
import Image from 'next/image';
import { getInitials } from '@/lib/format';

export function PageHeader({ title, description, actions, eyebrow }) {
  return (
    <div className="page-heading mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)] sm:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, subtitle, children, action, tone = 'blue', className = '' }) {
  return (
    <section className={`card surface-tint-${tone} p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-[var(--foreground)]">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ icon: Icon, title, description, action, compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--neutral)] px-6 text-center ${compact ? 'py-10' : 'py-16'}`}>
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
          <Icon size={22} aria-hidden="true" />
        </div>
      )}
      <p className="text-base font-semibold text-[var(--foreground)]">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-6 text-[var(--muted)]">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ActionButton({ href, children, variant = 'primary' }) {
  return (
    <Link href={href} className={`btn ${variant === 'primary' ? 'btn-primary' : 'btn-secondary'}`}>
      {children}
    </Link>
  );
}

const avatarTones = [
  'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/20 text-amber-800 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
];

function toneIndex(seed) {
  let hash = 0;
  for (const char of String(seed || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % avatarTones.length;
}

const avatarSizes = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
};

export function Avatar({ name, src, size = 'md', rounded = 'full', className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden font-semibold ${avatarSizes[size]} ${rounded === 'full' ? 'rounded-full' : 'rounded-xl'} ${avatarTones[toneIndex(name)]} ${className}`}
    >
      {getInitials(name)}
      {src && <Image src={src} alt="" width={48} height={48} unoptimized className="absolute inset-0 h-full w-full object-cover" />}
    </span>
  );
}

export function StatCard({ label, value, hint, tone = 'blue' }) {
  const accent = { blue: 'bg-[var(--primary)]', green: 'bg-[var(--success)]', purple: 'bg-violet-500', amber: 'bg-[var(--warning)]', red: 'bg-[var(--danger)]' }[tone] || 'bg-[var(--primary)]';
  return (
    <div className={`card surface-tint-${tone} p-5`}>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${accent}`} />
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      </div>
      <p className="kpi mt-3 text-3xl font-semibold tabular-nums tracking-tight text-[var(--foreground)]">{value}</p>
      {hint && <p className="mt-2 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}
