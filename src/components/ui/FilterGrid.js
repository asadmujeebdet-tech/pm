'use client';

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';

// Search + chip filter over server-rendered items. The list re-mounts on every change
// so results animate in with a short stagger.
export default function FilterGrid({ items, groups = [], placeholder = 'Search…', className = '', emptyText = 'Nothing matches your filters.' }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');

  const counts = useMemo(() => {
    const map = { all: items.length };
    items.forEach((i) => { map[i.group] = (map[i.group] || 0) + 1; });
    return map;
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => (group === 'all' || i.group === group) && (!q || i.search.toLowerCase().includes(q)));
  }, [items, query, group]);

  const filtering = query.trim() !== '' || group !== 'all';

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="filter-search relative w-full sm:max-w-xs">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="field !min-h-10 !pl-9 !pr-9"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--muted)] hover:text-[var(--foreground)]">
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        {groups.length > 0 && (
          <div role="group" aria-label="Filter" className="flex flex-wrap gap-1.5">
            {[{ value: 'all', label: 'All' }, ...groups].map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGroup(g.value)}
                aria-pressed={group === g.value}
                className={`chip ${group === g.value ? 'chip-active' : ''}`}
              >
                {g.label}
                <span className="chip-count">{counts[g.value] || 0}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">{visible.length} results</p>

      {visible.length === 0 ? (
        <div className="anim-pop rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--neutral)] px-6 py-12 text-center text-sm text-[var(--muted)]">
          {emptyText}
          {filtering && (
            <button type="button" onClick={() => { setQuery(''); setGroup('all'); }} className="ml-2 font-medium text-[var(--primary)] hover:underline">Clear filters</button>
          )}
        </div>
      ) : (
        <ul key={`${query}|${group}`} className={className}>
          {visible.map((item, index) => (
            <li key={item.id} className="anim-pop" style={{ '--i': Math.min(index, 12) }}>{item.node}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
