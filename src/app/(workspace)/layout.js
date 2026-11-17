import AppShell from '@/components/layout/AppShell';
import { requireActiveProfile } from '@/lib/auth';

export const instant = false;

export default async function WorkspaceLayout({ children }) {
  const profile = await requireActiveProfile();
  return <AppShell user={profile}>{children}</AppShell>;
}
