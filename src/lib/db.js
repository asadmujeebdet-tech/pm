import 'server-only';
import { Pool } from 'pg';
import { sanitizeDescription } from '@/lib/rich-text';
import { sanitizeAppUrl, sanitizeImageUrl, sanitizePlayStoreUrl } from '@/lib/play-store';

const connectionString = (process.env.DATABASE_URL || '').trim();

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 3,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    })
  : null;

export function hasDatabaseConnection() {
  return Boolean(connectionString);
}

export async function queryDb(query, params = []) {
  if (!pool) {
    throw new Error('Database connection is not configured.');
  }

  const result = await pool.query(query, params);
  return result.rows;
}

export async function withDbTransaction(callback) {
  if (!pool) throw new Error('Database connection is not configured.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Database transaction failed and could not be rolled back.');
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function getOverviewStats(profile) {
  const [appStats, totalMembers, totalTasks] = await Promise.all([
    queryDb(
      `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE a.status = 'active')::int AS active
        FROM public.apps a
        WHERE $1 = 'admin' OR EXISTS (
          SELECT 1 FROM public.app_members am
          WHERE am.app_id = a.id AND am.profile_id = $2
        )
      `,
      [profile.role, profile.id]
    ),
    queryDb(
      `
        SELECT CASE WHEN $1 = 'admin' THEN
          (SELECT COUNT(*)::int FROM public.profiles)
        ELSE (
          SELECT COUNT(DISTINCT visible_members.profile_id)::int
          FROM (
            SELECT bm.profile_id
            FROM public.board_members bm
            JOIN public.boards b ON b.id = bm.board_id
            WHERE b.created_by = $2
              OR EXISTS (
                SELECT 1 FROM public.board_members own_membership
                WHERE own_membership.board_id = b.id AND own_membership.profile_id = $2
              )
              OR EXISTS (
                SELECT 1 FROM public.app_members own_app
                WHERE own_app.app_id = b.app_id AND own_app.profile_id = $2
              )
            UNION
            SELECT am.profile_id
            FROM public.app_members am
            WHERE am.profile_id = $2
          ) visible_members
        ) END::int AS count
      `,
      [profile.role, profile.id]
    ),
    queryDb(
      `
        SELECT COUNT(*)::int AS count
        FROM public.cards c
        JOIN public.boards b ON b.id = c.board_id
        WHERE $1 = 'admin'
          OR b.created_by = $2
          OR EXISTS (
            SELECT 1 FROM public.board_members bm
            WHERE bm.board_id = b.id AND bm.profile_id = $2
          )
          OR EXISTS (
            SELECT 1 FROM public.app_members am
            WHERE am.app_id = b.app_id AND am.profile_id = $2
          )
      `,
      [profile.role, profile.id]
    ),
  ]);

  return {
    totalApps: Number(appStats[0]?.total || 0),
    activeApps: Number(appStats[0]?.active || 0),
    totalMembers: Number(totalMembers[0]?.count || 0),
    totalTasks: Number(totalTasks[0]?.count || 0),
  };
}

export async function getApps(profile = null) {
  const apps = await queryDb(`
    SELECT id, name, package_name, platform, status, current_version_name, latest_release_date,
      (SELECT am.profile_id FROM public.app_members am WHERE am.app_id = apps.id LIMIT 1) AS assigned_user_id,
      (SELECT p.full_name FROM public.app_members am JOIN public.profiles p ON p.id = am.profile_id WHERE am.app_id = apps.id LIMIT 1) AS assigned_user_name,
      description, icon_url,
      CASE WHEN icon_data IS NOT NULL THEN icon_path END AS icon_path,
      google_play_url, app_url, play_store_account
    FROM public.apps
    WHERE $1::uuid IS NULL OR $2 = 'admin' OR EXISTS (
      SELECT 1 FROM public.app_members am WHERE am.app_id = apps.id AND am.profile_id = $1
    )
    ORDER BY updated_at DESC
  `, [profile?.id || null, profile?.role || 'member']);
  return apps.map((app) => ({
    ...app,
    icon_url: sanitizeImageUrl(app.icon_url),
    app_url: sanitizeAppUrl(app.app_url) || sanitizePlayStoreUrl(app.google_play_url),
    google_play_url: sanitizePlayStoreUrl(app.google_play_url),
  }));
}

export async function getAppDetails(appId, profile) {
  const apps = await queryDb(
    `
      SELECT id, name, package_name, platform, status, current_version_name, latest_release_date,
        (SELECT am.profile_id FROM public.app_members am WHERE am.app_id = apps.id LIMIT 1) AS assigned_user_id,
        description, icon_url, google_play_url, app_url, play_store_account,
        CASE WHEN icon_data IS NOT NULL THEN icon_path END AS icon_path,
        created_at, updated_at
      FROM public.apps
      WHERE id = $1
        AND ($3 = 'admin' OR EXISTS (SELECT 1 FROM public.app_members am WHERE am.app_id = apps.id AND am.profile_id = $2))
      LIMIT 1
    `,
    [appId, profile.id, profile.role]
  );
  const app = apps[0];
  if (!app) return null;

  return {
    ...app,
    icon_url: sanitizeImageUrl(app.icon_url),
    app_url: sanitizeAppUrl(app.app_url) || sanitizePlayStoreUrl(app.google_play_url),
    google_play_url: sanitizePlayStoreUrl(app.google_play_url),
  };
}

export async function getAppDetailsActivity(appId, profile) {
  const visibleCards = `
    FROM public.cards c
    JOIN public.boards b ON b.id = c.board_id
    JOIN public.board_sections s ON s.id = c.section_id
    WHERE c.app_id = $1
      AND (
        $3 = 'admin'
        OR b.created_by = $2
        OR EXISTS (
          SELECT 1 FROM public.board_members bm
          WHERE bm.board_id = b.id AND bm.profile_id = $2
        )
        OR EXISTS (
          SELECT 1 FROM public.app_members am
          WHERE am.app_id = c.app_id AND am.profile_id = $2
        )
        OR c.assignee_id = $2
        OR EXISTS (
          SELECT 1 FROM public.card_assignees ca
          WHERE ca.card_id = c.id AND ca.profile_id = $2
        )
      )
  `;
  const params = [appId, profile.id, profile.role];
  const [ticketCount, statusDistribution, tickets, updates, recentComments] = await Promise.all([
    queryDb(`SELECT COUNT(*)::int AS count ${visibleCards}`, params),
    queryDb(
      `
        SELECT s.title AS status, COUNT(*)::int AS count, MIN(s.position) AS position
        ${visibleCards}
        GROUP BY s.title
        ORDER BY MIN(s.position), s.title
      `,
      params
    ),
    queryDb(
      `
        SELECT c.id, c.ticket_number, c.title, c.priority, c.due_date, c.updated_at,
          b.id AS board_id, b.name AS board_name, s.title AS section_name
        ${visibleCards}
        ORDER BY c.updated_at DESC
        LIMIT 50
      `,
      params
    ),
    queryDb(
      `
        SELECT id, version_name, release_date, title, description, status, created_at
        FROM public.app_updates
        WHERE app_id = $1
        ORDER BY COALESCE(release_date, created_at) DESC
        LIMIT 8
      `,
      [appId]
    ),
    queryDb(
      `
        SELECT cc.id, cc.content, cc.created_at, p.full_name AS author_name,
          c.id AS card_id, c.ticket_number, c.title AS ticket_title, b.id AS board_id
        FROM public.card_comments cc
        JOIN public.cards c ON c.id = cc.card_id
        JOIN public.boards b ON b.id = c.board_id
        JOIN public.profiles p ON p.id = cc.author_id
        WHERE c.app_id = $1
          AND (
            $3 = 'admin'
            OR b.created_by = $2
            OR EXISTS (
              SELECT 1 FROM public.board_members bm
              WHERE bm.board_id = b.id AND bm.profile_id = $2
            )
            OR EXISTS (
              SELECT 1 FROM public.app_members am
              WHERE am.app_id = c.app_id AND am.profile_id = $2
            )
            OR c.assignee_id = $2
            OR EXISTS (
              SELECT 1 FROM public.card_assignees ca
              WHERE ca.card_id = c.id AND ca.profile_id = $2
            )
          )
        ORDER BY cc.created_at DESC
        LIMIT 8
      `,
      params
    ),
  ]);
  const recentActivity = [
    ...recentComments.map((item) => ({ ...item, activity_type: 'comment' })),
    ...updates.map((item) => ({ ...item, activity_type: 'release' })),
  ].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()).slice(0, 10);

  return {
    ticket_count: Number(ticketCount[0]?.count || 0),
    status_distribution: statusDistribution,
    tickets,
    recent_activity: recentActivity,
  };
}

