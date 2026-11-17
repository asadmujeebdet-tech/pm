-- Enforce one responsible user per app while allowing a user to own multiple apps.
-- Keep the earliest existing assignment if legacy data contains multiple users for one app.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY app_id ORDER BY created_at, id) AS position
  FROM public.app_members
)
DELETE FROM public.app_members am
USING ranked
WHERE am.id = ranked.id AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_members_one_user_per_app
  ON public.app_members(app_id);

CREATE INDEX IF NOT EXISTS idx_app_members_profile_app
  ON public.app_members(profile_id, app_id);

-- Ensure existing members responsible for an app can access its linked boards.
-- Access is still checked by the server against app_members; no boards are made public.
