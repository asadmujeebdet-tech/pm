import { capitalize } from '@/lib/format';

// Each tone has light + dark variants so badges stay readable in both themes.
const tones = {
  neutral: { badge: 'bg-slate-500/12 text-slate-700 dark:text-slate-300', dot: 'bg-slate-500' },
  blue: { badge: 'bg-blue-500/12 text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  green: { badge: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  amber: { badge: 'bg-amber-500/15 text-amber-800 dark:text-amber-300', dot: 'bg-amber-500' },
  orange: { badge: 'bg-orange-500/15 text-orange-800 dark:text-orange-300', dot: 'bg-orange-500' },
  red: { badge: 'bg-rose-500/12 text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' },
  violet: { badge: 'bg-violet-500/12 text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
  indigo: { badge: 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500' },
};

const priorityMap = {
  low: 'green',
  medium: 'amber',
  high: 'orange',
  urgent: 'red',
  critical: 'red',
};

const statusMap = {
  planning: 'neutral',
  'not started': 'neutral',
  'in progress': 'blue',
  'on hold': 'amber',
  completed: 'green',
  cancelled: 'red',
  backlog: 'neutral',
  'to do': 'violet',
  'in review': 'indigo',
  blocked: 'red',
  active: 'green',
  inactive: 'neutral',
  suspended: 'red',
  admin: 'violet',
  member: 'neutral',
};

function Badge({ tone, children }) {
  const style = tones[tone] || tones.neutral;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${style.badge}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {children}
    </span>
  );
}

export function StatusBadge({ status, priority }) {
  if (status) {
    return <Badge tone={statusMap[String(status).toLowerCase()]}>{capitalize(status)}</Badge>;
  }

  if (priority) {
    const label = String(priority).toLowerCase() === 'urgent' ? 'Critical' : capitalize(priority);
    return <Badge tone={priorityMap[String(priority).toLowerCase()]}>{label}</Badge>;
  }

  return null;
}