export async function getMembers() {
  return queryDb(`
    SELECT p.id, p.full_name, p.email, p.role, p.status, p.avatar_url,
      CASE WHEN p.avatar_data IS NOT NULL THEN p.avatar_path END AS avatar_path,
      p.created_at,
      COALESCE(ARRAY(SELECT am.app_id FROM public.app_members am WHERE am.profile_id = p.id ORDER BY am.created_at), ARRAY[]::uuid[]) AS assigned_app_ids,
      COALESCE(ARRAY(SELECT bm.board_id FROM public.board_members bm WHERE bm.profile_id = p.id ORDER BY bm.created_at), ARRAY[]::uuid[]) AS assigned_board_ids
    FROM public.profiles p
    ORDER BY p.created_at DESC
  `);
}

export async function getBoardsForMemberManagement() {
  return queryDb(`
    SELECT b.id, b.name, a.name AS app_name
    FROM public.boards b
    LEFT JOIN public.apps a ON a.id = b.app_id
    ORDER BY b.name, b.created_at
  `);
}

export async function getRecentAppActivity(profile) {
  const apps = await queryDb(`
    SELECT a.id, a.name, a.current_version_name, a.latest_release_date, a.status, a.icon_url,
      CASE WHEN a.icon_data IS NOT NULL THEN a.icon_path END AS icon_path
    FROM public.apps a
    WHERE $1 = 'admin' OR EXISTS (
      SELECT 1 FROM public.app_members am
      WHERE am.app_id = a.id AND am.profile_id = $2
    )
    ORDER BY a.latest_release_date DESC NULLS LAST, a.updated_at DESC
    LIMIT 4
  `, [profile.role, profile.id]);
  return apps.map((app) => ({ ...app, icon_url: sanitizeImageUrl(app.icon_url) }));
}

