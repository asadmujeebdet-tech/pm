import { redirect } from 'next/navigation';

export default async function LegacyTicketRedirect({ params, searchParams }) {
  const [{ boardId }, query] = await Promise.all([params, searchParams]);
  const ticketId = typeof query.ticketId === 'string' ? query.ticketId : '';
  const destination = `/tickets/${encodeURIComponent(boardId)}`;
  redirect(ticketId ? `${destination}?ticketId=${encodeURIComponent(ticketId)}` : destination);
}
