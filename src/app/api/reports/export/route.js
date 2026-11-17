import { getCurrentProfile } from '@/lib/auth';
import { getReportCards } from '@/lib/db';
import { cardsToCsv } from '@/lib/reports';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return new Response('Authentication required.', { status: 401 });

  const csv = cardsToCsv(await getReportCards(profile));
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(`\uFEFF${csv}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="tasks-report-${stamp}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}
