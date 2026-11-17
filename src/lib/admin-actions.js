'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { hashPassword, requireAdmin } from '@/lib/auth';
import { queryDb, withDbTransaction } from '@/lib/db';
import { parsePlayStoreUrl } from '@/lib/play-store';
import { createStoragePath, readProfileImage } from '@/lib/uploads';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readAppIds(formData) {
  const ids = [...new Set(formData.getAll('appIds').map((value) => String(value || '').trim()).filter(Boolean))];
  if (ids.length > 100 || ids.some((id) => !UUID_PATTERN.test(id))) throw new Error('Choose valid applications.');
  return ids;
}

function readBoardIds(formData) {
  const ids = [...new Set(formData.getAll('boardIds').map((value) => String(value || '').trim()).filter(Boolean))];
  if (ids.length > 100 || ids.some((id) => !UUID_PATTERN.test(id))) throw new Error('Choose valid boards.');
  return ids;
}

function readAssignedUserId(formData) {
  const id = String(formData.get('assignedUserId') || '').trim();
  if (!id) return null;
  if (!UUID_PATTERN.test(id)) throw new Error('Choose a valid assigned user.');
  return id;
}

function getOptionalFile(formData, name) {
  const file = formData.get(name);
  return file && typeof file.arrayBuffer === 'function' && file.size > 0 ? file : null;
}

function revalidateMembers() {
  revalidatePath('/members');
  revalidatePath('/boards');
  revalidatePath('/my-tasks');
  revalidatePath('/overview');
  revalidatePath('/apps');
}

function revalidateApps() {
  revalidatePath('/apps');
  revalidatePath('/boards');
  revalidatePath('/overview');
  revalidatePath('/members');
  revalidatePath('/my-tasks');
}

