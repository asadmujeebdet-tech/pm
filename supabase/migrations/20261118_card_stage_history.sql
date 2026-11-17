-- Tracks how long each card spends in each stage (board list).
CREATE TABLE IF NOT EXISTS public.card_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.board_sections(id) ON DELETE SET NULL,
  stage_title text NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  moved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS card_stage_history_card_idx ON public.card_stage_history (card_id, entered_at);
CREATE UNIQUE INDEX IF NOT EXISTS card_stage_history_open_idx
  ON public.card_stage_history (card_id) WHERE left_at IS NULL;

-- Backfill: every existing card starts its history in its current stage.
INSERT INTO public.card_stage_history (card_id, section_id, stage_title, entered_at, moved_by)
SELECT c.id, c.section_id, s.title, COALESCE(c.updated_at, c.created_at), c.created_by
FROM public.cards c
JOIN public.board_sections s ON s.id = c.section_id
WHERE NOT EXISTS (SELECT 1 FROM public.card_stage_history h WHERE h.card_id = c.id);
