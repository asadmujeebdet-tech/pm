-- Internal App & Task Management schema for Supabase
-- Run this in Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.user_role AS ENUM ('admin', 'member');
CREATE TYPE public.account_status AS ENUM ('active', 'inactive');
CREATE TYPE public.app_platform AS ENUM ('android', 'ios', 'both');
CREATE TYPE public.app_status AS ENUM ('active', 'inactive', 'discontinued');
CREATE TYPE public.app_update_type AS ENUM ('new_features', 'improvements', 'bug_fixes', 'maintenance');
CREATE TYPE public.app_update_status AS ENUM ('planned', 'in_development', 'testing', 'released');
CREATE TYPE public.board_member_role AS ENUM ('admin', 'member');
CREATE TYPE public.card_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text,
  role public.user_role NOT NULL DEFAULT 'member',
  status public.account_status NOT NULL DEFAULT 'active',
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_hash text;

CREATE TABLE IF NOT EXISTS public.app_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_sessions_profile_id ON public.app_sessions(profile_id);
CREATE INDEX IF NOT EXISTS idx_app_sessions_expires_at ON public.app_sessions(expires_at);

CREATE TABLE IF NOT EXISTS public.apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  package_name text,
  platform public.app_platform NOT NULL DEFAULT 'both',
  icon_url text,
  description text,
  google_play_url text,
  play_store_account text,
  app_url text,
  apple_store_url text,
  current_version_name text,
  current_version_code text,
  latest_release_date timestamptz,
  status public.app_status NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, profile_id)
);

-- Each app has exactly one responsible user; one user may own multiple apps.
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_members_one_user_per_app
  ON public.app_members(app_id);

CREATE TABLE IF NOT EXISTS public.app_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  version_name text NOT NULL,
  version_code text NOT NULL,
  release_date timestamptz,
  title text NOT NULL,
  description text,
  update_type public.app_update_type NOT NULL DEFAULT 'improvements',
  status public.app_update_status NOT NULL DEFAULT 'planned',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  app_id uuid REFERENCES public.apps(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.board_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.board_member_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.board_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  title text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.board_sections(id) ON DELETE CASCADE,
  app_id uuid REFERENCES public.apps(id) ON DELETE SET NULL,
  app_update_id uuid REFERENCES public.app_updates(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  priority public.card_priority NOT NULL DEFAULT 'medium',
  due_date timestamptz,
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.card_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  label text NOT NULL,
  color text DEFAULT '#3b82f6',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, label)
);

CREATE TABLE IF NOT EXISTS public.card_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS public.card_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  filename text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  file_size bigint NOT NULL DEFAULT 0,
  external_url text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_board_member(p_board_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.board_members
    WHERE board_id = p_board_id AND profile_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_app_member(p_app_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.app_members
    WHERE app_id = p_app_id AND profile_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER apps_set_updated_at
BEFORE UPDATE ON public.apps
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER app_updates_set_updated_at
BEFORE UPDATE ON public.app_updates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER boards_set_updated_at
BEFORE UPDATE ON public.boards
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER board_sections_set_updated_at
BEFORE UPDATE ON public.board_sections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER cards_set_updated_at
BEFORE UPDATE ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER card_comments_set_updated_at
BEFORE UPDATE ON public.card_comments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER card_attachments_set_updated_at
BEFORE UPDATE ON public.card_attachments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_all_authenticated"
ON public.profiles
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "profiles_update_own_or_admin"
ON public.profiles
FOR UPDATE
USING (id = auth.uid() OR public.is_admin())
WITH CHECK (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles_insert_self"
ON public.profiles
FOR INSERT
WITH CHECK (id = auth.uid());

CREATE POLICY "apps_select_authenticated"
ON public.apps
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "apps_manage_admin_only"
ON public.apps
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "app_members_select_authenticated"
ON public.app_members
FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND (profile_id = auth.uid() OR public.is_admin() OR public.is_app_member(app_id))
);

CREATE POLICY "app_members_manage_admin"
ON public.app_members
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "app_updates_select_authenticated"
ON public.app_updates
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "app_updates_manage_admin_or_app_member"
ON public.app_updates
FOR ALL
USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.app_members
    WHERE app_members.app_id = app_updates.app_id AND app_members.profile_id = auth.uid()
  )
)
WITH CHECK (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.app_members
    WHERE app_members.app_id = app_updates.app_id AND app_members.profile_id = auth.uid()
  )
);

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

