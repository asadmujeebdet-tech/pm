'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { signOut } from '@/lib/actions';
import { Avatar } from '@/components/ui/primitives';
import NotificationBell from '@/components/layout/NotificationBell';
import {
  BarChart3,
  BriefcaseBusiness,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  Sun,
  Users,
  X,
} from 'lucide-react';

const navigation = [
  { group: 'Workspace', items: [
    { href: '/overview', label: 'Home', icon: LayoutDashboard },
    { href: '/reports', label: 'Reports', icon: BarChart3 },
  ] },
  { group: 'Work', items: [
    { href: '/boards', label: 'Boards', icon: KanbanSquare },
    { href: '/my-tasks', label: 'My Tasks', icon: ListChecks },
  ] },
  { group: 'Portfolio', items: [
    { href: '/apps', label: 'Apps', icon: BriefcaseBusiness },
  ] },
  { group: 'Admin', items: [
    { href: '/members', label: 'Members', icon: Users, adminOnly: true },
  ] },
];

const THEME_KEY = 'app-manager-theme';

// The theme lives on <html data-theme>, set before paint by an inline script in the root layout.
function subscribeToTheme(callback) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

function useTheme() {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    () => document.documentElement.dataset.theme || 'dark',
    () => 'dark'
  );

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the theme still applies for this session.
    }
  };

  return { theme, toggleTheme };
}

function Brand() {
  return (
    <Link href="/overview" className="flex items-center gap-3 rounded-xl outline-offset-4">
      <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(145deg,var(--primary),#6366f1)] text-xs font-bold tracking-tight text-[var(--primary-foreground)] shadow-[0_6px_18px_-6px_var(--ring)]">
        PM
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold tracking-tight">Project Manager</span>
        <span className="mt-0.5 block text-[11px] text-[var(--muted)]">Team workspace</span>
      </span>
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--success)] ring-4 ring-[var(--success)]/10" />
    </Link>
  );
}

function SidebarContent({ groups, activeHref, user, onNavigate }) {
  return (
    <>
      <div className="border-b border-[var(--border)] px-4 py-5">
        <Brand />
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4 pt-5">
        {groups.map((g, gi) => (
          <div key={g.group} className={gi > 0 ? 'mt-6' : ''}>
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{g.group}</p>
            <ul className="space-y-1">
              {g.items.map((item, ii) => {
                const Icon = item.icon;
                const isActive = activeHref === item.href;
                return (
                  <li key={item.href} className="nav-item-in" style={{ '--i': gi * 2 + ii }}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={isActive ? 'page' : undefined}
                      className="nav-link"
                    >
                      <Icon size={17} aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--border)] p-3">
        <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--neutral)] p-2.5 transition-colors hover:border-[var(--border-strong)]">
          <Avatar name={user?.full_name || user?.email} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.full_name || 'Workspace account'}</p>
            {user?.email && <p className="truncate text-xs text-[var(--muted)]">{user.email}</p>}
          </div>
          <form action={signOut}>
            <button type="submit" aria-label="Sign out" title="Sign out" className="btn btn-ghost btn-icon">
              <LogOut size={18} aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

export default function AppShell({ children, user, fullWidth = false }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeButtonRef = useRef(null);
  const menuButtonRef = useRef(null);
  const { theme, toggleTheme } = useTheme();

  const groups = navigation
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || user?.role === 'admin') }))
    .filter((g) => g.items.length > 0);
  const activeItem = groups.flatMap((g) => g.items).find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const contentFullWidth = fullWidth || /^\/boards\/[^/]+/.test(pathname);

  // Drawer behaviour: Escape closes, page behind does not scroll, focus moves in and back out.
  useEffect(() => {
    if (!mobileOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const menuButton = menuButtonRef.current;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      menuButton?.focus();
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--foreground)]">
      <a href="#main-content" className="skip-link">Skip to content</a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-width)] flex-col border-r border-[var(--border)] bg-[var(--surface)] lg:flex">
        <SidebarContent groups={groups} activeHref={activeItem?.href} user={user} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-[2px] lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      <div
        id="mobile-navigation"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        inert={!mobileOpen}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] flex-col border-r border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-pop)] transition-transform duration-200 lg:hidden ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
          className="btn btn-ghost btn-icon absolute right-3 top-4"
        >
          <X size={18} aria-hidden="true" />
        </button>
        <SidebarContent groups={groups} activeHref={activeItem?.href} user={user} onNavigate={() => setMobileOpen(false)} />
      </div>

      <div className="flex min-h-screen flex-col lg:pl-[var(--sidebar-width)]">
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 w-full max-w-[88rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                ref={menuButtonRef}
                type="button"
                onClick={() => setMobileOpen(true)}
                className="btn btn-secondary btn-icon lg:hidden"
                aria-label="Open menu"
                aria-expanded={mobileOpen}
                aria-controls="mobile-navigation"
              >
                <Menu size={18} aria-hidden="true" />
              </button>
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm text-[var(--muted)]">
                <span className="hidden sm:inline">Workspace</span>
                <span aria-hidden="true" className="hidden sm:inline">/</span>
                <span className="truncate font-medium text-[var(--foreground)]" aria-current="page">{activeItem?.label || 'Workspace'}</span>
              </nav>
            </div>

            <div className="flex items-center gap-2">
              {user && <NotificationBell />}
              <button
                type="button"
                onClick={toggleTheme}
                className="btn btn-secondary btn-icon"
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
              >
                {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
              </button>
            </div>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
          <div className={`page-in mx-auto w-full ${contentFullWidth ? 'max-w-none px-3 py-4 sm:px-4 sm:py-6 lg:px-5' : 'max-w-[88rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8'}`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
