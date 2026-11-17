import { getCurrentProfile } from '@/lib/auth';
import { queryDb } from '@/lib/db';

const SAFE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function GET(_request, { params }) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response('Authentication required.', { status: 401 });

  const { appId } = await params;
  const rows = await queryDb(
    'SELECT icon_path, icon_data, icon_mime_type FROM public.apps WHERE id = $1 LIMIT 1',
    [appId]
  );
  const icon = rows[0];
  if (
    !icon?.icon_path?.startsWith(`${appId}/`)
    || !Buffer.isBuffer(icon.icon_data)
    || !SAFE_IMAGE_TYPES.has(icon.icon_mime_type)
  ) return new Response('Icon not found.', { status: 404 });

  return new Response(icon.icon_data, {
    headers: {
      'content-type': icon.icon_mime_type,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
