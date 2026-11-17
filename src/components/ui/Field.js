'use client';

import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function TextField({ label, hint, id, icon: Icon, ...props }) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;

  return (
    <div className="field-control">
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">{label}</label>
      <div className={`relative ${Icon ? 'field-icon-wrap' : ''}`}>
        {Icon && <Icon size={17} aria-hidden="true" className="field-icon pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />}
        <input id={fieldId} aria-describedby={hintId} className={`field ${Icon ? 'field-with-icon' : ''}`} {...props} />
      </div>
      {hint && <p id={hintId} className="mt-1.5 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

export function TextAreaField({ label, hint, id, ...props }) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;

  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">{label}</label>
      <textarea id={fieldId} aria-describedby={hintId} className="field resize-y" {...props} />
      {hint && <p id={hintId} className="mt-1.5 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

export function SelectField({ label, hint, id, children, ...props }) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;

  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">{label}</label>
      <select id={fieldId} aria-describedby={hintId} className="field" {...props}>{children}</select>
      {hint && <p id={hintId} className="mt-1.5 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

export function PasswordField({ label, hint, id, icon: Icon, ...props }) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const [visible, setVisible] = useState(false);

  return (
    <div className="field-control">
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">{label}</label>
      <div className={`relative ${Icon ? 'field-icon-wrap' : ''}`}>
        {Icon && <Icon size={17} aria-hidden="true" className="field-icon pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />}
        <input
          id={fieldId}
          type={visible ? 'text' : 'password'}
          aria-describedby={hintId}
          className={`field pr-12 ${Icon ? 'field-with-icon' : ''}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="password-visibility absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
      {hint && <p id={hintId} className="mt-1.5 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

export function FormMessage({ state }) {
  if (!state?.message) return null;
  return (
    <p
      role={state.success ? 'status' : 'alert'}
      className={`rounded-xl border px-3.5 py-2.5 text-sm ${
        state.success
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)]'
      }`}
    >
      {state.message}
    </p>
  );
}
