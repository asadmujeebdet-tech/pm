import 'server-only';

import { queryDb } from '@/lib/db';

export async function canEditBoard(boardId, profile) {
  const rows = await queryDb(
    `
      SELECT b.id
      FROM public.boards b
      WHERE b.id = $1
        AND (
          $3 = 'admin'
          OR b.created_by = $2
          OR EXISTS (
            SELECT 1 FROM public.board_members bm
            WHERE bm.board_id = b.id AND bm.profile_id = $2
          )
        )
      LIMIT 1
    `,
    [boardId, profile.id, profile.role]
  );
  return Boolean(rows[0]);
}

export async function canAccessCard(cardId, profile) {
  const rows = await queryDb(
    `
      SELECT c.id
      FROM public.cards c
      JOIN public.boards b ON b.id = c.board_id
      WHERE c.id = $1
        AND (
          $3 = 'admin'
          OR b.created_by = $2
          OR EXISTS (
            SELECT 1 FROM public.board_members bm
            WHERE bm.board_id = b.id AND bm.profile_id = $2
          )
          OR EXISTS (
            SELECT 1 FROM public.app_members am
            WHERE am.app_id = b.app_id AND am.profile_id = $2
          )
          OR c.assignee_id = $2
          OR EXISTS (
            SELECT 1 FROM public.card_assignees ca
            WHERE ca.card_id = c.id AND ca.profile_id = $2
          )
        )
      LIMIT 1
    `,
    [cardId, profile.id, profile.role]
  );
  return Boolean(rows[0]);
}