export async function getBoards(profile) {
  return queryDb(
    `
      SELECT
        b.id,
        b.name,
        b.description,
        b.app_id,
        b.updated_at,
        a.name AS app_name,
        a.icon_url AS app_icon_url,
        CASE WHEN a.icon_data IS NOT NULL THEN a.icon_path END AS app_icon_path,
        (
          SELECT COUNT(*)::int
          FROM public.cards c
          WHERE c.board_id = b.id
        ) AS card_count
      FROM public.boards b
      LEFT JOIN public.apps a ON a.id = b.app_id
      WHERE $2 = 'admin'
        OR b.created_by = $1
        OR EXISTS (
          SELECT 1 FROM public.board_members bm
          WHERE bm.board_id = b.id AND bm.profile_id = $1
        )
        OR EXISTS (
          SELECT 1 FROM public.app_members am
          WHERE am.app_id = b.app_id AND am.profile_id = $1
        )
      ORDER BY b.updated_at DESC, b.created_at DESC
    `,
    [profile.id, profile.role]
  );
}

export async function getBoardData(boardId, profile) {
  const boards = await queryDb(
    `
      SELECT
        b.id,
        b.name,
        b.description,
        b.app_id,
        b.created_by,
        b.created_at,
        a.name AS app_name,
        a.icon_url AS app_icon_url,
        CASE WHEN a.icon_data IS NOT NULL THEN a.icon_path END AS app_icon_path,
        (
          $2 = 'admin'
          OR b.created_by = $1
          OR EXISTS (
            SELECT 1 FROM public.board_members bm
            WHERE bm.board_id = b.id AND bm.profile_id = $1
          )
          OR EXISTS (
            SELECT 1 FROM public.app_members am WHERE am.app_id = b.app_id AND am.profile_id = $1
          )
        ) AS can_edit,
        (
          $2 = 'admin'
          OR b.created_by = $1
          OR EXISTS (
            SELECT 1 FROM public.board_members bm
            WHERE bm.board_id = b.id AND bm.profile_id = $1 AND bm.role = 'admin'
          )
        ) AS can_manage_members,
        ($2 = 'admin') AS can_assign_workspace_members,
        ($2 = 'admin') AS can_manage_ticket_fields,
        ($2 = 'admin') AS can_delete_sections
      FROM public.boards b
      LEFT JOIN public.apps a ON a.id = b.app_id
      WHERE b.id = $3
        AND (
          $2 = 'admin'
          OR b.created_by = $1
          OR EXISTS (
            SELECT 1 FROM public.board_members bm
            WHERE bm.board_id = b.id AND bm.profile_id = $1
          )
          OR EXISTS (
            SELECT 1 FROM public.app_members am
            WHERE am.app_id = b.app_id AND am.profile_id = $1
          )
        )
      LIMIT 1
    `,
    [profile.id, profile.role, boardId]
  );

  const board = boards[0];
  if (!board) return null;

  const [sections, cards, members, boardMembers, apps, workspaceMembers] = await Promise.all([
    queryDb(
      `
        SELECT id, board_id, title, position, updated_at
        FROM public.board_sections
        WHERE board_id = $1
        ORDER BY position, created_at
      `,
      [boardId]
    ),
    queryDb(
      `
        SELECT
          c.id,
          c.section_id,
          c.ticket_number,
          c.app_id,
          c.title,
          c.description,
          c.priority,
          c.due_date,
          c.assignee_id,
          c.position,
          c.created_at,
          c.updated_at,
          a.name AS app_name,
          a.icon_url AS app_icon_url,
          CASE WHEN a.icon_data IS NOT NULL THEN a.icon_path END AS app_icon_path,
          p.full_name AS assignee_name,
          (
            SELECT COUNT(*)::int
            FROM public.card_comments cc
            WHERE cc.card_id = c.id
          ) AS comment_count,
          ARRAY(
            SELECT cl.label
            FROM public.card_labels cl
            WHERE cl.card_id = c.id
            ORDER BY cl.created_at
          ) AS labels,
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', assigned.id,
                'full_name', assigned.full_name,
                'avatar_path', assigned.avatar_path
              )
              ORDER BY assigned.full_name
            )
            FROM (
              SELECT ap.id, ap.full_name,
                CASE WHEN ap.avatar_data IS NOT NULL THEN ap.avatar_path END AS avatar_path
              FROM public.card_assignees ca
              JOIN public.profiles ap ON ap.id = ca.profile_id
              WHERE ca.card_id = c.id
              UNION
              SELECT legacy.id, legacy.full_name,
                CASE WHEN legacy.avatar_data IS NOT NULL THEN legacy.avatar_path END AS avatar_path
              FROM public.profiles legacy
              WHERE legacy.id = c.assignee_id
                AND legacy.status = 'active'
                AND NOT EXISTS (
                  SELECT 1 FROM public.card_assignees ca
                  WHERE ca.card_id = c.id AND ca.profile_id = legacy.id
                )
            ) assigned
          ), '[]'::jsonb) AS assignees
        FROM public.cards c
        LEFT JOIN public.apps a ON a.id = c.app_id
        LEFT JOIN public.profiles p ON p.id = c.assignee_id
        WHERE c.board_id = $1
        ORDER BY c.section_id, c.position, c.created_at
      `,
      [boardId]
    ),
    queryDb(
      `
        SELECT DISTINCT p.id, p.full_name, p.email,
          CASE WHEN p.avatar_data IS NOT NULL THEN p.avatar_path END AS avatar_path,
          p.status,
          EXISTS (
            SELECT 1 FROM public.board_members bm
            WHERE bm.board_id = $1 AND bm.profile_id = p.id
          ) AS is_board_member,
          EXISTS (
            SELECT 1
            FROM public.app_members am
            JOIN public.boards b ON b.id = $1 AND b.app_id = am.app_id
            WHERE am.profile_id = p.id
          ) AS is_board_app_member
        FROM public.profiles p
        WHERE p.id IN (
          SELECT bm.profile_id FROM public.board_members bm WHERE bm.board_id = $1
          UNION
          SELECT am.profile_id FROM public.app_members am
          JOIN public.boards b ON b.id = $1 AND b.app_id = am.app_id
          UNION
          SELECT am.profile_id
          FROM public.app_members am
          WHERE am.profile_id = $2
          UNION
          SELECT am.profile_id
          FROM public.app_members am
          JOIN public.board_members bm
            ON bm.board_id = $1 AND bm.profile_id = am.profile_id
        )
        ORDER BY p.full_name, p.email
      `,
      [boardId, profile.id]
    ),
    queryDb(
      `
        SELECT bm.profile_id, bm.role, p.full_name, p.email,
          CASE WHEN p.avatar_data IS NOT NULL THEN p.avatar_path END AS avatar_path,
          p.status
        FROM public.board_members bm
        JOIN public.profiles p ON p.id = bm.profile_id
        WHERE bm.board_id = $1
        ORDER BY p.full_name, p.email
      `,
      [boardId]
    ),
    queryDb(
      `
        SELECT id, name, icon_url,
          (SELECT am.profile_id FROM public.app_members am WHERE am.app_id = apps.id LIMIT 1) AS assigned_user_id,
          CASE WHEN icon_data IS NOT NULL THEN icon_path END AS icon_path,
          status
        FROM public.apps
        WHERE $2 = 'admin'
          OR apps.id = (SELECT b.app_id FROM public.boards b WHERE b.id = $3)
          OR EXISTS (SELECT 1 FROM public.app_members am WHERE am.app_id = apps.id AND am.profile_id = $1)
          OR EXISTS (
            SELECT 1
            FROM public.app_members am
            JOIN public.board_members bm
              ON bm.board_id = $3 AND bm.profile_id = am.profile_id
            WHERE am.app_id = apps.id
          )
        ORDER BY name
      `,
      [profile.id, profile.role, boardId]
    ),
    board.can_manage_members
      ? queryDb(
          `
            SELECT p.id, p.full_name, p.email,
              CASE WHEN p.avatar_data IS NOT NULL THEN p.avatar_path END AS avatar_path,
              p.status
            FROM public.profiles p
            WHERE p.status = 'active'
            ORDER BY p.full_name, p.email
          `
        )
      : Promise.resolve([]),
  ]);

  return {
    ...board,
    app_icon_url: sanitizeImageUrl(board.app_icon_url),
    can_view_ticket_fields: true,
    sections,
    cards: cards.map((card) => ({
      ...card,
      app_icon_url: sanitizeImageUrl(card.app_icon_url),
      description: sanitizeDescription(card.description),
    })),
    members,
    board_members: boardMembers,
    workspace_members: workspaceMembers,
    apps: apps.map((app) => ({ ...app, icon_url: sanitizeImageUrl(app.icon_url) })),
  };
}

