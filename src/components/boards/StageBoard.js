'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Clock, GripVertical, History, Pencil, Search, Trash2, X } from 'lucide-react';
import { deleteOverviewStage, moveCard, renameOverviewStage, reorderOverviewStages } from '@/lib/board-actions';
import { FormMessage } from '@/components/ui/Field';

const STAGE_TONES = ['#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#10b981', '#64748b'];

const priorityClasses = {
  low: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  medium: 'bg-amber-500/20 text-amber-800 dark:text-amber-300',
  high: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  urgent: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  critical: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
};

export function formatDuration(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function StageCard({ card, now, busy }) {
  const [open, setOpen] = useState(false);
  const history = card.history || [];
  const current = [...history].reverse().find((entry) => !entry.left_at);
  const inStage = current ? formatDuration(now - new Date(current.entered_at).getTime()) : null;
  const totals = new Map();
  for (const entry of history) {
    const end = entry.left_at ? new Date(entry.left_at).getTime() : now;
    totals.set(entry.stage, (totals.get(entry.stage) || 0) + (end - new Date(entry.entered_at).getTime()));
  }
  return (
    <li
      draggable={!busy}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', card.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      className="stage-card anim-pop rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <GripVertical size={14} aria-hidden="true" className="mt-0.5 shrink-0 cursor-grab text-[var(--muted)]" />
        <div className="min-w-0 flex-1">
          <Link href={`/boards/${card.board_id}?ticketId=${card.id}`} className="block text-sm font-medium text-[var(--foreground)] hover:text-[var(--primary)]">
            <span className="mr-1.5 font-mono text-[10px] font-bold text-[var(--primary)]">#{String(card.ticket_number).padStart(3, '0')}</span>
            {card.title}
          </Link>
          <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{card.app_name || card.board_name}</p>
        </div>
        {card.priority && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${priorityClasses[card.priority] || ''}`}>
            {card.priority === 'urgent' ? 'critical' : card.priority}
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-[var(--neutral)] px-2 py-1 text-xs font-medium text-[var(--foreground)]" title="Time in this stage">
          <Clock size={12} aria-hidden="true" /> {inStage || '—'}
        </span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline"
        >
          <History size={12} aria-hidden="true" /> Time per stage
          <ChevronDown size={12} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <ul className="stage-history mt-2.5 space-y-1 border-t border-[var(--border)] pt-2.5">
          {[...totals.entries()].map(([stage, ms]) => (
            <li key={stage} className="flex items-center justify-between text-xs">
              <span className={stage.trim().toLowerCase() === card.stage_key ? 'font-semibold text-[var(--foreground)]' : 'text-[var(--muted)]'}>
                {stage}{stage.trim().toLowerCase() === card.stage_key ? ' (now)' : ''}
              </span>
              <span className="font-mono text-[var(--foreground)]">{formatDuration(ms)}</span>
            </li>
          ))}
          {totals.size === 0 && <li className="text-xs text-[var(--muted)]">No history yet.</li>}
        </ul>
      )}

    </li>
  );
}

export default function StageBoard({ stages, cards: initialCards, sectionMap, isAdmin }) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [now, setNow] = useState(() => Date.now());
  const [dragOver, setDragOver] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [editingStage, setEditingStage] = useState(null);
  const [stageTitle, setStageTitle] = useState('');
  const [query, setQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const [seen, setSeen] = useState(initialCards);
  if (seen !== initialCards) {
    setSeen(initialCards);
    setCards(initialCards);
  }
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const byStage = useMemo(() => {
    const map = new Map(stages.map((stage) => [stage.key, []]));
    const normalizedQuery = query.trim().toLowerCase();
    for (const card of cards) {
      const matchesQuery = !normalizedQuery || [card.title, card.app_name, card.board_name, String(card.ticket_number)]
        .some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
      const matchesPriority = priorityFilter === 'all'
        || (priorityFilter === 'critical' ? ['urgent', 'critical'].includes(card.priority) : card.priority === priorityFilter);
      if (matchesQuery && matchesPriority) map.get(card.stage_key)?.push(card);
    }
    return map;
  }, [cards, stages, query, priorityFilter]);

  async function handleMove(card, targetKey) {
    if (busy || card.stage_key === targetKey) return;
    const sectionId = sectionMap[card.board_id]?.[targetKey];
    if (!sectionId) {
      setMessage('This ticket’s board does not have that stage.');
      return;
    }
    const previous = cards;
    const target = stages.find((stage) => stage.key === targetKey);
    const stamp = new Date().toISOString();
    setCards((current) => current.map((item) => item.id === card.id ? {
      ...item,
      stage_key: targetKey,
      stage_title: target.title,
      section_id: sectionId,
      history: [
        ...item.history.map((entry) => entry.left_at ? entry : { ...entry, left_at: stamp }),
        { stage: target.title, entered_at: stamp, left_at: null },
      ],
    } : item));
    setBusy(true);
    setMessage('');
    try {
      const result = await moveCard(card.id, sectionId, 0);
      if (!result.success) {
        setCards(previous);
        setMessage(result.message || 'Could not move this ticket.');
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to move a ticket from home:', error);
      setCards(previous);
      setMessage('Could not move this ticket. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRenameStage(event, stage) {
    event.preventDefault();
    const cleanTitle = stageTitle.trim();
    if (!cleanTitle) {
      setMessage('Enter a stage name.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const result = await renameOverviewStage(stage.key, cleanTitle);
      if (!result.success) {
        setMessage(result.message || 'Could not rename this stage.');
        return;
      }
      setEditingStage(null);
      setStageTitle('');
      router.refresh();
    } catch (error) {
      console.error('Failed to rename a stage from overview:', error);
      setMessage('Could not rename this stage. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteStage(stage) {
    if (!window.confirm(`Delete "${stage.title}" across all boards? This permanently deletes its tickets and their comments, links, and attachments.`)) return;

    setBusy(true);
    setMessage('');
    try {
      const result = await deleteOverviewStage(stage.key);
      if (!result.success) {
        setMessage(result.message || 'Could not delete this stage.');
        return;
      }
      router.refresh();
    } catch (error) {
      console.error('Failed to delete a stage from overview:', error);
      setMessage('Could not delete this stage. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReorderStages(sourceKey, targetKey) {
    if (busy || sourceKey === targetKey) return;
    const sourceIndex = stages.findIndex((stage) => stage.key === sourceKey);
    const targetIndex = stages.findIndex((stage) => stage.key === targetKey);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const reordered = [...stages];
    const [stage] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, stage);

    setBusy(true);
    setMessage('');
    try {
      const result = await reorderOverviewStages(reordered.map((item) => item.key));
      if (!result.success) {
        setMessage(result.message || 'Could not reorder stages.');
        return;
      }
      router.refresh();
    } catch (error) {
      console.error('Failed to reorder overview stages:', error);
      setMessage('Could not reorder stages. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const visibleCount = [...byStage.values()].reduce((total, list) => total + list.length, 0);

  return (
    <div>
      <FormMessage state={{ success: false, message }} />
      <section aria-label="Filter tickets" className="mb-4 flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-soft)] sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <label className="sr-only" htmlFor="stage-ticket-search">Search tickets</label>
          <input
            id="stage-ticket-search"
            type="search"
            className="field field-with-icon min-h-10 rounded-xl border-transparent bg-[var(--bg)] text-sm"
            placeholder="Search tickets, apps, or boards"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-label="Filter by priority">
          <span className="mr-1 text-xs font-medium text-[var(--muted)]">Priority</span>
          {[
            ['all', 'All'],
            ['critical', 'Critical'],
            ['high', 'High'],
            ['medium', 'Medium'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={priorityFilter === value}
              onClick={() => setPriorityFilter(value)}
              className={`chip ${priorityFilter === value ? 'chip-active' : ''}`}
            >
              {label}
            </button>
          ))}
          <span className="ml-1 text-xs tabular-nums text-[var(--muted)]" aria-live="polite">{visibleCount} / {cards.length}</span>
        </div>
      </section>
      <div className="mt-2 flex gap-4 overflow-x-auto pb-4" role="list" aria-label="Workflow stages">
        {stages.map((stage, index) => {
          const list = byStage.get(stage.key) || [];
          const tone = STAGE_TONES[index % STAGE_TONES.length];
          return (
            <section
              key={stage.key}
              role="listitem"
              aria-label={`${stage.title}, ${list.length} tickets`}
              onDragOver={(event) => { event.preventDefault(); setDragOver(stage.key); }}
              onDragLeave={() => setDragOver((current) => current === stage.key ? null : current)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(null);
                const sourceStageKey = event.dataTransfer.getData('application/x-overview-stage');
                if (sourceStageKey) {
                  event.stopPropagation();
                  if (isAdmin) void handleReorderStages(sourceStageKey, stage.key);
                  return;
                }
                const card = cards.find((item) => item.id === event.dataTransfer.getData('text/plain'));
                if (card) void handleMove(card, stage.key);
              }}
              className={`stage-column flex w-72 shrink-0 flex-col rounded-2xl border bg-[var(--neutral)] p-3 transition-colors ${dragOver === stage.key ? 'border-[var(--primary)] bg-[var(--primary-soft)]' : 'border-[var(--border)]'}`}
              style={{ '--i': index, '--stage-accent': tone }}
            >
              <header className="mb-3 flex items-center justify-between gap-2 px-1">
                {editingStage === stage.key ? (
                  <form onSubmit={(event) => void handleRenameStage(event, stage)} className="flex min-w-0 flex-1 items-center gap-1">
                    <input
                      aria-label="Stage name"
                      className="field min-h-8 min-w-0 px-2 py-1 text-sm font-semibold"
                      maxLength={80}
                      value={stageTitle}
                      onChange={(event) => setStageTitle(event.target.value)}
                      disabled={busy}
                      autoFocus
                    />
                    <button type="submit" disabled={busy} className="btn btn-primary btn-icon min-h-8 min-w-8" aria-label="Save stage name">
                      <Check size={14} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => { setEditingStage(null); setMessage(''); }} disabled={busy} className="btn btn-ghost btn-icon min-h-8 min-w-8" aria-label="Cancel renaming stage">
                      <X size={14} aria-hidden="true" />
                    </button>
                  </form>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <h2 className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tone }} />
                      <span className="whitespace-normal break-words">{stage.title}</span>
                    </h2>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          draggable={!busy}
                          onDragStart={(event) => {
                            event.stopPropagation();
                            event.dataTransfer.setData('application/x-overview-stage', stage.key);
                            event.dataTransfer.effectAllowed = 'move';
                          }}
                          disabled={busy}
                          className="btn btn-ghost btn-icon min-h-8 min-w-8 cursor-grab"
                          aria-label={`Drag to reorder ${stage.title}`}
                          title="Drag to reorder stage"
                        >
                          <GripVertical size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingStage(stage.key); setStageTitle(stage.title); setMessage(''); }}
                          disabled={busy}
                          className="btn btn-ghost btn-icon stage-action-edit min-h-8 min-w-8"
                          aria-label={`Rename ${stage.title} stage`}
                          title="Rename stage across boards"
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteStage(stage)}
                          disabled={busy}
                          className="btn btn-ghost btn-icon stage-action-delete min-h-8 min-w-8"
                          aria-label={`Delete ${stage.title} stage`}
                          title="Delete stage across boards"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                )}
                <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">{list.length}</span>
              </header>
              <ul className="space-y-2.5">
                {list.map((card) => (
                  <StageCard key={card.id} card={card} now={now} busy={busy} />
                ))}
                {list.length === 0 && (
                  <li className="rounded-xl border border-dashed border-[var(--border-strong)] px-3 py-6 text-center text-xs text-[var(--muted)]">
                    {query || priorityFilter !== 'all' ? 'No matching tickets' : 'Drop a ticket here'}
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
