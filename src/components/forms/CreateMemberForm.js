'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, UserPlus } from 'lucide-react';
import { createMember, deleteMember, updateMember } from '@/lib/admin-actions';
import Modal from '@/components/ui/Modal';
import AppIcon from '@/components/ui/AppIcon';
import { FormMessage, PasswordField, SelectField, TextField } from '@/components/ui/Field';

const initialState = { success: false, message: '' };

// Mounted fresh each time the dialog opens, so fields and old errors never carry over.
function MemberForm({ member, apps = [], boards = [], onClose }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(async (previousState, formData) => {
    const result = member
      ? await updateMember(member.id, formData)
      : await createMember(previousState, formData);
    if (result?.success) {
      onClose();
      router.refresh();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <TextField label="Full name" name="fullName" required maxLength={100} disabled={isPending} autoComplete="off" placeholder="Member name" defaultValue={member?.full_name || ''} data-autofocus="" />
      <TextField label="Email" name="email" type="email" required maxLength={254} disabled={isPending} autoComplete="off" placeholder="member@company.com" defaultValue={member?.email || ''} />
      {!member && <PasswordField label="Initial password" name="password" required minLength={8} disabled={isPending} autoComplete="new-password" placeholder="At least 8 characters" hint="Share it securely. The member can sign in right away." />}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-[var(--foreground)]">Assigned applications</legend>
        <p className="text-xs text-[var(--muted)]">A user can own multiple apps. Each app can be assigned to only one user.</p>
        <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-[var(--border)] p-2">
          {apps.map((app) => {
            const assignedToAnother = app.assigned_user_id && app.assigned_user_id !== member?.id;
            return (
              <label key={app.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${assignedToAnother ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-[var(--neutral)]'}`}>
                <input type="checkbox" name="appIds" value={app.id} defaultChecked={(member?.assigned_app_ids || []).includes(app.id)} disabled={isPending || assignedToAnother} className="accent-[var(--primary)]" />
                <AppIcon name={app.name} src={app.icon_url || (app.icon_path ? `/api/apps/${app.id}/icon` : undefined)} size="sm" />
                <span className="min-w-0 flex-1 truncate">{app.name}</span>
                {assignedToAnother && <span className="text-[10px] text-[var(--muted)]">Assigned</span>}
              </label>
            );
          })}
          {apps.length === 0 && <p className="px-2 py-3 text-xs text-[var(--muted)]">Create apps first, then assign them here.</p>}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-[var(--foreground)]">Assigned boards</legend>
        <p className="text-xs text-[var(--muted)]">Grant access to project boards, including boards not linked to an application.</p>
        <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-[var(--border)] p-2">
          {boards.map((board) => (
            <label key={board.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--neutral)]">
              <input
                type="checkbox"
                name="boardIds"
                value={board.id}
                defaultChecked={(member?.assigned_board_ids || []).includes(board.id)}
                disabled={isPending}
                className="accent-[var(--primary)]"
              />
              <span className="min-w-0 flex-1 truncate">{board.name}</span>
              {board.app_name && <span className="max-w-32 truncate text-xs text-[var(--muted)]">{board.app_name}</span>}
            </label>
          ))}
          {boards.length === 0 && <p className="px-2 py-3 text-xs text-[var(--muted)]">Create a board first, then assign it here.</p>}
        </div>
      </fieldset>
      <SelectField label="Role" name="role" defaultValue={member?.role || 'member'} disabled={isPending} hint="Admins can manage members. Members work on apps and tickets.">
        <option value="member">User</option>
        <option value="admin">Admin</option>
      </SelectField>
      <div>
        <label htmlFor="member-avatar" className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Profile picture</label>
        <input id="member-avatar" name="avatar" type="file" accept="image/png,image/jpeg,image/webp" disabled={isPending} className="field file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--primary-soft)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--primary)]" />
        <p className="mt-1.5 text-xs text-[var(--muted)]">PNG, JPG, or WebP; up to 5 MB.</p>
        {member?.avatar_path && (
          <label className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
            <input type="checkbox" name="removeAvatar" disabled={isPending} />
            Remove current picture
          </label>
        )}
      </div>

      <FormMessage state={state} />

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={isPending} className="btn btn-secondary">Cancel</button>
        <button type="submit" disabled={isPending} className="btn btn-primary">{isPending ? (member ? 'Saving…' : 'Creating account…') : (member ? 'Save changes' : 'Create user')}</button>
      </div>
    </form>
  );
}

export default function CreateMemberForm({ member, apps = [], boards = [], variant = 'primary' }) {
  const [isOpen, setIsOpen] = useState(false);
  const isEditing = Boolean(member);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={isEditing ? 'btn btn-anim btn-edit' : `btn ${variant === 'primary' ? 'btn-primary' : 'btn-secondary'}`}>
        {isEditing ? <Pencil size={15} aria-hidden="true" /> : <UserPlus size={16} aria-hidden="true" />}
        {isEditing ? 'Edit' : 'Add User'}
      </button>

      <Modal open={isOpen} onClose={() => setIsOpen(false)} title={isEditing ? 'Edit user' : 'Add user'} description={isEditing ? 'Update account details, role, or profile picture.' : 'Create a workspace account with a role.'}>
        <MemberForm key={member?.id || 'new-member'} member={member} apps={apps} boards={boards} onClose={() => setIsOpen(false)} />
      </Modal>
    </>
  );
}

export function DeleteMemberButton({ member }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  async function removeMember() {
    const name = member.full_name || member.email;
    if (!window.confirm(`Permanently delete ${name}? Their comments and notifications will also be deleted, their card assignments cleared, and their app/board access removed. This cannot be undone.`)) return;
    setPending(true);
    setMessage('');
    try {
      const result = await deleteMember(member.id);
      if (result.success) router.refresh();
      else setMessage(result.message || 'Could not delete this member.');
    } catch (error) {
      console.error('Failed to delete a member:', error);
      setMessage('Could not delete this member. Check the connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={removeMember} disabled={pending} className="btn btn-anim btn-delete min-h-9 px-3 text-xs">
        {pending ? 'Deleting…' : 'Delete'}
      </button>
      {message && <span role="alert" className="text-xs text-[var(--danger)]">{message}</span>}
    </div>
  );
}