CREATE POLICY "boards_select_authenticated"
ON public.boards
FOR SELECT
USING (
  auth.role() = 'authenticated' AND (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.board_members
      WHERE board_members.board_id = boards.id AND board_members.profile_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.app_members
      WHERE app_members.app_id = boards.app_id AND app_members.profile_id = auth.uid()
    )
  )
);

CREATE POLICY "boards_manage_admin_or_member"
ON public.boards
FOR ALL
USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.board_members
    WHERE board_members.board_id = boards.id AND board_members.profile_id = auth.uid() AND board_members.role = 'admin'
  )
)
WITH CHECK (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.board_members
    WHERE board_members.board_id = boards.id AND board_members.profile_id = auth.uid() AND board_members.role = 'admin'
  )
);

CREATE POLICY "board_members_select_authenticated"
ON public.board_members
FOR SELECT
USING (
  auth.role() = 'authenticated' AND (profile_id = auth.uid() OR public.is_admin())
);

CREATE POLICY "board_members_manage_admin"
ON public.board_members
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "board_sections_select_authenticated"
ON public.board_sections
FOR SELECT
USING (
  auth.role() = 'authenticated' AND public.is_board_member(board_id)
);

CREATE POLICY "board_sections_manage_admin_or_member"
ON public.board_sections
FOR ALL
USING (
  public.is_admin() OR public.is_board_member(board_id)
)
WITH CHECK (
  public.is_admin() OR public.is_board_member(board_id)
);

CREATE POLICY "cards_select_authenticated"
ON public.cards
FOR SELECT
USING (
  auth.role() = 'authenticated' AND (
    public.is_admin() OR public.is_board_member(board_id) OR assignee_id = auth.uid()
  )
);

CREATE POLICY "cards_manage_admin_or_board_member"
ON public.cards
FOR ALL
USING (
  public.is_admin() OR public.is_board_member(board_id)
)
WITH CHECK (
  public.is_admin() OR public.is_board_member(board_id)
);

CREATE POLICY "card_labels_select_authenticated"
ON public.card_labels
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "card_labels_manage_admin_or_board_member"
ON public.card_labels
FOR ALL
USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.cards c
    WHERE c.id = card_labels.card_id AND public.is_board_member(c.board_id)
  )
)
WITH CHECK (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.cards c
    WHERE c.id = card_labels.card_id AND public.is_board_member(c.board_id)
  )
);

CREATE POLICY "card_comments_select_authenticated"
ON public.card_comments
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "card_comments_manage_authorized"
ON public.card_comments
FOR ALL
USING (
  public.is_admin() OR author_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.cards c
    WHERE c.id = card_comments.card_id AND public.is_board_member(c.board_id)
  )
)
WITH CHECK (
  public.is_admin() OR author_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.cards c
    WHERE c.id = card_comments.card_id AND public.is_board_member(c.board_id)
  )
);

