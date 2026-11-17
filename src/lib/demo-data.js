export const departments = [];
export const employees = [];
export const projects = [];
export const tasks = [];
export const milestones = [];
export const timeEntries = [];
export const notifications = [];
export const activity = [];
export const dashboardStats = [];
export const projectStatusData = [];
export const taskStatusData = [];
export const weeklyProgress = [];
export const departmentPerformance = [];

export function getProjectProgress() {
  return 0;
}

export function getPriorityTone(priority) {
  const normalized = String(priority || '').toLowerCase();
  const tones = {
    low: 'bg-emerald-100 text-emerald-700',
    medium: 'bg-amber-100 text-amber-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-rose-100 text-rose-700',
    critical: 'bg-rose-100 text-rose-700',
  };

  return tones[normalized] || 'bg-slate-100 text-slate-700';
}

export function getStatusTone(status) {
  const normalized = String(status || '').toLowerCase();
  const tones = {
    planning: 'bg-slate-100 text-slate-700',
    'not started': 'bg-slate-100 text-slate-700',
    'in progress': 'bg-blue-100 text-blue-700',
    'on hold': 'bg-amber-100 text-amber-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-rose-100 text-rose-700',
    backlog: 'bg-slate-100 text-slate-700',
    'to do': 'bg-violet-100 text-violet-700',
    'in review': 'bg-indigo-100 text-indigo-700',
    blocked: 'bg-rose-100 text-rose-700',
    active: 'bg-emerald-100 text-emerald-700',
    inactive: 'bg-slate-100 text-slate-700',
  };

  return tones[normalized] || 'bg-slate-100 text-slate-700';
}
