import { getCurrentProfile } from '@/lib/auth';
import { canAccessCard } from '@/lib/permissions';
import { queryDb } from '@/lib/db';

function safeFilename(filename) {
  return String(filename || 'attachment').replace(/[^\w .()-]/g, '_').slice(0, 180);
}

export async function GET(_request, { params }) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response('Authentication required.', { status: 401 });

  const { attachmentId } = await params;
  const rows = await queryDb(
    `
      SELECT ca.card_id, ca.filename, ca.mime_type, ca.attachment_type
      FROM public.card_attachments ca
      WHERE ca.id = $1
      LIMIT 1
    `,
    [attachmentId]
  );
  const attachment = rows[0];
  if (!attachment || !(await canAccessCard(attachment.card_id, profile))) {
    return new Response('Attachment not found.', { status: 404 });
  }

  const files = await queryDb(
    'SELECT storage_data FROM public.card_attachments WHERE id = $1 LIMIT 1',
    [attachmentId]
  );
  const bytes = files[0]?.storage_data;
  if (!Buffer.isBuffer(bytes)) return new Response('Attachment data is unavailable.', { status: 404 });

  const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
  if (attachment.attachment_type === 'image' && !imageTypes.has(attachment.mime_type)) {
    return new Response('Image not found.', { status: 404 });
  }
  const contentType = attachment.attachment_type === 'image'
    ? attachment.mime_type
    : attachment.attachment_type === 'apk'
      ? 'application/vnd.android.package-archive'
      : 'application/octet-stream';
  const disposition = attachment.attachment_type === 'image' ? 'inline' : 'attachment';
  return new Response(bytes, {
    headers: {
      'content-type': contentType || 'application/octet-stream',
      'content-disposition': `${disposition}; filename="${safeFilename(attachment.filename)}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