function readOptionalUrl(value, label, image = false) {
  const input = String(value || '').trim();
  if (!input) return null;
  if (input.length > 2048) throw new Error(`${label} must be 2,048 characters or fewer.`);

  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Enter a valid ${label.toLowerCase()}.`);
  }
  const allowedProtocols = image ? ['https:'] : ['http:', 'https:'];
  if (!allowedProtocols.includes(url.protocol) || url.username || url.password) {
    throw new Error(`${label} must be a valid ${image ? 'HTTPS image' : 'web'} URL.`);
  }
  return url.toString();
}

function readOptionalDate(value) {
  const input = String(value || '').trim();
  if (!input) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error('Choose a valid last release date.');
  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input) {
    throw new Error('Choose a valid last release date.');
  }
  return date.toISOString();
}

export async function createMember(_previousState, formData) {
  await requireAdmin();

  const fullName = String(formData.get('fullName') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const role = String(formData.get('role') || 'member');
  const avatarFile = getOptionalFile(formData, 'avatar');
  let appIds;
  let boardIds;
  try {
    appIds = readAppIds(formData);
    boardIds = readBoardIds(formData);
  } catch (error) {
    return { success: false, message: error.message };
  }

  if (!fullName || fullName.length > 100 || !validEmail(email) || password.length < 8) {
    return { success: false, message: 'Enter a name (up to 100 characters), valid email, and password with at least 8 characters.' };
  }
  if (!['admin', 'member'].includes(role)) {
    return { success: false, message: 'Choose a valid role.' };
  }

  let image;
  try {
    if (avatarFile) image = await readProfileImage(avatarFile);
  } catch (error) {
    return { success: false, message: error.message };
  }

  const profileId = randomUUID();
  const avatarPath = image ? createStoragePath(profileId, avatarFile) : null;

  try {
    const passwordHash = await hashPassword(password);
    await withDbTransaction(async (client) => {
      await client.query(
        `
          INSERT INTO public.profiles
            (id, full_name, email, password_hash, role, status, avatar_path, avatar_data, avatar_mime_type)
          VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8)
        `,
        [profileId, fullName, email, passwordHash, role, avatarPath, image?.bytes || null, image?.contentType || null]
      );
      if (appIds.length) {
        const assigned = await client.query(
          `
            INSERT INTO public.app_members (app_id, profile_id)
            SELECT selected.app_id, $2
            FROM unnest($1::uuid[]) AS selected(app_id)
            WHERE NOT EXISTS (SELECT 1 FROM public.app_members existing WHERE existing.app_id = selected.app_id)
            ON CONFLICT (app_id) DO NOTHING
            RETURNING app_id
          `,
          [appIds, profileId]
        );
        if (assigned.rowCount !== appIds.length) throw new Error('One or more selected apps are already assigned. Open the app and change its assigned user there.');
      }
      if (boardIds.length) {
        const assigned = await client.query(
          `
            INSERT INTO public.board_members (board_id, profile_id, role)
            SELECT selected.board_id, $2, 'member'
            FROM unnest($1::uuid[]) AS selected(board_id)
            WHERE EXISTS (SELECT 1 FROM public.boards b WHERE b.id = selected.board_id)
            ON CONFLICT (board_id, profile_id) DO NOTHING
            RETURNING board_id
          `,
          [boardIds, profileId]
        );
        if (assigned.rowCount !== boardIds.length) throw new Error('One or more selected boards no longer exist. Refresh and try again.');
      }
    });
  } catch (error) {
    if (error.code === '23505') return { success: false, message: 'An account with that email already exists.' };
    if (error.message?.includes('selected apps')) return { success: false, message: error.message };
    if (error.message?.includes('selected boards')) return { success: false, message: error.message };
    throw error;
  }

  revalidateMembers();
  return { success: true, message: `Account for ${email} created as ${role}.` };
}

export async function updateMember(memberId, formData) {
  const admin = await requireAdmin();
  if (!UUID_PATTERN.test(String(memberId || ''))) return { success: false, message: 'Choose a valid member.' };

  const fullName = String(formData.get('fullName') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const role = String(formData.get('role') || 'member');
  const avatarFile = getOptionalFile(formData, 'avatar');
  const removeAvatar = formData.get('removeAvatar') === 'on';
  let appIds;
  let boardIds;
  try {
    appIds = readAppIds(formData);
    boardIds = readBoardIds(formData);
  } catch (error) {
    return { success: false, message: error.message };
  }
  if (!fullName || fullName.length > 100 || !validEmail(email)) {
    return { success: false, message: 'Enter a name (up to 100 characters) and a valid email address.' };
  }
  if (!['admin', 'member'].includes(role)) {
    return { success: false, message: 'Choose a valid role.' };
  }

  const currentRows = await queryDb(
    'SELECT id, role, avatar_path FROM public.profiles WHERE id = $1 LIMIT 1',
    [memberId]
  );
  const current = currentRows[0];
  if (!current) return { success: false, message: 'Member not found.' };
  if (memberId === admin.id && current.role === 'admin' && role !== 'admin') {
    const counts = await queryDb("SELECT COUNT(*)::int AS count FROM public.profiles WHERE role = 'admin' AND status = 'active'");
    if (Number(counts[0]?.count || 0) <= 1) {
      return { success: false, message: 'You cannot remove the last active administrator role.' };
    }
  }

  let image;
  try {
    if (avatarFile) image = await readProfileImage(avatarFile);
  } catch (error) {
    return { success: false, message: error.message };
  }

  const newPath = image ? createStoragePath(memberId, avatarFile) : null;
  const avatarPath = newPath || (removeAvatar ? null : current.avatar_path);
  try {
    await withDbTransaction(async (client) => {
      await client.query(
        `
          UPDATE public.profiles
          SET full_name = $2, email = $3, role = $4, avatar_path = $5,
              avatar_data = CASE WHEN $6::boolean THEN $7::bytea ELSE avatar_data END,
              avatar_mime_type = CASE WHEN $6::boolean THEN $8::text ELSE avatar_mime_type END,
              avatar_url = CASE WHEN $6::boolean THEN NULL ELSE avatar_url END
          WHERE id = $1
        `,
        [memberId, fullName, email, role, avatarPath, Boolean(newPath || removeAvatar), image?.bytes || null, image?.contentType || null]
      );
      await client.query('DELETE FROM public.app_members WHERE profile_id = $1 AND NOT (app_id = ANY($2::uuid[]))', [memberId, appIds]);
      if (appIds.length) {
        const assigned = await client.query(
          `
            INSERT INTO public.app_members (app_id, profile_id)
            SELECT selected.app_id, $2
            FROM unnest($1::uuid[]) AS selected(app_id)
            WHERE NOT EXISTS (
              SELECT 1 FROM public.app_members existing
              WHERE existing.app_id = selected.app_id AND existing.profile_id <> $2
            )
            ON CONFLICT (app_id) DO NOTHING
            RETURNING app_id
          `,
          [appIds, memberId]
        );
        const current = await client.query('SELECT COUNT(*)::int AS count FROM public.app_members WHERE profile_id = $1 AND app_id = ANY($2::uuid[])', [memberId, appIds]);
        if (Number(current.rows[0]?.count || 0) !== appIds.length) throw new Error('One or more selected apps belong to another user. Reassign them from the app editor first.');
      }
      await client.query(
        `
          WITH removed AS (
            DELETE FROM public.board_members bm
            USING public.boards b
            WHERE bm.board_id = b.id
              AND bm.profile_id = $1
              AND bm.profile_id <> b.created_by
              AND NOT (bm.board_id = ANY($2::uuid[]))
            RETURNING bm.board_id
          ),
          unassign_cards AS (
            UPDATE public.cards c
            SET assignee_id = NULL
            FROM removed
            WHERE c.board_id = removed.board_id
              AND c.app_id IS NULL
              AND c.assignee_id = $1
            RETURNING c.id
          ),
          unassign_many AS (
            DELETE FROM public.card_assignees ca
            USING public.cards c, removed
            WHERE c.id = ca.card_id
              AND c.board_id = removed.board_id
              AND c.app_id IS NULL
              AND ca.profile_id = $1
            RETURNING ca.card_id
          )
          SELECT board_id FROM removed
        `,
        [memberId, boardIds]
      );
      if (boardIds.length) {
        const assigned = await client.query(
          `
            INSERT INTO public.board_members (board_id, profile_id, role)
            SELECT selected.board_id, $2, 'member'
            FROM unnest($1::uuid[]) AS selected(board_id)
            WHERE EXISTS (SELECT 1 FROM public.boards b WHERE b.id = selected.board_id)
            ON CONFLICT (board_id, profile_id) DO NOTHING
            RETURNING board_id
          `,
          [boardIds, memberId]
        );
        const currentBoards = await client.query(
          'SELECT COUNT(*)::int AS count FROM public.board_members WHERE profile_id = $1 AND board_id = ANY($2::uuid[])',
          [memberId, boardIds]
        );
        if (Number(currentBoards.rows[0]?.count || 0) !== boardIds.length || assigned.rowCount > boardIds.length) {
          throw new Error('One or more selected boards no longer exist. Refresh and try again.');
        }
      }
    });
  } catch (error) {
    if (error.code === '23505') return { success: false, message: 'Another account already uses that email.' };
    if (error.message?.includes('selected apps')) return { success: false, message: error.message };
    if (error.message?.includes('selected boards')) return { success: false, message: error.message };
    throw error;
  }

  revalidateMembers();
  revalidateApps();
  return { success: true, message: 'Member details saved.' };
}

export async function setMemberStatus(memberId, status) {
  const admin = await requireAdmin();
  if (!UUID_PATTERN.test(String(memberId || '')) || !['active', 'inactive'].includes(status)) {
    return { success: false, message: 'Choose a valid member and status.' };
  }
  if (memberId === admin.id && status === 'inactive') {
    return { success: false, message: 'You cannot deactivate your own account.' };
  }

  const members = await queryDb(
    'SELECT id, role, status FROM public.profiles WHERE id = $1 LIMIT 1',
    [memberId]
  );
  const member = members[0];
  if (!member) return { success: false, message: 'Member not found.' };
  if (status === 'inactive' && member.role === 'admin' && member.status === 'active') {
    const counts = await queryDb("SELECT COUNT(*)::int AS count FROM public.profiles WHERE role = 'admin' AND status = 'active'");
    if (Number(counts[0]?.count || 0) <= 1) {
      return { success: false, message: 'You cannot deactivate the last active administrator.' };
    }
  }

  await queryDb('UPDATE public.profiles SET status = $2 WHERE id = $1', [memberId, status]);
  if (status === 'inactive') {
    await queryDb('DELETE FROM public.app_sessions WHERE profile_id = $1', [memberId]);
  }
  revalidateMembers();
  return { success: true, message: `Member ${status === 'active' ? 'activated' : 'deactivated'}.` };
}

export async function deleteMember(memberId) {
  const admin = await requireAdmin();
  if (!UUID_PATTERN.test(String(memberId || ''))) return { success: false, message: 'Choose a valid member.' };
  if (memberId === admin.id) return { success: false, message: 'You cannot delete your own account.' };

  const result = await withDbTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(1796324871)');
    const members = await client.query(
      'SELECT id, full_name, email, role, status FROM public.profiles WHERE id = $1 FOR UPDATE',
      [memberId]
    );
    const member = members.rows[0];
    if (!member) return { success: false, message: 'Member not found.' };

    if (member.role === 'admin' && member.status === 'active') {
      const counts = await client.query(
        "SELECT COUNT(*)::int AS count FROM public.profiles WHERE role = 'admin' AND status = 'active'"
      );
      if (Number(counts.rows[0]?.count || 0) <= 1) {
        return { success: false, message: 'You cannot delete the last active administrator.' };
      }
    }

    await client.query('DELETE FROM public.profiles WHERE id = $1', [memberId]);
    return { success: true, message: `Member "${member.full_name || member.email}" deleted.` };
  });

  if (result.success) revalidateMembers();
  return result;
}

function readAppFields(formData) {
  const name = String(formData.get('name') || '').trim();
  if (!name || name.length > 120) throw new Error('Enter an app name between 1 and 120 characters.');
  const appUrl = readOptionalUrl(formData.get('appUrl'), 'App URL');
  const imageUrl = readOptionalUrl(formData.get('appImageUrl'), 'App Image Address', true);
  const playStoreAccount = String(formData.get('playStoreAccount') || '').trim();
  if (playStoreAccount.length > 254) throw new Error('Play Store account must be 254 characters or fewer.');
  const latestVersion = String(formData.get('latestVersion') || '').trim();
  if (latestVersion.length > 80) throw new Error('Latest version must be 80 characters or fewer.');
  let playStore = null;
  if (appUrl) {
    const parsedUrl = new URL(appUrl);
    if (parsedUrl.hostname === 'play.google.com' && parsedUrl.pathname === '/store/apps/details') {
      playStore = parsePlayStoreUrl(appUrl);
    }
  }
  return {
    name,
    appUrl,
    playStoreAccount,
    imageUrl,
    latestVersion,
    lastRelease: readOptionalDate(formData.get('lastRelease')),
    playStore,
  };
}

export async function createApp(_previousState, formData) {
  const admin = await requireAdmin();

  let fields;
  try {
    fields = readAppFields(formData);
  } catch (error) {
    return { success: false, message: error.message };
  }

  let assignedUserId;
  try { assignedUserId = readAssignedUserId(formData); } catch (error) { return { success: false, message: error.message }; }
  const appId = randomUUID();
  try {
    await withDbTransaction(async (client) => {
      if (assignedUserId) {
        const user = await client.query("SELECT id FROM public.profiles WHERE id = $1 AND status = 'active' LIMIT 1", [assignedUserId]);
        if (!user.rows[0]) throw new Error('Choose an active user for this app.');
      }
      await client.query(
    `
      INSERT INTO public.apps
        (id, name, app_url, package_name, google_play_url, play_store_account, icon_url,
         current_version_name, latest_release_date, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      appId,
      fields.name,
      fields.appUrl,
      fields.playStore?.packageName || null,
      fields.playStore?.url || null,
      fields.playStoreAccount || null,
      fields.imageUrl,
      fields.latestVersion || null,
      fields.lastRelease,
      admin.id,
    ]
      );
      if (assignedUserId) await client.query('INSERT INTO public.app_members (app_id, profile_id) VALUES ($1, $2)', [appId, assignedUserId]);
    });
  } catch (error) {
    if (error.code === '23505') return { success: false, message: 'This app is already assigned. Refresh and try again.' };
    return { success: false, message: error.message || 'Could not create this app.' };
  }

  revalidateApps();
  return { success: true, message: `App "${fields.name}" was created successfully.` };
}

