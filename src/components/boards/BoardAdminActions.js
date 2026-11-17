'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import { deleteBoard, updateBoard } from '@/lib/board-actions';
import { FormMessage, TextAreaField, TextField } from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';

const initialState = { success: false, message: '' };

function EditForm({ board, apps, onClose }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(async (previous, formData) => {
    const result = await updateBoard(board.id, formData);
    if (result?.success) {
      onClose();
      router.refresh();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <TextField label="Board name" name="name" required maxLength={100} defaultValue={board.name} disabled={isPending} autoComplete="off" data-autofocus="" />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Application (optional)</span>
        <select name="appId" className="field" disabled={isPending} defaultValue={board.app_id || ''}>
          <option value="">No application</option>
          {apps.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}
        </select>
      </label>
      <TextAreaField label="Description" name="description" rows={3} maxLength={1000} defaultValue={board.description || ''} disabled={isPending} />
      <FormMessage state={state} />
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={isPending} className="btn btn-secondary">Cancel</button>
        <button type="submit" disabled={isPending} className="btn btn-primary">{isPending ? 'Saving…' : 'Save changes'}</button>
      </div>
    </form>
  );
}

function DeleteConfirm({ board, onClose }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function remove() {
    setPending(true);
    setError('');
    try {
      const result = await deleteBoard(board.id);
      if (!result?.success) {
        setError(result?.message || 'Could not delete this board.');
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError('Could not delete this board. Check the connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-[var(--muted)]">
        This permanently deletes <strong className="text-[var(--foreground)]">{board.name}</strong> with its {board.card_count || 0} {board.card_count === 1 ? 'task' : 'tasks'}, comments and attachments. This cannot be undone.
      </p>
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={pending} className="btn btn-secondary" data-autofocus="">Cancel</button>
        <button type="button" onClick={remove} disabled={pending} className="btn btn-danger">{pending ? 'Deleting…' : 'Delete board'}</button>
      </div>
    </div>
  );
}

export default function BoardAdminActions({ board, apps = [] }) {
  const [mode, setMode] = useState(null);
  const close = () => setMode(null);

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => setMode('edit')} className="btn-glass" aria-label={`Edit ${board.name}`} title="Edit board">
          <Pencil size={14} aria-hidden="true" />
          <span>Edit</span>
        </button>
        <button type="button" onClick={() => setMode('delete')} className="btn-glass btn-glass-danger" aria-label={`Delete ${board.name}`} title="Delete board">
          <Trash2 size={14} aria-hidden="true" />
          <span>Delete</span>
        </button>
      </div>
      <Modal open={mode === 'edit'} onClose={close} title="Edit board" description="Rename the board, link an application or update its description.">
        <EditForm key={board.id} board={board} apps={apps} onClose={close} />
      </Modal>
      <Modal open={mode === 'delete'} onClose={close} title="Delete this board?">
        <DeleteConfirm board={board} onClose={close} />
      </Modal>
    </>
  );
}
