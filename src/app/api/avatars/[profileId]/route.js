import { getCurrentProfile } from '@/lib/auth';
import { queryDb } from '@/lib/db';

const SAFE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function GET(_request, { params }) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response('Authentication required.', { status: 401 });

  const { profileId } = await params;
  const rows = await queryDb(
    'SELECT avatar_path, avatar_data, avatar_mime_type FROM public.profiles WHERE id = $1 LIMIT 1',
    [profileId]
  );
  const avatar = rows[0];
  if (
    !avatar?.avatar_path?.startsWith(`${profileId}/`)
    || !Buffer.isBuffer(avatar.avatar_data)
    || !SAFE_IMAGE_TYPES.has(avatar.avatar_mime_type)
  ) return new Response('Image not found.', { status: 404 });

  return new Response(avatar.avatar_data, {
    headers: {
      'content-type': avatar.avatar_mime_type,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
