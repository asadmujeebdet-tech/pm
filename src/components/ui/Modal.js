'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

// Built on the native <dialog>: focus trap, Escape to close, inert page behind and
// focus return come from the browser. Children mount only while open, so forms reset.
export default function Modal({ open, onClose, title, description, children }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector('[data-autofocus]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && (
        <div className="p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-[var(--foreground)]">{title}</h2>
              {description && <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close dialog" className="btn btn-ghost btn-icon -mr-2 -mt-1">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
