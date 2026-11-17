'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireActiveProfile } from '@/lib/auth';
import { queryDb, withDbTransaction } from '@/lib/db';
import { canAccessCard } from '@/lib/permissions';
import { sanitizeDescription } from '@/lib/rich-text';
import { createStoragePath, readTicketAttachment } from '@/lib/uploads';
import { sanitizeImageUrl } from '@/lib/play-store';
import { insertNotifications } from '@/lib/notification-writes';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CARD_PRIORITIES = ['low', 'medium', 'high', 'urgent', 'critical'];

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function readDate(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? undefined
    : date.toISOString();
}

function readAssigneeIds(formData) {
  const values = formData.getAll('assigneeIds');
  if (values.length === 0 && formData.get('assigneeId')) values.push(formData.get('assigneeId'));
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizePriority(priority) {
  return priority === 'critical' ? 'urgent' : priority;
}

async function validateAssignees(boardId, assigneeIds, cardId = null, appId = null, actorRole = 'member') {
  if (assigneeIds.length > 20 || assigneeIds.some((id) => !isUuid(id))) return false;
  if (assigneeIds.length === 0) return true;

  if (appId) {
    const appMembers = await queryDb(
      `
        SELECT am.profile_id
        FROM public.app_members am
        JOIN public.profiles p ON p.id = am.profile_id
        JOIN public.boards b ON b.id = $3
        WHERE am.app_id = $1
          AND am.profile_id = ANY($2::uuid[])
          AND p.status = 'active'
          AND ($4::text = 'admin' OR b.app_id = $1 OR EXISTS (
            SELECT 1 FROM public.board_members bm WHERE bm.board_id = b.id AND bm.profile_id = am.profile_id
          ))
      `,
      [appId, assigneeIds, boardId, actorRole]
    );
    return appMembers.length === assigneeIds.length;
  }

  const activeMembers = await queryDb(
    `
      SELECT p.id AS profile_id
      FROM public.profiles p
      WHERE p.id = ANY($2::uuid[])
        AND (
          p.status = 'active'
          OR (
            $3::uuid IS NOT NULL
            AND (
              EXISTS (
                SELECT 1 FROM public.card_assignees ca
                WHERE ca.card_id = $3 AND ca.profile_id = p.id
              )
              OR EXISTS (
                SELECT 1 FROM public.cards c
                WHERE c.id = $3 AND c.assignee_id = p.id
              )
            )
          )
        )
        AND (
          $4::text = 'admin'
          OR EXISTS (
            SELECT 1 FROM public.board_members bm
            WHERE bm.board_id = $1 AND bm.profile_id = p.id
          )
          OR EXISTS (
            SELECT 1 FROM public.boards b
            JOIN public.app_members am ON am.app_id = b.app_id
            WHERE b.id = $1 AND am.profile_id = p.id
          )
        )
    `,
    [boardId, assigneeIds, cardId, actorRole]
  );
  return activeMembers.length === assigneeIds.length;
}

async function validateApp(appId, profile = null, boardId = null) {
  if (!appId) return true;
  if (!isUuid(appId)) return false;
  const apps = await queryDb(
    `SELECT id FROM public.apps WHERE id = $1 AND (
      $2 = 'admin'
      OR EXISTS (
        SELECT 1 FROM public.app_members am
        WHERE am.app_id = public.apps.id AND am.profile_id = $3
      )
      OR EXISTS (
        SELECT 1
        FROM public.boards b
        WHERE b.id = $4
          AND b.app_id = public.apps.id
          AND (
            b.created_by = $3
            OR EXISTS (
              SELECT 1 FROM public.board_members bm
              WHERE bm.board_id = b.id AND bm.profile_id = $3
            )
            OR EXISTS (
              SELECT 1 FROM public.app_members am
              WHERE am.app_id = b.app_id AND am.profile_id = $3
            )
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.app_members owner
        JOIN public.board_members bm
          ON bm.board_id = $4 AND bm.profile_id = owner.profile_id
        WHERE owner.app_id = public.apps.id
      )
    ) LIMIT 1`,
    [appId, profile?.role || 'member', profile?.id || null, boardId]
  );
  return Boolean(apps[0]);
}

function getDescription(formData) {
  const raw = String(formData.get('description') || '');
  if (raw.length > 50000) return { error: 'The description must be 50,000 characters or fewer.' };
  try {
    return { value: sanitizeDescription(raw) || null };
  } catch (error) {
    return { error: error.message };
  }
}

function safeOriginalFilename(value) {
  return String(value || 'attachment')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 255) || 'attachment';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isMentioned(content, member) {
  const candidates = [member.full_name, member.email]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return candidates.some((candidate) => {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])@${escapeRegExp(candidate)}(?=$|[^\\p{L}\\p{N}_])`, 'iu');
    return pattern.test(content);
  });
}

async function requireBoardEditor(boardId, profile) {
  const boards = await queryDb(
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
          OR EXISTS (
            SELECT 1 FROM public.app_members am WHERE am.app_id = b.app_id AND am.profile_id = $2
          )
        )
      LIMIT 1
    `,
    [boardId, profile.id, profile.role]
  );
  return boards[0] || null;
}

async function requireBoardAdmin(boardId, profile) {
  const boards = await queryDb(
    `
      SELECT b.id
      FROM public.boards b
      WHERE b.id = $1
        AND (
          $3 = 'admin'
          OR b.created_by = $2
          OR EXISTS (
            SELECT 1 FROM public.board_members bm
            WHERE bm.board_id = b.id AND bm.profile_id = $2 AND bm.role = 'admin'
          )
        )
      LIMIT 1
    `,
    [boardId, profile.id, profile.role]
  );
  return boards[0] || null;
}

async function requireEditableCard(cardId, profile) {
  const cards = await queryDb(
    `
      SELECT c.id, c.board_id, c.section_id, c.position, c.title, c.ticket_number,
        c.priority, c.due_date, c.app_id, c.assignee_id, c.updated_at
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
            SELECT 1 FROM public.app_members am WHERE am.app_id = b.app_id AND am.profile_id = $2
          )
        )
      LIMIT 1
    `,
    [cardId, profile.id, profile.role]
  );
  return cards[0] || null;
}

