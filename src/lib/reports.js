const FINISHED = /^(completed|done|closed|released)$/i;
const PRIORITIES = ['critical', 'high', 'medium', 'low'];

export const isFinished = (card) => FINISHED.test(String(card.section_name || '').trim());

export function buildReport(cards, boards) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 7);
  const due = (c) => (c.due_date ? new Date(c.due_date) : null);

  const done = cards.filter(isFinished);
  const open = cards.filter((c) => !isFinished(c));
  const overdue = open.filter((c) => due(c) && due(c) < now);
  const dueSoon = open.filter((c) => due(c) && due(c) >= now && due(c) <= soon);

  const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);

  const pipelineMap = new Map();
  cards.forEach((c) => bump(pipelineMap, String(c.section_name).trim()));
  const pipeline = [...pipelineMap].map(([name, count]) => ({ name, count }));

  const priorityMap = new Map();
  open.forEach((c) => bump(priorityMap, c.priority === 'urgent' ? 'critical' : c.priority));
  const priority = PRIORITIES.map((name) => ({ name, count: priorityMap.get(name) || 0 }));

  const boardRows = boards.map((b) => {
    const own = cards.filter((c) => c.board_id === b.id);
    const ownDone = own.filter(isFinished).length;
    const ownOpen = own.filter((c) => !isFinished(c));
    const last = own.reduce((m, c) => Math.max(m, new Date(c.updated_at).getTime()), 0);
    return {
      id: b.id,
      name: b.name,
      app_name: b.app_name,
      total: own.length,
      done: ownDone,
      overdue: ownOpen.filter((c) => due(c) && due(c) < now).length,
      progress: own.length ? Math.round((ownDone / own.length) * 100) : 0,
      last: last || null,
    };
  });

  const people = new Map();
  open.forEach((c) =>
    (c.assignees || []).forEach((name) => {
      const p = people.get(name) || { name, open: 0, overdue: 0, high: 0 };
      p.open += 1;
      if (due(c) && due(c) < now) p.overdue += 1;
      if (['high', 'critical', 'urgent'].includes(c.priority)) p.high += 1;
      people.set(name, p);
    })
  );
  const workload = [...people.values()].sort((a, b) => b.open - a.open);

  const attention = [...overdue].sort((a, b) => due(a) - due(b)).slice(0, 8);

  return {
    totals: {
      all: cards.length,
      open: open.length,
      done: done.length,
      completion: cards.length ? Math.round((done.length / cards.length) * 100) : 0,
      overdue: overdue.length,
      dueSoon: dueSoon.length,
    },
    pipeline,
    priority,
    boards: boardRows,
    workload,
    attention,
  };
}

const csvCell = (v) => {
  let s = Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // neutralise spreadsheet formulas
  return `"${s.replace(/"/g, '""')}"`;
};

export function cardsToCsv(cards) {
  const head = ['Ticket', 'Title', 'Board', 'App', 'List', 'Priority', 'Due date', 'Status', 'Assignees'];
  const rows = cards.map((c) => [
    c.ticket_number ? `#${String(c.ticket_number).padStart(3, '0')}` : '',
    c.title, c.board_name, c.app_name, c.section_name, c.priority,
    c.due_date ? new Date(c.due_date).toISOString().slice(0, 10) : '',
    isFinished(c) ? 'Finished' : 'Open',
    c.assignees,
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}