export async function getMyTasks(profileId) {
  const tasks = await queryDb(
    `
      SELECT
        c.id,
        c.ticket_number,
        c.title,
        c.description,
        c.priority,
        c.due_date,
        COALESCE(c.app_id, b.app_id) AS app_id,
        a.name AS app_name,
        a.icon_url AS app_icon_url,
        CASE WHEN a.icon_data IS NOT NULL THEN a.icon_path END AS app_icon_path,
        b.id AS board_id,
        b.name AS board_name,
        s.title AS section_name
      FROM public.cards c
      JOIN public.boards b ON b.id = c.board_id
      JOIN public.board_sections s ON s.id = c.section_id
      LEFT JOIN public.apps a ON a.id = COALESCE(c.app_id, b.app_id)
      WHERE c.assignee_id = $1
        OR EXISTS (SELECT 1 FROM public.card_assignees ca WHERE ca.card_id = c.id AND ca.profile_id = $1)
      ORDER BY c.due_date ASC NULLS LAST, c.updated_at DESC
      LIMIT 100
    `,
    [profileId]
  );
  return tasks.map((task) => ({
    ...task,
    app_icon_url: sanitizeImageUrl(task.app_icon_url),
    description: sanitizeDescription(task.description),
  }));
}

// Every card the person can see, with its list, board and assignees, for reporting.
export async function getReportCards(profile) {
  return queryDb(
    `
      SELECT
        c.id,
        c.ticket_number,
        c.title,
        c.priority::text AS priority,
        c.due_date,
        c.updated_at,
        b.id AS board_id,
        b.name AS board_name,
        a.name AS app_name,
        s.title AS section_name,
        s.position AS section_position,
        COALESCE((
          SELECT array_agg(DISTINCT p.full_name ORDER BY p.full_name)
          FROM public.profiles p
          WHERE p.id = c.assignee_id
            OR p.id IN (SELECT ca.profile_id FROM public.card_assignees ca WHERE ca.card_id = c.id)
        ), ARRAY[]::text[]) AS assignees
      FROM public.cards c
      JOIN public.boards b ON b.id = c.board_id
      JOIN public.board_sections s ON s.id = c.section_id
      LEFT JOIN public.apps a ON a.id = b.app_id
      WHERE $2 = 'admin'
        OR b.created_by = $1
        OR EXISTS (SELECT 1 FROM public.board_members bm WHERE bm.board_id = b.id AND bm.profile_id = $1)
        OR EXISTS (SELECT 1 FROM public.app_members am WHERE am.app_id = b.app_id AND am.profile_id = $1)
      ORDER BY c.due_date ASC NULLS LAST
    `,
    [profile.id, profile.role]
  );
}