CREATE POLICY "card_attachments_select_authenticated"
ON public.card_attachments
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "card_attachments_manage_authorized"
ON public.card_attachments
FOR ALL
USING (
  public.is_admin() OR created_by = auth.uid() OR EXISTS (
    SELECT 1 FROM public.cards c
    WHERE c.id = card_attachments.card_id AND public.is_board_member(c.board_id)
  )
)
WITH CHECK (
  public.is_admin() OR created_by = auth.uid() OR EXISTS (
    SELECT 1 FROM public.cards c
    WHERE c.id = card_attachments.card_id AND public.is_board_member(c.board_id)
  )
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_apps_status ON public.apps(status);
CREATE INDEX IF NOT EXISTS idx_app_members_app_id ON public.app_members(app_id);
CREATE INDEX IF NOT EXISTS idx_app_updates_app_id ON public.app_updates(app_id, release_date DESC);
CREATE INDEX IF NOT EXISTS idx_boards_app_id ON public.boards(app_id);
CREATE INDEX IF NOT EXISTS idx_board_members_board_id ON public.board_members(board_id);
CREATE INDEX IF NOT EXISTS idx_board_sections_board_position ON public.board_sections(board_id, position);
CREATE INDEX IF NOT EXISTS idx_cards_board_section ON public.cards(board_id, section_id, position);
CREATE INDEX IF NOT EXISTS idx_cards_assignee ON public.cards(assignee_id);
CREATE INDEX IF NOT EXISTS idx_card_comments_card_id ON public.card_comments(card_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread_created
  ON public.notifications(recipient_id, is_read, created_at DESC);

-- Private media is stored in protected PostgreSQL bytea columns.

-- Ticket, assignment, and private media additions (also shipped as a standalone
-- migration for existing installations in migrations/20261116_tickets_storage.sql).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS avatar_data bytea,
  ADD COLUMN IF NOT EXISTS avatar_mime_type text;

ALTER TABLE public.apps
  ADD COLUMN IF NOT EXISTS icon_path text,
  ADD COLUMN IF NOT EXISTS icon_data bytea,
  ADD COLUMN IF NOT EXISTS icon_mime_type text,
  ADD COLUMN IF NOT EXISTS app_url text,
  ADD COLUMN IF NOT EXISTS play_store_account text;

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS ticket_number bigint;

CREATE SEQUENCE IF NOT EXISTS public.cards_ticket_number_seq;

WITH current_max AS (
  SELECT COALESCE(MAX(ticket_number), 0) AS value FROM public.cards
),
numbered AS (
  SELECT c.id, current_max.value + ROW_NUMBER() OVER (ORDER BY c.created_at, c.id) AS value
  FROM public.cards c
  CROSS JOIN current_max
  WHERE c.ticket_number IS NULL
)
UPDATE public.cards c
SET ticket_number = numbered.value
FROM numbered
WHERE c.id = numbered.id;

SELECT setval(
  'public.cards_ticket_number_seq',
  GREATEST(
    COALESCE((SELECT MAX(ticket_number) FROM public.cards), 0) + 1,
    (SELECT last_value + CASE WHEN is_called THEN 1 ELSE 0 END FROM public.cards_ticket_number_seq)
  ),
  false
);

ALTER TABLE public.cards
  ALTER COLUMN ticket_number SET DEFAULT nextval('public.cards_ticket_number_seq'),
  ALTER COLUMN ticket_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_ticket_number
  ON public.cards(ticket_number);

CREATE OR REPLACE FUNCTION public.prevent_ticket_number_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.ticket_number IS DISTINCT FROM OLD.ticket_number THEN
    RAISE EXCEPTION 'Ticket numbers cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cards_ticket_number_immutable ON public.cards;
CREATE TRIGGER cards_ticket_number_immutable
BEFORE UPDATE OF ticket_number ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.prevent_ticket_number_change();

CREATE TABLE IF NOT EXISTS public.card_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, profile_id)
);

INSERT INTO public.card_assignees (card_id, profile_id, created_by)
SELECT c.id, c.assignee_id, c.created_by
FROM public.cards c
WHERE c.assignee_id IS NOT NULL
ON CONFLICT (card_id, profile_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_card_assignees_profile_card
  ON public.card_assignees(profile_id, card_id);

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

CREATE TABLE IF NOT EXISTS public.card_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, url)
);

INSERT INTO public.card_links (card_id, title, url, created_by)
SELECT ca.card_id, COALESCE(NULLIF(ca.filename, ''), ca.external_url), ca.external_url, ca.created_by
FROM public.card_attachments ca
WHERE ca.external_url IS NOT NULL AND btrim(ca.external_url) <> ''
ON CONFLICT (card_id, url) DO NOTHING;

