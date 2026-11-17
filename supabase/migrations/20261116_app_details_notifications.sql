-- Data-preserving app profile and notification additions.

ALTER TABLE public.apps
  ADD COLUMN IF NOT EXISTS app_url text;

UPDATE public.apps
SET app_url = google_play_url
WHERE app_url IS NULL
  AND google_play_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  notification_type text NOT NULL,
  event_key text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_recipient_event_key UNIQUE (recipient_id, event_key),
  CONSTRAINT notifications_type_check CHECK (
    notification_type IN ('assignment', 'status', 'comment', 'mention', 'ticket_update')
  )
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread_created
  ON public.notifications(recipient_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own"
ON public.notifications
FOR SELECT
USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own"
ON public.notifications
FOR UPDATE
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());

REVOKE ALL ON public.notifications FROM anon, authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;
GRANT SELECT (app_url) ON public.apps TO authenticated;
