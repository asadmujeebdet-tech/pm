'use server';

import { requireActiveProfile } from '@/lib/auth';
import { queryDb } from '@/lib/db';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getMyNotifications() {
  const profile = await requireActiveProfile();
  const [unread, notifications] = await Promise.all([
    queryDb(
      'SELECT COUNT(*)::int AS count FROM public.notifications WHERE recipient_id = $1 AND is_read = false',
      [profile.id]
    ),
    queryDb(
      `
        SELECT n.id, n.title, n.message, n.notification_type, n.is_read, n.created_at,
          c.id AS card_id, c.board_id, c.ticket_number, c.title AS ticket_title,
          b.name AS board_name
        FROM public.notifications n
        JOIN public.cards c ON c.id = n.card_id
        JOIN public.boards b ON b.id = c.board_id
        WHERE n.recipient_id = $1
        ORDER BY n.created_at DESC
        LIMIT 40
      `,
      [profile.id]
    ),
  ]);
  return {
    success: true,
    unreadCount: Number(unread[0]?.count || 0),
    notifications,
  };
}

export async function markNotificationRead(notificationId) {
  const profile = await requireActiveProfile();
  if (!UUID_PATTERN.test(String(notificationId || ''))) {
    return { success: false, message: 'Invalid notification.' };
  }

  const updated = await queryDb(
    `
      UPDATE public.notifications
      SET is_read = true
      WHERE id = $1 AND recipient_id = $2 AND is_read = false
      RETURNING id
    `,
    [notificationId, profile.id]
  );
  return { success: true, changed: updated.length > 0 };
}

export async function markAllNotificationsRead() {
  const profile = await requireActiveProfile();
  await queryDb(
    'UPDATE public.notifications SET is_read = true WHERE recipient_id = $1 AND is_read = false',
    [profile.id]
  );
  return { success: true };
}
