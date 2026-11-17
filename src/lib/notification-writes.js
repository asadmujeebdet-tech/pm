import 'server-only';

import { randomUUID } from 'node:crypto';

export async function insertNotifications(client, {
  recipientIds,
  cardId,
  title,
  message,
  type,
  eventKey = randomUUID(),
}) {
  const recipients = [...new Set((recipientIds || []).filter(Boolean))];
  if (recipients.length === 0) return;

  await client.query(
    `
      INSERT INTO public.notifications
        (recipient_id, card_id, title, message, notification_type, event_key)
      SELECT recipient_id, $2, $3, $4, $5, $6
      FROM unnest($1::uuid[]) AS selected(recipient_id)
      ON CONFLICT (recipient_id, event_key) DO NOTHING
    `,
    [recipients, cardId, title, message, type, eventKey]
  );
}
