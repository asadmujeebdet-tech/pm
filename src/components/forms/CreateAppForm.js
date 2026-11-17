'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { createApp, deleteApp, updateApp } from '@/lib/admin-actions';
import Modal from '@/components/ui/Modal';
import { FormMessage, TextField } from '@/components/ui/Field';
import AppIcon from '@/components/ui/AppIcon';
import { Avatar } from '@/components/ui/primitives';

const initialState = { success: false, message: '' };

function dateInputValue(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

// Mounted fresh each time the dialog opens, so fields and old errors never carry over.
function AppForm({ app, members = [], onClose }) {
  const router = useRouter();
  const [imageAddress, setImageAddress] = useState(app?.icon_url || '');
  const [state, formAction, isPending] = useActionState(async (previousState, formData) => {
    const result = app
      ? await updateApp(app.id, formData)
      : await createApp(previousState, formData);
    if (result?.success) {
      onClose();
      router.refresh();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <TextField label="App Name" name="name" required maxLength={120} disabled={isPending} placeholder="My App" autoComplete="off" defaultValue={app?.name || ''} data-autofocus="" />
      <TextField label="App URL" name="appUrl" type="url" disabled={isPending} placeholder="https://example.com or Play Store URL" autoComplete="url" defaultValue={app?.app_url || app?.google_play_url || ''} />
      <TextField
        label="Play Store account"
        name="playStoreAccount"
        maxLength={254}
        disabled={isPending}
        placeholder="Publisher account name or email"
        autoComplete="off"
        defaultValue={app?.play_store_account || ''}
        hint="Enter the account name or email that publishes this app. Do not enter a password."
      />
      <div>
        <TextField
          label="App Image Address"
          name="appImageUrl"
          type="url"
          disabled={isPending}
          placeholder="https://example.com/app-icon.png"
          autoComplete="url"
          value={imageAddress}
          onChange={(event) => setImageAddress(event.target.value)}
          hint="Use a direct HTTPS image address. A blank or broken image falls back to the app initials."
        />
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--neutral)] p-3">
          <AppIcon name={app?.name || 'App'} src={imageAddress} size="lg" />
          <span className="min-w-0 truncate text-sm font-medium text-[var(--muted)]">
            {imageAddress ? 'Live app icon preview' : 'No image address'}
          </span>
        </div>
      </div>
      <fieldset disabled={isPending} className="space-y-2">
        <legend className="text-sm font-medium text-[var(--foreground)]">Assigned user</legend>
        <p className="text-xs text-[var(--muted)]">Each app has one responsible user. A user can own multiple apps.</p>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-[var(--border)] p-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--neutral)]">
            <input type="radio" name="assignedUserId" value="" defaultChecked={!app?.assigned_user_id} className="accent-[var(--primary)]" />
            <span>No responsible user</span>
          </label>
          {members.filter((member) => member.status === 'active' || member.id === app?.assigned_user_id).map((member) => (
            <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--neutral)]">
              <input
                type="radio"
                name="assignedUserId"
                value={member.id}
                defaultChecked={app?.assigned_user_id === member.id}
                disabled={member.status !== 'active' && member.id !== app?.assigned_user_id}
                className="accent-[var(--primary)]"
              />
              <Avatar
                name={member.full_name || member.email}
                src={member.avatar_path ? `/api/avatars/${member.id}` : undefined}
                size="sm"
              />
              <span className="min-w-0 truncate">
                {member.full_name || member.email}
                {member.status !== 'active' && <span className="ml-1 text-[10px] text-[var(--muted)]">(inactive)</span>}
              </span>
            </label>
          ))}
          {!members.some((member) => member.status === 'active') && (
            <p className="px-2 py-3 text-xs text-[var(--muted)]">Create an active user before assigning this app.</p>
          )}
        </div>
      </fieldset>
      <TextField label="Latest Version" name="latestVersion" maxLength={80} disabled={isPending} placeholder="1.0.0" autoComplete="off" defaultValue={app?.current_version_name || ''} />
      <TextField label="Last Release" name="lastRelease" type="date" disabled={isPending} defaultValue={dateInputValue(app?.latest_release_date)} />

      <FormMessage state={state} />

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={isPending} className="btn btn-secondary">Cancel</button>
        <button type="submit" disabled={isPending} className="btn btn-primary">{isPending ? (app ? 'Saving…' : 'Creating…') : (app ? 'Save changes' : 'Create app')}</button>
      </div>
    </form>
  );
}

export default function CreateAppForm({ app, members = [], variant = 'primary' }) {
  const [isOpen, setIsOpen] = useState(false);
  const isEditing = Boolean(app);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={isEditing ? 'btn btn-anim btn-edit' : `btn ${variant === 'primary' ? 'btn-primary' : 'btn-secondary'}`}>
        {isEditing ? <Pencil size={15} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
        {isEditing ? 'Edit' : 'Add App'}
      </button>

      <Modal open={isOpen} onClose={() => setIsOpen(false)} title={isEditing ? 'Edit app' : 'Add App'} description="Manage the app name, URL, icon, version, and release date.">
        <AppForm key={app?.id || 'new-app'} app={app} members={members} onClose={() => setIsOpen(false)} />
      </Modal>
    </>
  );
}

export function DeleteAppButton({ app }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function remove() {
    const confirmed = window.confirm(
      `Delete "${app.name}"? Its release history and app memberships will be removed. Existing boards and tickets will remain without this app link.`
    );
    if (!confirmed) return;

    setPending(true);
    try {
      const result = await deleteApp(app.id);
      if (!result.success) {
        window.alert(result.message || 'Could not delete this app.');
        return;
      }
      if (result.message.includes('could not be removed')) window.alert(result.message);
      router.refresh();
    } catch (error) {
      console.error('Failed to delete app:', error);
      window.alert('Could not delete this app. Check the connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <button type="button" onClick={remove} disabled={pending} className="btn btn-anim btn-delete">
      <Trash2 size={14} aria-hidden="true" />
      {pending ? 'Deleting…' : 'Delete'}
    </button>
  );
}