export async function updateApp(appId, formData) {
  await requireAdmin();
  if (!UUID_PATTERN.test(String(appId || ''))) return { success: false, message: 'Choose a valid app.' };

  let fields;
  try {
    fields = readAppFields(formData);
  } catch (error) {
    return { success: false, message: error.message };
  }

  const rows = await queryDb(
    'SELECT id, app_url, package_name FROM public.apps WHERE id = $1 LIMIT 1',
    [appId]
  );
  const current = rows[0];
  if (!current) return { success: false, message: 'App not found.' };

  let assignedUserId;
  try { assignedUserId = readAssignedUserId(formData); } catch (error) { return { success: false, message: error.message }; }
  const packageName = fields.playStore?.packageName
    || (fields.appUrl === current.app_url ? current.package_name : null);
  try {
    await withDbTransaction(async (client) => {
      if (assignedUserId) {
        const user = await client.query(
          `
            SELECT p.id
            FROM public.profiles p
            WHERE p.id = $1
              AND (
                p.status = 'active'
                OR EXISTS (
                  SELECT 1 FROM public.app_members existing
                  WHERE existing.app_id = $2 AND existing.profile_id = p.id
                )
              )
            LIMIT 1
          `,
          [assignedUserId, appId]
        );
        if (!user.rows[0]) throw new Error('Choose an active user for this app.');
      }
      await client.query(
    `
      UPDATE public.apps
      SET name = $2, app_url = $3, package_name = $4, google_play_url = $5,
          play_store_account = $6, icon_url = $7, current_version_name = $8, latest_release_date = $9
      WHERE id = $1
    `,
    [
      appId,
      fields.name,
      fields.appUrl,
      packageName,
      fields.playStore?.url || null,
      fields.playStoreAccount || null,
      fields.imageUrl,
      fields.latestVersion || null,
      fields.lastRelease,
    ]
      );
      if (assignedUserId) {
        await client.query(
          `
            INSERT INTO public.app_members (app_id, profile_id)
            VALUES ($1, $2)
            ON CONFLICT (app_id) DO UPDATE SET profile_id = EXCLUDED.profile_id
          `,
          [appId, assignedUserId]
        );
      } else {
        await client.query('DELETE FROM public.app_members WHERE app_id = $1', [appId]);
      }
    });
  } catch (error) {
    if (error.code === '23505') return { success: false, message: 'This app is already assigned to another user.' };
    return { success: false, message: error.message || 'Could not save this app.' };
  }

  revalidateApps();
  revalidatePath(`/apps/${appId}`);
  return { success: true, message: `App "${fields.name}" was saved.` };
}

export async function deleteApp(appId) {
  await requireAdmin();
  if (!UUID_PATTERN.test(String(appId || ''))) return { success: false, message: 'Choose a valid app.' };

  const rows = await queryDb('SELECT id FROM public.apps WHERE id = $1 LIMIT 1', [appId]);
  if (!rows[0]) return { success: false, message: 'App not found.' };
  await queryDb('DELETE FROM public.apps WHERE id = $1', [appId]);

  revalidateApps();
  revalidatePath(`/apps/${appId}`);
  return { success: true, message: 'App deleted.' };
}