export async function getReportBoards(profile) {
  return queryDb(
    `
      SELECT b.id, b.name, a.name AS app_name
      FROM public.boards b
      LEFT JOIN public.apps a ON a.id = b.app_id
      WHERE $2 = 'admin'
        OR b.created_by = $1
        OR EXISTS (SELECT 1 FROM public.board_members bm WHERE bm.board_id = b.id AND bm.profile_id = $1)
        OR EXISTS (SELECT 1 FROM public.app_members am WHERE am.app_id = b.app_id AND am.profile_id = $1)
      ORDER BY b.name
    `,
    [profile.id, profile.role]
  );
}

// Ticket counts per person (direct assignee or co-assignee). Finished = Completed/Done/Closed/Released list.
export async function getMemberTicketStats() {
  const rows = await queryDb(`
    WITH assigned AS (
      SELECT c.id, c.due_date, btrim(s.title) AS list_name, x.profile_id
      FROM public.cards c
      JOIN public.board_sections s ON s.id = c.section_id
      JOIN LATERAL (
        SELECT c.assignee_id AS profile_id WHERE c.assignee_id IS NOT NULL
        UNION
        SELECT ca.profile_id FROM public.card_assignees ca WHERE ca.card_id = c.id
      ) x ON true
    )
    SELECT profile_id,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE list_name ~* '^(completed|done|closed|released)$')::int AS done,
      COUNT(*) FILTER (WHERE list_name !~* '^(completed|done|closed|released)$')::int AS open,
      COUNT(*) FILTER (WHERE list_name !~* '^(completed|done|closed|released)$' AND due_date < now())::int AS overdue
    FROM assigned
    GROUP BY profile_id
  `);
  return Object.fromEntries(rows.map((r) => [r.profile_id, r]));
}

