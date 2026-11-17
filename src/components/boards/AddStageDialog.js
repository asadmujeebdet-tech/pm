'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createOverviewStage } from '@/lib/board-actions';
import Modal from '@/components/ui/Modal';
import { FormMessage } from '@/components/ui/Field';

export default function AddStageDialog({ disabled = false }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const result = await createOverviewStage(title);
      if (!result.success) {
        setError(result.message || 'Could not add this stage.');
        return;
      }
      setOpen(false);
      setTitle('');
      router.refresh();
    } catch (submitError) {
      console.error('Failed to add a workspace stage:', submitError);
      setError('Could not add this stage. Check the connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(''); setOpen(true); }}
        disabled={disabled}
        className="btn btn-secondary inline-flex items-center gap-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
      >
        <Plus size={16} aria-hidden="true" />
        Add Stages
      </button>
      <Modal
        open={open}
        onClose={() => { if (!pending) setOpen(false); }}
        title="Add Stage"
        description="Create a stage across all existing project boards."
      >
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="new-stage-name" className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Stage name</label>
            <input
              id="new-stage-name"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
              required
              autoFocus
              disabled={pending}
              placeholder="e.g. Development"
              className="field min-h-11 w-full rounded-xl"
            />
          </div>
          {error && <FormMessage state={{ success: false, message: error }} />}
          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn btn-secondary transition-all hover:-translate-y-px hover:shadow-sm">Cancel</button>
            <button type="submit" disabled={pending || !title.trim()} className="btn btn-primary transition-all hover:-translate-y-px hover:shadow-md">
              {pending ? 'Saving…' : 'Save Stage'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
