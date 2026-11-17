import { redirect } from 'next/navigation';

export default function LegacyBoardsRedirect() {
  redirect('/overview');
}