function formatStageDuration(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function revalidateBoard(boardId) {
  revalidatePath('/boards');
  revalidatePath(`/boards/${boardId}`);
  revalidatePath('/my-tasks');
  revalidatePath('/overview');
}

export async function createBoard(previousState, formData) {
  const profile = await requireActiveProfile();
  const name = String(formData.get('name') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const appId = String(formData.get('appId') || '').trim();

  if (!name || name.length > 100) {
    return { success: false, message: 'Enter a board name between 1 and 100 characters.' };
  }
  if (description.length > 1000) {
    return { success: false, message: 'The description must be 1,000 characters or fewer.' };
  }
  if (!(await validateApp(appId, profile))) return { success: false, message: 'Choose an application assigned to your account.' };

  const boards = await queryDb(
    `
      WITH new_board AS (
        INSERT INTO public.boards (name, description, app_id, created_by)
        VALUES ($1, $2, $4, $3)
        RETURNING id
      ),
      add_creator AS (
        INSERT INTO public.board_members (board_id, profile_id, role)
        SELECT id, $3, 'admin' FROM new_board
      ),
      add_default_sections AS (
        INSERT INTO public.board_sections (board_id, title, position)
        SELECT new_board.id, defaults.title, defaults.position - 1
        FROM new_board
        CROSS JOIN unnest(ARRAY[
          'Planning',
          'Development',
          'QA',
          'Marketing',
          'Uploaded at Developer Account',
          'Completed'
        ]::text[])
          WITH ORDINALITY AS defaults(title, position)
      )
      SELECT id FROM new_board
    `,
    [name, description || null, profile.id, appId || null]
  );

  const boardId = boards[0]?.id;
  if (!boardId) throw new Error('The database did not return the created board.');
  revalidatePath('/boards');
  revalidatePath('/overview');
  return { success: true, message: 'Board created.', boardId };
}

export async function createSection(boardId, title) {
  const profile = await requireActiveProfile();
  const cleanTitle = String(title || '').trim();
  if (!isUuid(boardId)) return { success: false, message: 'Invalid board.' };
  if (!cleanTitle || cleanTitle.length > 80) {
    return { success: false, message: 'Enter a list name between 1 and 80 characters.' };
  }
  if (!(await requireBoardEditor(boardId, profile))) {
    return { success: false, message: 'You do not have permission to change this board.' };
  }

  const sections = await queryDb(
    `
      INSERT INTO public.board_sections (board_id, title, position)
      VALUES (
        $1,
        $2,
        (SELECT COALESCE(MAX(position) + 1, 0) FROM public.board_sections WHERE board_id = $1)
      )
      RETURNING id, board_id, title, position
    `,
    [boardId, cleanTitle]
  );
  revalidateBoard(boardId);
  return { success: true, section: sections[0] };
}

export async function renameSection(sectionId, title) {
  const profile = await requireActiveProfile();
  const cleanTitle = String(title || '').trim();
  if (!isUuid(sectionId)) return { success: false, message: 'Invalid list.' };
  if (!cleanTitle || cleanTitle.length > 80) {
    return { success: false, message: 'Enter a list name between 1 and 80 characters.' };
  }

  const sections = await queryDb(
    'SELECT id, board_id FROM public.board_sections WHERE id = $1 LIMIT 1',
    [sectionId]
  );
  const section = sections[0];
  if (!section || !(await requireBoardEditor(section.board_id, profile))) {
    return { success: false, message: 'You do not have permission to change this list.' };
  }

  await queryDb(
    'UPDATE public.board_sections SET title = $2 WHERE id = $1',
    [sectionId, cleanTitle]
  );
  revalidateBoard(section.board_id);
  return { success: true };
}

export async function deleteSection(sectionId) {
  const profile = await requireActiveProfile();
  if (profile.role !== 'admin') return { success: false, message: 'Only admins can delete board lists.' };
  if (!isUuid(sectionId)) return { success: false, message: 'Invalid list.' };

  const sections = await queryDb(
    'DELETE FROM public.board_sections WHERE id = $1 RETURNING board_id',
    [sectionId]
  );
  const section = sections[0];
  if (!section) return { success: false, message: 'List not found.' };

  revalidateBoard(section.board_id);
  return { success: true, message: 'List deleted.' };
}

export async function renameOverviewStage(stageKey, title) {
  const profile = await requireActiveProfile();
  if (profile.role !== 'admin') return { success: false, message: 'Only admins can rename stages.' };

  const currentKey = String(stageKey || '').trim().toLowerCase();
  const cleanTitle = String(title || '').trim();
  if (!currentKey || currentKey.length > 80) return { success: false, message: 'Invalid stage.' };
  if (!cleanTitle || cleanTitle.length > 80) {
    return { success: false, message: 'Enter a stage name between 1 and 80 characters.' };
  }

  const result = await withDbTransaction(async (client) => {
    const source = await client.query(
      'SELECT id, board_id FROM public.board_sections WHERE lower(btrim(title)) = $1 FOR UPDATE',
      [currentKey]
    );
    if (source.rows.length === 0) return { notFound: true, sections: [] };

    const sectionIds = source.rows.map((section) => section.id);
    const conflicts = await client.query(
      `
        SELECT existing.id
        FROM public.board_sections source
        JOIN public.board_sections existing
          ON existing.board_id = source.board_id
         AND existing.id <> source.id
         AND lower(btrim(existing.title)) = lower($2)
          AND lower(btrim(existing.title)) <> $3
        WHERE source.id = ANY($1::uuid[])
        LIMIT 1
      `,
      [sectionIds, cleanTitle, currentKey]
    );
    if (conflicts.rows.length > 0) return { conflict: true, sections: [] };

    await client.query(
      'UPDATE public.card_stage_history SET stage_title = $2 WHERE left_at IS NULL AND section_id = ANY($1::uuid[])',
      [sectionIds, cleanTitle]
    );
    const updated = await client.query(
      'UPDATE public.board_sections SET title = $2 WHERE id = ANY($1::uuid[]) RETURNING board_id',
      [sectionIds, cleanTitle]
    );
    return { sections: updated.rows };
  });
  if (result.notFound) return { success: false, message: 'Stage not found.' };
  if (result.conflict) {
    return { success: false, message: 'That stage name is already used by another stage on a board.' };
  }

  for (const boardId of new Set(result.sections.map((section) => section.board_id))) revalidateBoard(boardId);
  return { success: true, message: 'Stage renamed.' };
}

export async function deleteOverviewStage(stageKey) {
  const profile = await requireActiveProfile();
  if (profile.role !== 'admin') return { success: false, message: 'Only admins can delete stages.' };

  const currentKey = String(stageKey || '').trim().toLowerCase();
  if (!currentKey || currentKey.length > 80) return { success: false, message: 'Invalid stage.' };

  const sections = await queryDb(
    'DELETE FROM public.board_sections WHERE lower(btrim(title)) = $1 RETURNING board_id',
    [currentKey]
  );
  if (sections.length === 0) return { success: false, message: 'Stage not found.' };

  for (const boardId of new Set(sections.map((section) => section.board_id))) revalidateBoard(boardId);
  return { success: true, message: 'Stage and its tickets deleted.' };
}

export async function reorderOverviewStages(stageKeys) {
  const profile = await requireActiveProfile();
  if (profile.role !== 'admin') return { success: false, message: 'Only admins can reorder stages.' };
  if (!Array.isArray(stageKeys)) return { success: false, message: 'Invalid stage order.' };

  const orderedKeys = stageKeys.map((key) => String(key || '').trim().toLowerCase());
  if (orderedKeys.some((key) => !key || key.length > 80) || new Set(orderedKeys).size !== orderedKeys.length) {
    return { success: false, message: 'Invalid stage order.' };
  }

  const result = await withDbTransaction(async (client) => {
    const sections = await client.query(
      'SELECT id, board_id, title FROM public.board_sections FOR UPDATE'
    );
    const stageKeysInDatabase = new Set(sections.rows.map((section) => section.title.trim().toLowerCase()));
    if (
      orderedKeys.length !== stageKeysInDatabase.size
      || orderedKeys.some((key) => !stageKeysInDatabase.has(key))
    ) {
      return { invalid: true, boardIds: [] };
    }

    await client.query(
      `
        WITH requested_order AS (
          SELECT stage_key, stage_position
          FROM unnest($1::text[]) WITH ORDINALITY AS item(stage_key, stage_position)
        )
        UPDATE public.board_sections section
        SET position = requested_order.stage_position::integer - 1
        FROM requested_order
        WHERE lower(btrim(section.title)) = requested_order.stage_key
      `,
      [orderedKeys]
    );
    return { boardIds: [...new Set(sections.rows.map((section) => section.board_id))] };
  });
  if (result.invalid) return { success: false, message: 'The stages changed. Refresh and try again.' };

  for (const boardId of result.boardIds) revalidateBoard(boardId);
  return { success: true, message: 'Stage order saved.' };
}

export async function addBoardMember(boardId, memberId) {
  const profile = await requireActiveProfile();
  if (!isUuid(boardId) || !isUuid(memberId)) {
    return { success: false, message: 'Choose a valid board and member.' };
  }
  if (!(await requireBoardAdmin(boardId, profile))) {
    return { success: false, message: 'Only board admins can manage members.' };
  }

  const members = await queryDb(
    "SELECT id FROM public.profiles WHERE id = $1 AND status = 'active' LIMIT 1",
    [memberId]
  );
  if (!members[0]) return { success: false, message: 'Choose an active workspace member.' };

  await queryDb(
    `
      INSERT INTO public.board_members (board_id, profile_id, role)
      VALUES ($1, $2, 'member')
      ON CONFLICT (board_id, profile_id) DO NOTHING
    `,
    [boardId, memberId]
  );
  revalidateBoard(boardId);
  return { success: true };
}

export async function removeBoardMember(boardId, memberId) {
  const profile = await requireActiveProfile();
  if (!isUuid(boardId) || !isUuid(memberId)) {
    return { success: false, message: 'Choose a valid board and member.' };
  }
  if (!(await requireBoardAdmin(boardId, profile))) {
    return { success: false, message: 'Only board admins can manage members.' };
  }

  const boards = await queryDb(
    'SELECT created_by FROM public.boards WHERE id = $1 LIMIT 1',
    [boardId]
  );
  if (!boards[0]) return { success: false, message: 'Board not found.' };
  if (boards[0].created_by === memberId) {
    return { success: false, message: 'The board creator cannot be removed.' };
  }

  const result = await queryDb(
    `
      WITH removed AS (
        DELETE FROM public.board_members bm
        USING public.boards b
        WHERE b.id = $1
          AND bm.board_id = b.id
          AND bm.profile_id = $2
          AND bm.profile_id <> b.created_by
        RETURNING bm.board_id, bm.profile_id
      ),
      unassign_cards AS (
        UPDATE public.cards c
        SET assignee_id = NULL
        FROM removed
        WHERE c.board_id = removed.board_id
          AND c.assignee_id = removed.profile_id
      ),
      unassign_many AS (
        DELETE FROM public.card_assignees ca
        USING removed
        WHERE ca.card_id IN (
          SELECT c.id FROM public.cards c WHERE c.board_id = removed.board_id
        )
          AND ca.profile_id = removed.profile_id
      )
      SELECT profile_id FROM removed
    `,
    [boardId, memberId]
  );
  if (!result[0]) {
    return { success: false, message: 'That member is no longer on this board.' };
  }
  revalidateBoard(boardId);
  return { success: true };
}

export async function createCard(sectionId, formData) {
  const profile = await requireActiveProfile();
  const canManageTicketFields = profile.role === 'admin';
  const title = String(formData.get('title') || '').trim();
  const description = getDescription(formData);
  const submittedPriority = canManageTicketFields ? String(formData.get('priority') || 'medium') : 'medium';
  const priority = normalizePriority(submittedPriority);
  const dueDateValue = canManageTicketFields ? String(formData.get('dueDate') || '') : '';
  const assigneeIds = canManageTicketFields ? readAssigneeIds(formData) : [];
  const appId = canManageTicketFields ? String(formData.get('appId') || '') : '';
  const dueDate = readDate(dueDateValue);

  if (!isUuid(sectionId)) return { success: false, message: 'Invalid list.' };
  if (!title || title.length > 200) {
    return { success: false, message: 'Enter a card title between 1 and 200 characters.' };
  }
  if (description.error) return { success: false, message: description.error };
  if (!CARD_PRIORITIES.includes(submittedPriority)) {
    return { success: false, message: 'Choose a valid priority.' };
  }
  if (dueDate === undefined) return { success: false, message: 'Choose a valid due date.' };

  const sections = await queryDb(
    'SELECT id, board_id FROM public.board_sections WHERE id = $1 LIMIT 1',
    [sectionId]
  );
  const section = sections[0];
  if (!section || !(await requireBoardEditor(section.board_id, profile))) {
    return { success: false, message: 'You do not have permission to add cards to this list.' };
  }

  if (!(await validateApp(appId, profile, section.board_id))) return { success: false, message: 'Choose an application assigned to your account or linked to this board.' };
  if (!(await validateAssignees(section.board_id, assigneeIds, null, appId, profile.role))) {
    return { success: false, message: 'Choose the user assigned to this app, or an active member of this board.' };
  }

  const appRows = appId ? await queryDb('SELECT name FROM public.apps WHERE id = $1 LIMIT 1', [appId]) : [];
  const appLabel = appRows[0]?.name || 'General board';
  const card = await withDbTransaction(async (client) => {
    if (profile.role === 'admin' && assigneeIds.length > 0) {
      await client.query(
        `
          INSERT INTO public.board_members (board_id, profile_id, role)
          SELECT $1, selected.profile_id, 'member'
          FROM unnest($2::uuid[]) AS selected(profile_id)
          ON CONFLICT (board_id, profile_id) DO NOTHING
        `,
        [section.board_id, assigneeIds]
      );
    }
    const cards = await client.query(
      `
        INSERT INTO public.cards
          (board_id, section_id, app_id, title, description, priority, due_date, assignee_id, created_by, position)
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          (SELECT COALESCE(MAX(position) + 1, 0) FROM public.cards WHERE section_id = $2)
        )
        RETURNING id, ticket_number
      `,
      [
        section.board_id,
        sectionId,
        appId || null,
        title,
        description.value || null,
        priority,
        dueDate,
        assigneeIds[0] || null,
        profile.id,
      ]
    );
    const createdCard = cards.rows[0];
    if (!createdCard) throw new Error('The database did not return the created ticket.');
    await client.query(
      `
        INSERT INTO public.card_stage_history (card_id, section_id, stage_title, moved_by)
        SELECT $1, s.id, s.title, $3 FROM public.board_sections s WHERE s.id = $2
      `,
      [createdCard.id, sectionId, profile.id]
    );
    if (assigneeIds.length > 0) {
      await client.query(
        `
          INSERT INTO public.card_assignees (card_id, profile_id, created_by)
          SELECT $1, selected.profile_id, $3
          FROM unnest($2::uuid[]) AS selected(profile_id)
        `,
        [createdCard.id, assigneeIds, profile.id]
      );
      await insertNotifications(client, {
        recipientIds: assigneeIds,
        cardId: createdCard.id,
        title: 'New ticket assigned',
        message: `Ticket #${String(createdCard.ticket_number).padStart(3, '0')} · ${title} · App: ${appLabel} · Assigned by ${profile.full_name || profile.email}.`,
        type: 'assignment',
        eventKey: `ticket-assigned:${createdCard.id}:${assigneeIds.slice().sort().join(',')}`,
      });
    }
    return createdCard;
  });

  revalidateBoard(section.board_id);
  return {
    success: true,
    message: `Ticket #${String(card.ticket_number).padStart(3, '0')} created.`,
    cardId: card.id,
    ticketNumber: card.ticket_number,
  };
}

export async function updateCard(cardId, formData) {
  const profile = await requireActiveProfile();
  if (!isUuid(cardId)) return { success: false, message: 'Invalid card.' };

  const card = await requireEditableCard(cardId, profile);
  if (!card) return { success: false, message: 'You do not have permission to edit this card.' };

  const canManageTicketFields = profile.role === 'admin';
  const title = String(formData.get('title') || '').trim();
  const description = getDescription(formData);
  const currentAssignees = await queryDb(
    `
      SELECT profile_id FROM public.card_assignees WHERE card_id = $1
      UNION
      SELECT assignee_id AS profile_id FROM public.cards
      WHERE id = $1 AND assignee_id IS NOT NULL
    `,
    [cardId]
  );
  const currentAssigneeIds = currentAssignees.map((item) => item.profile_id);
  const submittedPriority = canManageTicketFields
    ? String(formData.get('priority') || 'medium')
    : card.priority;
  const priority = normalizePriority(submittedPriority);
  const dueDateValue = canManageTicketFields ? String(formData.get('dueDate') || '') : '';
  const assigneeIds = canManageTicketFields ? readAssigneeIds(formData) : currentAssigneeIds;
  const appId = canManageTicketFields ? String(formData.get('appId') || '') : card.app_id || '';
  const dueDate = canManageTicketFields ? readDate(dueDateValue) : card.due_date;

  if (!title || title.length > 200) {
    return { success: false, message: 'Enter a card title between 1 and 200 characters.' };
  }
  if (description.error) return { success: false, message: description.error };
  if (!CARD_PRIORITIES.includes(submittedPriority)) {
    return { success: false, message: 'Choose a valid priority.' };
  }
  if (canManageTicketFields) {
    if (dueDate === undefined) return { success: false, message: 'Choose a valid due date.' };
    if (!(await validateApp(appId, profile, card.board_id))) return { success: false, message: 'Choose an application assigned to your account or linked to this board.' };
    if (!(await validateAssignees(card.board_id, assigneeIds, cardId, appId, profile.role))) {
      return { success: false, message: 'Choose the user assigned to this app, or an active member of this board.' };
    }
  }
  const appRows = appId ? await queryDb('SELECT name FROM public.apps WHERE id = $1 LIMIT 1', [appId]) : [];
  const appLabel = appRows[0]?.name || 'General board';
  const addedAssignees = assigneeIds.filter((id) => !currentAssigneeIds.includes(id));
  const priorityChanged = priority !== card.priority;
  const currentDueDate = card.due_date ? new Date(card.due_date).toISOString().slice(0, 10) : null;
  const nextDueDate = dueDate ? new Date(dueDate).toISOString().slice(0, 10) : null;
  const dueDateChanged = currentDueDate !== nextDueDate;

  await withDbTransaction(async (client) => {
    if (profile.role === 'admin' && assigneeIds.length > 0) {
      await client.query(
        `
          INSERT INTO public.board_members (board_id, profile_id, role)
          SELECT $1, selected.profile_id, 'member'
          FROM unnest($2::uuid[]) AS selected(profile_id)
          ON CONFLICT (board_id, profile_id) DO NOTHING
        `,
        [card.board_id, assigneeIds]
      );
    }
    await client.query('DELETE FROM public.card_assignees WHERE card_id = $1', [cardId]);
    await client.query(
      `
        UPDATE public.cards
        SET title = $2, description = $3, priority = $4, due_date = $5,
            assignee_id = $6, app_id = $7
        WHERE id = $1
      `,
      [cardId, title, description.value || null, priority, dueDate, assigneeIds[0] || null, appId || null]
    );
    if (assigneeIds.length > 0) {
      await client.query(
        `
          INSERT INTO public.card_assignees (card_id, profile_id, created_by)
          SELECT $1, selected.profile_id, $3
          FROM unnest($2::uuid[]) AS selected(profile_id)
        `,
        [cardId, assigneeIds, profile.id]
      );
    }

    if (addedAssignees.length > 0) {
      await insertNotifications(client, {
        recipientIds: addedAssignees,
        cardId,
        title: 'Added to a ticket',
        message: `You were added to ticket #${String(card.ticket_number).padStart(3, '0')} · ${title} · App: ${appLabel} · Assigned by ${profile.full_name || profile.email}.`,
        type: 'assignment',
        eventKey: `ticket-assignment:${cardId}:${addedAssignees.slice().sort().join(',')}:${card.updated_at ? new Date(card.updated_at).toISOString() : 'initial'}`,
      });
    }

    if (priorityChanged || dueDateChanged) {
      const changes = [];
      if (priorityChanged) changes.push(`priority changed to ${priority === 'urgent' ? 'critical' : priority}`);
      if (dueDateChanged) changes.push(nextDueDate ? `due date set to ${nextDueDate}` : 'due date cleared');
      await insertNotifications(client, {
        recipientIds: assigneeIds,
        cardId,
        title: 'Ticket details updated',
        message: `Ticket #${String(card.ticket_number).padStart(3, '0')} · ${title}: ${changes.join(' and ')}.`,
        type: 'ticket_update',
        eventKey: `ticket-update:${cardId}:${randomUUID()}`,
      });
    }
  });
  revalidateBoard(card.board_id);
  return { success: true, message: 'Card saved.' };
}

export async function deleteCard(cardId) {
  const profile = await requireActiveProfile();
  if (!isUuid(cardId)) return { success: false, message: 'Invalid card.' };
  if (profile.role !== 'admin') {
    return { success: false, message: 'Only administrators can delete tickets.' };
  }
  const card = await requireEditableCard(cardId, profile);
  if (!card) return { success: false, message: 'You do not have permission to delete this card.' };

  await queryDb('DELETE FROM public.cards WHERE id = $1', [cardId]);
  revalidateBoard(card.board_id);
  return { success: true, message: 'Ticket deleted.' };
}

export async function moveCard(cardId, targetSectionId, targetPosition) {
  const profile = await requireActiveProfile();
  if (!isUuid(cardId) || !isUuid(targetSectionId)) {
    return { success: false, message: 'Invalid card or list.' };
  }
  if (!Number.isInteger(targetPosition) || targetPosition < 0) {
    return { success: false, message: 'Invalid card position.' };
  }

  const card = await requireEditableCard(cardId, profile);
  if (!card) return { success: false, message: 'You do not have permission to move this card.' };
  const targetSections = await queryDb(
    'SELECT id, title FROM public.board_sections WHERE id = $1 AND board_id = $2 LIMIT 1',
    [targetSectionId, card.board_id]
  );
  if (!targetSections[0]) return { success: false, message: 'The destination list is not on this board.' };

  const sourceCards = await queryDb(
    'SELECT id FROM public.cards WHERE section_id = $1 ORDER BY position, created_at',
    [card.section_id]
  );
  const targetCards = card.section_id === targetSectionId
    ? sourceCards
    : await queryDb(
      'SELECT id FROM public.cards WHERE section_id = $1 ORDER BY position, created_at',
      [targetSectionId]
    );

  const sourceIds = sourceCards.map((item) => item.id);
  const targetIds = targetCards.map((item) => item.id);
  let orderedChanges;

  if (card.section_id === targetSectionId) {
    const reorderedIds = sourceIds.filter((id) => id !== cardId);
    const insertAt = Math.min(targetPosition, reorderedIds.length);
    reorderedIds.splice(insertAt, 0, cardId);
    orderedChanges = reorderedIds.map((id, position) => ({
      id,
      section_id: targetSectionId,
      position,
    }));
  } else {
    const remainingSourceIds = sourceIds.filter((id) => id !== cardId);
    const destinationIds = targetIds.filter((id) => id !== cardId);
    const insertAt = Math.min(targetPosition, destinationIds.length);
    destinationIds.splice(insertAt, 0, cardId);
    orderedChanges = [
      ...remainingSourceIds.map((id, position) => ({
        id,
        section_id: card.section_id,
        position,
      })),
      ...destinationIds.map((id, position) => ({
        id,
        section_id: targetSectionId,
        position,
      })),
    ];
  }

  await withDbTransaction(async (client) => {
    await client.query(
      `
        UPDATE public.cards AS c
        SET section_id = changes.section_id, position = changes.position
        FROM jsonb_to_recordset($1::jsonb) AS changes(id uuid, section_id uuid, position integer)
        WHERE c.id = changes.id AND c.board_id = $2
      `,
      [JSON.stringify(orderedChanges), card.board_id]
    );
    if (card.section_id !== targetSectionId) {
      const closed = await client.query(
        `
          UPDATE public.card_stage_history
          SET left_at = now()
          WHERE card_id = $1 AND left_at IS NULL
          RETURNING stage_title, entered_at, left_at
        `,
        [cardId]
      );
      await client.query(
        `
          INSERT INTO public.card_stage_history (card_id, section_id, stage_title, moved_by)
          VALUES ($1, $2, $3, $4)
        `,
        [cardId, targetSectionId, targetSections[0].title, profile.id]
      );

      const previous = closed.rows[0];
      const spent = previous
        ? ` after ${formatStageDuration(new Date(previous.left_at) - new Date(previous.entered_at))} in ${previous.stage_title}`
        : '';
      const ticketLabel = `#${String(card.ticket_number).padStart(3, '0')} · ${card.title}`;
      const mover = profile.full_name || profile.email;
      const moveKey = randomUUID();

      // Notify every active admin (except the person who moved it).
      const admins = await client.query(
        "SELECT id FROM public.profiles WHERE role = 'admin' AND status = 'active' AND id <> $1",
        [profile.id]
      );
      await insertNotifications(client, {
        recipientIds: admins.rows.map((item) => item.id),
        cardId,
        title: 'Card moved to a new stage',
        message: `${mover} moved ticket ${ticketLabel} from ${previous?.stage_title || 'another stage'} to ${targetSections[0].title}${spent}.`,
        type: 'status',
        eventKey: `ticket-moved-admin:${cardId}:${moveKey}`,
      });

      // Notify assignees as before.
      const recipients = await client.query(
        `
          SELECT profile_id FROM public.card_assignees WHERE card_id = $1
          UNION
          SELECT assignee_id AS profile_id FROM public.cards
          WHERE id = $1 AND assignee_id IS NOT NULL
        `,
        [cardId]
      );
      await insertNotifications(client, {
        recipientIds: recipients.rows.map((item) => item.profile_id).filter((id) => id !== profile.id),
        cardId,
        title: 'Ticket status changed',
        message: `Ticket ${ticketLabel} moved to ${targetSections[0].title}.`,
        type: 'status',
        eventKey: `ticket-status:${cardId}:${moveKey}`,
      });
    }
  });
  revalidateBoard(card.board_id);
  return { success: true };
}

export async function getCardComments(cardId) {
  const profile = await requireActiveProfile();
  if (!isUuid(cardId)) return { success: false, message: 'Invalid card.' };
  if (!(await canAccessCard(cardId, profile))) {
    return { success: false, message: 'You cannot view comments for this ticket.' };
  }

  const comments = await queryDb(
    `
      SELECT cc.id, cc.content, cc.created_at, p.id AS author_id,
        p.full_name AS author_name, p.avatar_path AS author_avatar_path
      FROM public.card_comments cc
      JOIN public.profiles p ON p.id = cc.author_id
      WHERE cc.card_id = $1
      ORDER BY cc.created_at
    `,
    [cardId]
  );
  return { success: true, comments };
}

export async function getCardDetails(cardId) {
  const profile = await requireActiveProfile();
  if (!isUuid(cardId) || !(await canAccessCard(cardId, profile))) {
    return { success: false, message: 'You do not have permission to view this ticket.' };
  }

  const cards = await queryDb(
    `
      SELECT c.id, c.board_id, c.section_id, c.ticket_number, c.title, c.description,
        c.priority, c.due_date, c.app_id, c.created_at, c.updated_at,
        b.name AS board_name, s.title AS section_name,
        a.name AS app_name, a.icon_url AS app_icon_url,
        CASE WHEN a.icon_data IS NOT NULL THEN a.icon_path END AS app_icon_path
      FROM public.cards c
      JOIN public.boards b ON b.id = c.board_id
      JOIN public.board_sections s ON s.id = c.section_id
      LEFT JOIN public.apps a ON a.id = c.app_id
      WHERE c.id = $1
      LIMIT 1
    `,
    [cardId]
  );
  const card = cards[0];
  if (!card) return { success: false, message: 'Ticket not found.' };

  const [assignees, comments, attachments, links, mentionableMembers] = await Promise.all([
    queryDb(
      `
        SELECT DISTINCT p.id, p.full_name,
          CASE WHEN p.avatar_data IS NOT NULL THEN p.avatar_path END AS avatar_path
        FROM public.profiles p
        WHERE (
            EXISTS (
              SELECT 1 FROM public.card_assignees ca
              WHERE ca.card_id = $1 AND ca.profile_id = p.id
            )
            OR (
              p.id = (SELECT c.assignee_id FROM public.cards c WHERE c.id = $1)
              AND NOT EXISTS (
                SELECT 1 FROM public.card_assignees ca
                WHERE ca.card_id = $1 AND ca.profile_id = p.id
              )
            )
          )
        ORDER BY p.full_name
      `,
      [cardId]
    ),
    queryDb(
      `
        SELECT cc.id, cc.content, cc.created_at, p.id AS author_id,
          p.full_name AS author_name,
          CASE WHEN p.avatar_data IS NOT NULL THEN p.avatar_path END AS author_avatar_path
        FROM public.card_comments cc
        JOIN public.profiles p ON p.id = cc.author_id
        WHERE cc.card_id = $1
        ORDER BY cc.created_at
      `,
      [cardId]
    ),
    queryDb(
      `
        SELECT id, filename, mime_type, file_size, attachment_type, created_at,
          storage_data IS NOT NULL AS available
        FROM public.card_attachments
        WHERE card_id = $1 AND external_url IS NULL
        ORDER BY created_at
      `,
      [cardId]
    ),
    queryDb(
      `
        SELECT id, title, url, created_at
        FROM public.card_links
        WHERE card_id = $1
        ORDER BY created_at
      `,
      [cardId]
    ),
    queryDb(
      `
        SELECT DISTINCT p.id, p.full_name, p.email,
          CASE WHEN p.avatar_data IS NOT NULL THEN p.avatar_path END AS avatar_path
        FROM public.profiles p
        JOIN public.cards c ON c.id = $1
        JOIN public.boards b ON b.id = c.board_id
        WHERE p.status = 'active'
          AND (
            p.role = 'admin'
            OR EXISTS (
              SELECT 1 FROM public.board_members bm
              WHERE bm.board_id = b.id AND bm.profile_id = p.id
            )
            OR EXISTS (
              SELECT 1 FROM public.app_members am
              WHERE am.app_id = c.app_id AND am.profile_id = p.id
            )
            OR c.assignee_id = p.id
            OR EXISTS (
              SELECT 1 FROM public.card_assignees ca
              WHERE ca.card_id = c.id AND ca.profile_id = p.id
            )
          )
        ORDER BY p.full_name, p.email
      `,
      [cardId]
    ),
  ]);
  const safeLinks = links.filter((link) => {
    try {
      return ['http:', 'https:'].includes(new URL(link.url).protocol);
    } catch {
      return false;
    }
  });

  return {
    success: true,
    card: {
      ...card,
      app_id: profile.role === 'admin' ? card.app_id : null,
      app_name: profile.role === 'admin' ? card.app_name : null,
      app_icon_url: profile.role === 'admin' ? sanitizeImageUrl(card.app_icon_url) : null,
      app_icon_path: profile.role === 'admin' ? card.app_icon_path : null,
      priority: profile.role === 'admin' ? card.priority : null,
      due_date: profile.role === 'admin' ? card.due_date : null,
      assignees: profile.role === 'admin' ? assignees : [],
      description: sanitizeDescription(card.description),
      comments,
      attachments,
      links: safeLinks,
      mentionable_members: mentionableMembers,
      can_comment: true,
    },
  };
}

export async function addCardComment(cardId, content) {
  const profile = await requireActiveProfile();
  const text = String(content || '').trim();
  if (!isUuid(cardId)) return { success: false, message: 'Invalid card.' };
  if (!text || text.length > 2000) {
    return { success: false, message: 'Enter a comment between 1 and 2,000 characters.' };
  }

  if (!(await canAccessCard(cardId, profile))) {
    return { success: false, message: 'You do not have permission to comment on this card.' };
  }
  const cards = await queryDb(
    `
      SELECT c.id, c.board_id, c.ticket_number, c.title
      FROM public.cards c
      WHERE c.id = $1
      LIMIT 1
    `,
    [cardId]
  );
  const card = cards[0];
  if (!card) return { success: false, message: 'Ticket not found.' };
  const comment = await withDbTransaction(async (client) => {
    const comments = await client.query(
      `
        INSERT INTO public.card_comments (card_id, author_id, content)
        VALUES ($1, $2, $3)
        RETURNING id, content, created_at
      `,
      [cardId, profile.id, text]
    );
    const recipients = await client.query(
      `
        SELECT DISTINCT p.id, p.full_name, p.email,
          (
            c.assignee_id = p.id
            OR EXISTS (
              SELECT 1 FROM public.card_assignees ca
              WHERE ca.card_id = c.id AND ca.profile_id = p.id
            )
          ) AS is_assigned
        FROM public.cards c
        JOIN public.boards b ON b.id = c.board_id
        JOIN public.profiles p ON p.status = 'active'
        WHERE c.id = $1
          AND p.id <> $2
          AND (
            EXISTS (
              SELECT 1 FROM public.board_members bm
              WHERE bm.board_id = b.id AND bm.profile_id = p.id
            )
            OR EXISTS (
              SELECT 1 FROM public.app_members am
              WHERE am.app_id = c.app_id AND am.profile_id = p.id
            )
            OR c.assignee_id = p.id
            OR EXISTS (
              SELECT 1 FROM public.card_assignees ca
              WHERE ca.card_id = c.id AND ca.profile_id = p.id
            )
            OR p.role = 'admin'
          )
      `,
      [cardId, profile.id]
    );
    const mentioned = recipients.rows.filter((member) => isMentioned(text, member));
    const mentionedIds = new Set(mentioned.map((member) => member.id));
    const commentRecipients = recipients.rows
      .filter((member) => member.is_assigned && !mentionedIds.has(member.id))
      .map((member) => member.id);
    const eventKey = `ticket-comment:${comments.rows[0].id}`;
    const preview = text.replace(/\s+/g, ' ').slice(0, 160);
    await insertNotifications(client, {
      recipientIds: commentRecipients,
      cardId,
      title: 'New ticket comment',
      message: `New comment on ticket #${String(card.ticket_number).padStart(3, '0')} · ${card.title}: ${preview}`,
      type: 'comment',
      eventKey,
    });
    await insertNotifications(client, {
      recipientIds: mentioned.map((member) => member.id),
      cardId,
      title: 'You were mentioned',
      message: `${profile.full_name || profile.email} mentioned you on ticket #${String(card.ticket_number).padStart(3, '0')} · ${card.title}: ${preview}`,
      type: 'mention',
      eventKey,
    });
    return comments.rows[0];
  });
  revalidateBoard(card.board_id);
  return {
    success: true,
    comment: {
      ...comment,
      author_id: profile.id,
      author_name: profile.full_name,
      author_avatar_path: profile.avatar_path || null,
    },
  };
}

export async function addCardLink(cardId, title, urlValue) {
  const profile = await requireActiveProfile();
  if (!isUuid(cardId)) return { success: false, message: 'Choose a valid ticket.' };
  const card = await requireEditableCard(cardId, profile);
  if (!card) return { success: false, message: 'You do not have permission to edit this ticket.' };

  const cleanTitle = String(title || '').trim();
  const inputUrl = String(urlValue || '').trim();
  if (!cleanTitle || cleanTitle.length > 120 || inputUrl.length > 2048) {
    return { success: false, message: 'Enter a link title (up to 120 characters) and a valid URL.' };
  }

  let url;
  try {
    const parsedUrl = new URL(inputUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
      throw new Error('Unsupported URL.');
    }
    url = parsedUrl.toString();
  } catch {
    return { success: false, message: 'Enter a valid http or https URL.' };
  }

  const links = await queryDb(
    `
      INSERT INTO public.card_links (card_id, title, url, created_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (card_id, url) DO NOTHING
      RETURNING id, title, url, created_at
    `,
    [cardId, cleanTitle, url, profile.id]
  );
  if (!links[0]) return { success: false, message: 'This URL is already attached to the ticket.' };

  revalidateBoard(card.board_id);
  return { success: true, link: links[0] };
}

export async function deleteCardLink(linkId) {
  const profile = await requireActiveProfile();
  if (!isUuid(linkId)) return { success: false, message: 'Choose a valid link.' };
  const links = await queryDb(
    `
      SELECT cl.id, c.id AS card_id, c.board_id
      FROM public.card_links cl
      JOIN public.cards c ON c.id = cl.card_id
      WHERE cl.id = $1
      LIMIT 1
    `,
    [linkId]
  );
  const link = links[0];
  if (!link || !(await requireEditableCard(link.card_id, profile))) {
    return { success: false, message: 'You do not have permission to remove this link.' };
  }
  await queryDb('DELETE FROM public.card_links WHERE id = $1', [linkId]);
  revalidateBoard(link.board_id);
  return { success: true };
}

export async function addCardAttachment(cardId, formData) {
  const profile = await requireActiveProfile();
  if (!isUuid(cardId)) return { success: false, message: 'Choose a valid ticket.' };
  const card = await requireEditableCard(cardId, profile);
  if (!card) return { success: false, message: 'You do not have permission to edit this ticket.' };

  const file = formData.get('file');
  let validatedFile;
  try {
    validatedFile = await readTicketAttachment(file);
  } catch (error) {
    return { success: false, message: error.message };
  }

  const storagePath = createStoragePath(cardId, file);
  const attachments = await queryDb(
    `
      INSERT INTO public.card_attachments
        (card_id, filename, storage_path, mime_type, file_size, attachment_type, created_by, storage_data)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, filename, mime_type, file_size, attachment_type, created_at,
        storage_data IS NOT NULL AS available
    `,
    [
      cardId,
      safeOriginalFilename(file.name),
      storagePath,
      validatedFile.contentType,
      file.size,
      validatedFile.attachmentType,
      profile.id,
      validatedFile.bytes,
    ]
  );

  revalidateBoard(card.board_id);
  return { success: true, attachment: attachments[0] };
}

export async function deleteCardAttachment(attachmentId) {
  const profile = await requireActiveProfile();
  if (!isUuid(attachmentId)) return { success: false, message: 'Choose a valid attachment.' };
  const attachments = await queryDb(
    `
      SELECT ca.id, ca.storage_path, ca.external_url, c.id AS card_id, c.board_id
      FROM public.card_attachments ca
      JOIN public.cards c ON c.id = ca.card_id
      WHERE ca.id = $1
      LIMIT 1
    `,
    [attachmentId]
  );
  const attachment = attachments[0];
  if (!attachment || !(await requireEditableCard(attachment.card_id, profile))) {
    return { success: false, message: 'You do not have permission to remove this attachment.' };
  }

  await queryDb('DELETE FROM public.card_attachments WHERE id = $1', [attachmentId]);
  revalidateBoard(attachment.board_id);
  return { success: true, message: '' };
}

export async function updateBoard(boardId, formData) {
  const profile = await requireActiveProfile();
  if (profile.role !== 'admin') return { success: false, message: 'Only admins can edit boards.' };
  if (!isUuid(boardId)) return { success: false, message: 'Choose a valid board.' };

  const name = String(formData.get('name') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const appId = String(formData.get('appId') || '').trim();

  if (!name || name.length > 100) return { success: false, message: 'Enter a board name between 1 and 100 characters.' };
  if (description.length > 1000) return { success: false, message: 'The description must be 1,000 characters or fewer.' };
  if (!(await validateApp(appId, profile, boardId))) return { success: false, message: 'Choose a valid application.' };

  const rows = await queryDb(
    `UPDATE public.boards SET name = $2, description = $3, app_id = $4, updated_at = now()
     WHERE id = $1 RETURNING id`,
    [boardId, name, description || null, appId || null]
  );
  if (!rows[0]) return { success: false, message: 'Board not found.' };

  revalidatePath('/boards');
  revalidatePath(`/boards/${boardId}`);
  revalidatePath('/overview');
  revalidatePath('/reports');
  return { success: true, message: 'Board updated.' };
}

export async function deleteBoard(boardId) {
  const profile = await requireActiveProfile();
  if (profile.role !== 'admin') return { success: false, message: 'Only admins can delete boards.' };
  if (!isUuid(boardId)) return { success: false, message: 'Choose a valid board.' };

  const rows = await queryDb('DELETE FROM public.boards WHERE id = $1 RETURNING id', [boardId]);
  if (!rows[0]) return { success: false, message: 'Board not found.' };

  revalidatePath('/boards');
  revalidatePath('/overview');
  revalidatePath('/my-tasks');
  revalidatePath('/reports');
  return { success: true, message: 'Board deleted.' };
}
