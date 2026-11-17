'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createLoginSession, clearLoginSession, hashPassword, hasAnyProfiles, verifyPassword } from '@/lib/auth';
import { queryDb } from '@/lib/db';

function readCredentials(formData) {
  return {
    email: String(formData.get('email') || '').trim().toLowerCase(),
    password: String(formData.get('password') || ''),
  };
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function signIn(previousState, formData) {
  const { email, password } = readCredentials(formData);
  if (!validEmail(email) || !password) {
    return { success: false, message: 'Enter a valid email and password.' };
  }

  const profiles = await queryDb(
    'SELECT id, password_hash, status FROM public.profiles WHERE email = $1 LIMIT 1',
    [email]
  );
  const profile = profiles[0];

  if (!profile || profile.status !== 'active' || !(await verifyPassword(password, profile.password_hash))) {
    return { success: false, message: 'Email or password is incorrect.' };
  }

  await createLoginSession(profile.id);
  return { success: true, message: 'Signed in.' };
}

export async function signOut() {
  await clearLoginSession();
  revalidatePath('/login');
  redirect('/login');
}

export async function createFirstAdmin(previousState, formData) {
  const fullName = String(formData.get('fullName') || '').trim();
  const { email, password } = readCredentials(formData);

  if (!fullName || !validEmail(email) || password.length < 8) {
    return { success: false, message: 'Enter a name, valid email, and password with at least 8 characters.' };
  }

  const passwordHash = await hashPassword(password);
  const admins = await queryDb(
    `
      WITH setup_lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(1796324871)
      )
      INSERT INTO public.profiles (full_name, email, password_hash, role, status)
      SELECT $1, $2, $3, 'admin', 'active'
      FROM setup_lock
      WHERE NOT EXISTS (SELECT 1 FROM public.profiles)
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    `,
    [fullName, email, passwordHash]
  );

  if (!admins[0]) {
    return { success: false, message: 'Workspace setup is already complete. Sign in or ask an admin to add you.' };
  }

  await createLoginSession(admins[0].id);
  return { success: true, message: 'Admin account created.' };
}

