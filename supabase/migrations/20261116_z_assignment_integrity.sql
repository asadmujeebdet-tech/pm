-- Preserve the existing one-owner-per-app rule and enforce ticket ownership links.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_members_one_user_per_app
  ON public.app_members(app_id);

CREATE INDEX IF NOT EXISTS idx_app_members_profile_app
  ON public.app_members(profile_id, app_id);

CREATE OR REPLACE FUNCTION public.enforce_card_app_assignment()
RETURNS trigger AS $$
BEGIN
  IF NEW.app_id IS NOT NULL AND NEW.assignee_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.app_members am
       WHERE am.app_id = NEW.app_id AND am.profile_id = NEW.assignee_id
     ) THEN
    RAISE EXCEPTION 'Ticket assignee must own the selected application'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.app_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.card_assignees ca
    WHERE ca.card_id = NEW.id
      AND NOT EXISTS (
        SELECT 1 FROM public.app_members am
        WHERE am.app_id = NEW.app_id AND am.profile_id = ca.profile_id
      )
  ) THEN
    RAISE EXCEPTION 'All ticket assignees must own the selected application'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.enforce_card_assignee_app_assignment()
RETURNS trigger AS $$
DECLARE
  ticket_app_id uuid;
BEGIN
  SELECT c.app_id INTO ticket_app_id
  FROM public.cards c
  WHERE c.id = NEW.card_id;

  IF ticket_app_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.app_members am
       WHERE am.app_id = ticket_app_id AND am.profile_id = NEW.profile_id
     ) THEN
    RAISE EXCEPTION 'Ticket assignee must own the selected application'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.clear_old_app_ticket_assignments()
RETURNS trigger AS $$
DECLARE
  previous_app_id uuid;
  previous_profile_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.profile_id = NEW.profile_id THEN
      RETURN NEW;
    END IF;
    previous_app_id := OLD.app_id;
    previous_profile_id := OLD.profile_id;
  ELSE
    previous_app_id := OLD.app_id;
    previous_profile_id := OLD.profile_id;
    IF NOT EXISTS (SELECT 1 FROM public.apps WHERE id = previous_app_id) THEN
      RETURN OLD;
    END IF;
  END IF;

  DELETE FROM public.card_assignees ca
  USING public.cards c
  WHERE c.id = ca.card_id
    AND c.app_id = previous_app_id
    AND ca.profile_id = previous_profile_id;

  UPDATE public.cards
  SET assignee_id = NULL
  WHERE app_id = previous_app_id AND assignee_id = previous_profile_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS cards_app_assignment_check ON public.cards;
CREATE TRIGGER cards_app_assignment_check
BEFORE INSERT OR UPDATE OF app_id, assignee_id ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.enforce_card_app_assignment();

DROP TRIGGER IF EXISTS card_assignees_app_assignment_check ON public.card_assignees;
CREATE TRIGGER card_assignees_app_assignment_check
BEFORE INSERT OR UPDATE OF card_id, profile_id ON public.card_assignees
FOR EACH ROW EXECUTE FUNCTION public.enforce_card_assignee_app_assignment();

DROP TRIGGER IF EXISTS app_members_clear_old_ticket_assignments_update ON public.app_members;
CREATE TRIGGER app_members_clear_old_ticket_assignments_update
AFTER UPDATE OF profile_id ON public.app_members
FOR EACH ROW EXECUTE FUNCTION public.clear_old_app_ticket_assignments();

DROP TRIGGER IF EXISTS app_members_clear_old_ticket_assignments_delete ON public.app_members;
CREATE TRIGGER app_members_clear_old_ticket_assignments_delete
AFTER DELETE ON public.app_members
FOR EACH ROW EXECUTE FUNCTION public.clear_old_app_ticket_assignments();

REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name, avatar_url, avatar_path) ON public.profiles TO authenticated;

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

COMMIT;
