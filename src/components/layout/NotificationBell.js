'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { getMyNotifications, markAllNotificationsRead, markNotificationRead } from '@/lib/notification-actions';

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await getMyNotifications();
        if (active && result.success) {
          setNotifications(result.notifications);
          setUnreadCount(result.unreadCount);
        }
      } catch (error) {
        console.error('Unable to load notifications:', error);
        if (active) setMessage('Notifications could not be refreshed.');
      }
    };
    void load();
    const intervalId = window.setInterval(() => { void load(); }, 20000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  async function markAllRead() {
    if (pending || unreadCount === 0) return;
    setPending(true);
    setMessage('');
    try {
      const result = await markAllNotificationsRead();
      if (!result.success) {
        setMessage(result.message || 'Could not mark notifications as read.');
        return;
      }
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Unable to mark all notifications as read:', error);
      setMessage('Could not mark notifications as read. Try again.');
    } finally {
      setPending(false);
    }
  }

  async function openNotification(notification) {
    if (!notification.is_read) {
      try {
        const result = await markNotificationRead(notification.id);
        if (!result.success) {
          setMessage(result.message || 'Could not update this notification.');
          return;
        }
        setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true } : item));
        setUnreadCount((current) => Math.max(0, current - 1));
      } catch (error) {
        console.error('Unable to mark notification as read:', error);
        setMessage('Could not update this notification. Try again.');
        return;
      }
    }
    setOpen(false);
    router.push(`/tickets/${notification.board_id}?ticketId=${notification.card_id}`);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((current) => !current); setMessage(''); }}
        className="btn btn-secondary btn-icon relative"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-controls="notification-panel"
      >
        <Bell size={18} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section id="notification-panel" className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-pop)]" aria-label="Notifications">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Notifications</h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{unreadCount} unread</p>
            </div>
            <button type="button" onClick={markAllRead} disabled={pending || unreadCount === 0} className="btn btn-ghost min-h-8 px-2 text-xs">
              <CheckCheck size={14} aria-hidden="true" />
              Mark all read
            </button>
          </header>

          {message && <p role="alert" className="border-b border-[var(--border)] px-4 py-2 text-xs text-[var(--danger)]">{message}</p>}

          <ul className="max-h-[min(70vh,32rem)] divide-y divide-[var(--border)] overflow-y-auto">
            {notifications.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openNotification(item)}
                  className={`w-full px-4 py-3 text-left transition hover:bg-[var(--neutral)] ${item.is_read ? '' : 'bg-[var(--primary-soft)]/50'}`}
                >
                  <span className="flex items-start gap-2">
                    {!item.is_read && <span aria-label="Unread" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[var(--foreground)]">{item.title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">{item.message}</span>
                      <span className="mt-1.5 block truncate text-[11px] text-[var(--primary)]">
                        #{String(item.ticket_number).padStart(3, '0')} · {item.ticket_title} · {item.board_name}
                      </span>
                      <time className="mt-1 block text-[10px] text-[var(--muted)]">{formatDate(item.created_at)}</time>
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {notifications.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-[var(--muted)]">You’re all caught up.</li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
