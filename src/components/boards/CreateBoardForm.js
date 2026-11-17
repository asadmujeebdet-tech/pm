'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createBoard } from '@/lib/board-actions';
import { FormMessage, TextAreaField, TextField } from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';

const initialState = { success: false, message: '' };

function BoardForm({ apps = [], onClose }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(async (previousState, formData) => {
    const result = await createBoard(previousState, formData);
    if (result?.success && result.boardId) {
      onClose();
      router.push(`/boards/${result.boardId}`);
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <TextField
        label="Board name"
        name="name"
        required
        maxLength={100}
        disabled={isPending}
        placeholder="Product launch"
        autoComplete="off"
        data-autofocus=""
      />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Application (optional)</span>
        <select name="appId" className="field" disabled={isPending} defaultValue="">
          <option value="">No application</option>
          {apps.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}
        </select>
        <span className="mt-1.5 block text-xs text-[var(--muted)]">The responsible user for this app will automatically be able to access the board.</span>
      </label>
      <TextAreaField
        label="Description"
        name="description"
        rows={3}
        maxLength={1000}
        disabled={isPending}
        placeholder="What is this board for?"
      />
      <FormMessage state={state} />
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={isPending} className="btn btn-secondary">Cancel</button>
        <button type="submit" disabled={isPending} className="btn btn-primary">
          {isPending ? 'Creating…' : 'Create board'}
        </button>
      </div>
    </form>
  );
}

export default function CreateBoardForm({ apps = [], variant = 'primary' }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={`btn ${variant === 'primary' ? 'btn-primary' : 'btn-secondary'}`}>
        <Plus size={16} aria-hidden="true" />
        Create board
      </button>
      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Create a board"
        description="Start with Planning, Development, QA, Marketing, Uploaded at Developer Account, and Completed. You can add or rename lists any time."
      >
        <BoardForm apps={apps} onClose={() => setIsOpen(false)} />
      </Modal>
    </>
  );
}