ALTER TABLE public.card_attachments
  ADD COLUMN IF NOT EXISTS attachment_type text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS storage_data bytea;

UPDATE public.card_attachments
SET attachment_type = CASE
  WHEN lower(filename) LIKE '%.apk' OR mime_type = 'application/vnd.android.package-archive' THEN 'apk'
  WHEN mime_type IN ('image/png', 'image/jpeg', 'image/webp')
    OR lower(filename) LIKE '%.png'
    OR lower(filename) LIKE '%.jpg'
    OR lower(filename) LIKE '%.jpeg'
    OR lower(filename) LIKE '%.webp' THEN 'image'
  ELSE 'file'
END
WHERE lower(filename) LIKE '%.apk'
   OR mime_type = 'application/vnd.android.package-archive'
   OR attachment_type IS NULL
   OR attachment_type NOT IN ('image', 'apk', 'file')
   OR (
     attachment_type = 'image'
     AND NOT (
       COALESCE(mime_type IN ('image/png', 'image/jpeg', 'image/webp'), false)
       OR lower(filename) LIKE '%.png'
       OR lower(filename) LIKE '%.jpg'
       OR lower(filename) LIKE '%.jpeg'
       OR lower(filename) LIKE '%.webp'
     )
   );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'card_attachments_type_check'
      AND conrelid = 'public.card_attachments'::regclass
  ) THEN
    ALTER TABLE public.card_attachments
      ADD CONSTRAINT card_attachments_type_check
      CHECK (attachment_type IN ('image', 'apk', 'file'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_card_links_card_id ON public.card_links(card_id);
CREATE INDEX IF NOT EXISTS idx_card_attachments_card_id ON public.card_attachments(card_id);

CREATE OR REPLACE FUNCTION public.can_access_board(p_board_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.boards b
    WHERE b.id = p_board_id
      AND (
        public.is_admin()
        OR b.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.board_members bm
          WHERE bm.board_id = b.id AND bm.profile_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.app_members am
          WHERE am.app_id = b.app_id AND am.profile_id = auth.uid()
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_edit_board(p_board_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.boards b
    WHERE b.id = p_board_id
      AND (
        public.is_admin()
        OR b.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.board_members bm
          WHERE bm.board_id = b.id AND bm.profile_id = auth.uid()
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_access_card(p_card_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cards c
    WHERE c.id = p_card_id
      AND (
        public.can_access_board(c.board_id)
        OR c.assignee_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.card_assignees ca
          WHERE ca.card_id = c.id AND ca.profile_id = auth.uid()
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

ALTER TABLE public.card_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_own_or_admin"
ON public.profiles
FOR UPDATE
USING (id = auth.uid() OR public.is_admin())
WITH CHECK (id = auth.uid() OR public.is_admin());

REVOKE UPDATE ON public.profiles FROM anon, authenticated;
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, full_name, email, role, status, avatar_url, avatar_path, created_at, updated_at)
  ON public.profiles TO authenticated;
GRANT UPDATE (full_name, avatar_url, avatar_path) ON public.profiles TO authenticated;

REVOKE SELECT ON public.apps FROM anon, authenticated;
GRANT SELECT (
  id, name, package_name, platform, icon_url, description, google_play_url,
  apple_store_url, current_version_name, current_version_code, latest_release_date,
  status, created_by, created_at, updated_at, icon_path, app_url, play_store_account
) ON public.apps TO authenticated;

REVOKE ALL ON public.notifications FROM anon, authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;

REVOKE SELECT ON public.card_attachments FROM anon, authenticated;
GRANT SELECT (
  id, card_id, filename, storage_path, mime_type, file_size, external_url,
  created_by, created_at, updated_at, attachment_type
) ON public.card_attachments TO authenticated;

ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_sessions FROM anon, authenticated;

DROP POLICY IF EXISTS "boards_select_authenticated" ON public.boards;
CREATE POLICY "boards_select_authenticated"
ON public.boards
FOR SELECT
USING (auth.role() = 'authenticated' AND public.can_access_board(id));

DROP POLICY IF EXISTS "board_sections_select_authenticated" ON public.board_sections;
CREATE POLICY "board_sections_select_authenticated"
ON public.board_sections
FOR SELECT
USING (auth.role() = 'authenticated' AND public.can_access_board(board_id));

DROP POLICY IF EXISTS "cards_select_authenticated" ON public.cards;
CREATE POLICY "cards_select_authenticated"
ON public.cards
FOR SELECT
USING (auth.role() = 'authenticated' AND public.can_access_card(id));

DROP POLICY IF EXISTS "card_labels_select_authenticated" ON public.card_labels;
CREATE POLICY "card_labels_select_authenticated"
ON public.card_labels
FOR SELECT
USING (auth.role() = 'authenticated' AND public.can_access_card(card_id));

DROP POLICY IF EXISTS "card_labels_manage_admin_or_board_member" ON public.card_labels;
CREATE POLICY "card_labels_manage_admin_or_board_member"
ON public.card_labels
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.cards c
    WHERE c.id = card_labels.card_id AND public.can_edit_board(c.board_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.cards c
    WHERE c.id = card_labels.card_id AND public.can_edit_board(c.board_id)
  )
);

DROP POLICY IF EXISTS "card_comments_select_authenticated" ON public.card_comments;
CREATE POLICY "card_comments_select_authenticated"
ON public.card_comments
FOR SELECT
USING (auth.role() = 'authenticated' AND public.can_access_card(card_id));

DROP POLICY IF EXISTS "card_comments_manage_authorized" ON public.card_comments;
CREATE POLICY "card_comments_manage_authorized"
ON public.card_comments
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.cards c
    WHERE c.id = card_comments.card_id
      AND public.can_edit_board(c.board_id)
      AND (public.is_admin() OR card_comments.author_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.cards c
    WHERE c.id = card_comments.card_id AND public.can_edit_board(c.board_id)
  )
  AND (public.is_admin() OR card_comments.author_id = auth.uid())
);

DROP POLICY IF EXISTS "card_attachments_select_authenticated" ON public.card_attachments;
CREATE POLICY "card_attachments_select_authenticated"
ON public.card_attachments
FOR SELECT
USING (auth.role() = 'authenticated' AND public.can_access_card(card_id));

DROP POLICY IF EXISTS "card_attachments_manage_authorized" ON public.card_attachments;
CREATE POLICY "card_attachments_manage_authorized"
ON public.card_attachments
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.cards c
    WHERE c.id = card_attachments.card_id AND public.can_edit_board(c.board_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.cards c
    WHERE c.id = card_attachments.card_id AND public.can_edit_board(c.board_id)
  )
);

DROP POLICY IF EXISTS "card_assignees_select_authorized" ON public.card_assignees;
CREATE POLICY "card_assignees_select_authorized"
ON public.card_assignees
FOR SELECT
USING (auth.role() = 'authenticated' AND public.can_access_card(card_id));

DROP POLICY IF EXISTS "card_assignees_manage_board_editors" ON public.card_assignees;
CREATE POLICY "card_assignees_manage_board_editors"
ON public.card_assignees
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.cards c
    WHERE c.id = card_assignees.card_id AND public.can_edit_board(c.board_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.cards c
    WHERE c.id = card_assignees.card_id AND public.can_edit_board(c.board_id)
  )
);

DROP POLICY IF EXISTS "card_links_select_authorized" ON public.card_links;
CREATE POLICY "card_links_select_authorized"
ON public.card_links
FOR SELECT
USING (auth.role() = 'authenticated' AND public.can_access_card(card_id));

DROP POLICY IF EXISTS "card_links_manage_board_editors" ON public.card_links;
CREATE POLICY "card_links_manage_board_editors"
ON public.card_links
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.cards c
    WHERE c.id = card_links.card_id AND public.can_edit_board(c.board_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.cards c
    WHERE c.id = card_links.card_id AND public.can_edit_board(c.board_id)
  )
);
