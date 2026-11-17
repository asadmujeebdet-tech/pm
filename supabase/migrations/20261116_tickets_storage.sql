-- Additive, data-preserving migration for ticket numbering, assignments, and private media.
-- Safe to run after the existing schema; it does not drop existing tables or records.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS avatar_data bytea,
  ADD COLUMN IF NOT EXISTS avatar_mime_type text;

ALTER TABLE public.apps
  ADD COLUMN IF NOT EXISTS icon_path text,
  ADD COLUMN IF NOT EXISTS icon_data bytea,
  ADD COLUMN IF NOT EXISTS icon_mime_type text;

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
  status, created_by, created_at, updated_at, icon_path
) ON public.apps TO authenticated;

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

