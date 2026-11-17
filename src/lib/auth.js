import 'server-only';

import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { queryDb } from '@/lib/db';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'app_manager_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  const [algorithm, saltHex, keyHex] = String(storedHash || '').split('$');
  if (algorithm !== 'scrypt' || !saltHex || !keyHex) return false;

  const salt = Buffer.from(saltHex, 'hex');
  const expectedKey = Buffer.from(keyHex, 'hex');
  if (expectedKey.length !== 64) return false;

  const actualKey = await scrypt(password, salt, expectedKey.length);
  return timingSafeEqual(expectedKey, actualKey);
}

function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export async function createLoginSession(profileId) {
  const token = randomBytes(32).toString('hex');
  await queryDb(
    "INSERT INTO public.app_sessions (profile_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')",
    [profileId, hashSessionToken(token)]
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearLoginSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await queryDb('DELETE FROM public.app_sessions WHERE token_hash = $1', [hashSessionToken(token)]);
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentProfile() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const profiles = await queryDb(
    `
      SELECT p.id, p.full_name, p.email, p.role, p.status,
        CASE WHEN p.avatar_data IS NOT NULL THEN p.avatar_path END AS avatar_path
      FROM public.app_sessions s
      JOIN public.profiles p ON p.id = s.profile_id
      WHERE s.token_hash = $1
        AND s.expires_at > NOW()
        AND p.status = 'active'
      LIMIT 1
    `,
    [hashSessionToken(token)]
  );
  return profiles[0] || null;
}

export async function requireActiveProfile() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  return profile;
}

export async function requireAdmin() {
  const profile = await requireActiveProfile();
  if (profile.role !== 'admin') redirect('/overview');
  return profile;
}

export async function hasAnyProfiles() {
  const result = await queryDb('SELECT EXISTS (SELECT 1 FROM public.profiles) AS has_profiles');
  return Boolean(result[0]?.has_profiles);
}