// Stage-only home view: every visible card grouped by stage (list) title across boards,
// with the time it has spent in each stage.
export async function getStageBoard(profile) {
  const visibleBoards = `
    ($2 = 'admin'
      OR b.created_by = $1
      OR EXISTS (SELECT 1 FROM public.board_members bm WHERE bm.board_id = b.id AND bm.profile_id = $1)
      OR EXISTS (SELECT 1 FROM public.app_members am WHERE am.app_id = b.app_id AND am.profile_id = $1))
  `;
  const [sections, cards] = await Promise.all([
    queryDb(
      `
        SELECT s.id, s.board_id, s.title, s.position
        FROM public.board_sections s
        JOIN public.boards b ON b.id = s.board_id
        WHERE ${visibleBoards}
        ORDER BY s.position
      `,
      [profile.id, profile.role]
    ),
    queryDb(
      `
        SELECT c.id, c.ticket_number, c.title, c.priority, c.due_date, c.section_id, c.board_id,
          b.name AS board_name, s.title AS stage_title,
          a.name AS app_name,
          COALESCE((
            SELECT json_agg(json_build_object(
              'stage', h.stage_title,
              'entered_at', h.entered_at,
              'left_at', h.left_at
            ) ORDER BY h.entered_at)
            FROM public.card_stage_history h WHERE h.card_id = c.id
          ), '[]'::json) AS history,
          COALESCE((
            SELECT json_agg(p.full_name ORDER BY p.full_name)
            FROM public.profiles p
            WHERE p.id = c.assignee_id
              OR EXISTS (SELECT 1 FROM public.card_assignees ca WHERE ca.card_id = c.id AND ca.profile_id = p.id)
          ), '[]'::json) AS assignees
        FROM public.cards c
        JOIN public.boards b ON b.id = c.board_id
        JOIN public.board_sections s ON s.id = c.section_id
        LEFT JOIN public.apps a ON a.id = COALESCE(c.app_id, b.app_id)
        WHERE ${visibleBoards}
        ORDER BY c.updated_at DESC
        LIMIT 500
      `,
      [profile.id, profile.role]
    ),
  ]);

  const stages = new Map();
  for (const section of sections) {
    const key = section.title.trim().toLowerCase();
    if (!stages.has(key)) stages.set(key, { key, title: section.title.trim(), order: section.position });
    const stage = stages.get(key);
    stage.order = Math.min(stage.order, section.position);
  }
  const ordered = [...stages.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

  // boardId -> { stageKey -> sectionId } so a card can be moved to the same stage on its own board.
  const sectionMap = {};
  for (const section of sections) {
    (sectionMap[section.board_id] ||= {})[section.title.trim().toLowerCase()] = section.id;
  }

  return {
    stages: ordered.map(({ key, title }) => ({ key, title })),
    sectionMap,
    cards: cards.map((card) => ({
      ...card,
      stage_key: card.stage_title.trim().toLowerCase(),
      due_date: card.due_date ? new Date(card.due_date).toISOString() : null,
    })),
  };
}
