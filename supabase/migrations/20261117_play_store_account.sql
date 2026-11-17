ALTER TABLE public.apps
  ADD COLUMN IF NOT EXISTS play_store_account text;

GRANT SELECT (play_store_account) ON public.apps TO authenticated;
