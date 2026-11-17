'use client';

import { useActionState, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Loader2, LockKeyhole, Mail, TriangleAlert, UserRound } from 'lucide-react';
import { createFirstAdmin, signIn } from '@/lib/actions';
import { FormMessage, PasswordField, TextField } from '@/components/ui/Field';

const initialState = { success: false, message: '' };

function strengthOf(value) {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  return score;
}

export default function LoginForm({ needsSetup }) {
  const router = useRouter();
  const formRef = useRef(null);
  const [capsLock, setCapsLock] = useState(false);
  const [password, setPassword] = useState('');
  const authAction = needsSetup ? createFirstAdmin : signIn;
  const [state, formAction, isPending] = useActionState(async (previousState, formData) => {
    const result = await authAction(previousState, formData);
    if (result.success) {
      window.setTimeout(() => router.replace('/overview'), 650);
    }
    return { ...result, nonce: Date.now() };
  }, initialState);

  // Spotlight that follows the pointer across the form.
  function trackPointer(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }

  const strength = strengthOf(password);
  const strengthLabels = ['Too short', 'Weak', 'Okay', 'Good', 'Strong'];

  return (
    <form
      ref={formRef}
      action={formAction}
      onPointerMove={trackPointer}
      onKeyUp={(event) => setCapsLock(event.getModifierState?.('CapsLock') || false)}
      className={`login-form space-y-5 ${state.success ? 'login-form-success' : ''}`}
      aria-busy={isPending}
    >
      <div key={state.nonce || 0} className={state.message && !state.success ? 'login-shake space-y-5' : 'space-y-5'}>
        {needsSetup && (
          <div className="login-stagger" style={{ '--d': 0 }}>
            <TextField label="Full name" id="full-name" name="fullName" type="text" required autoComplete="name" placeholder="Your name" disabled={isPending || state.success} autoFocus icon={UserRound} />
          </div>
        )}
        <div className="login-stagger" style={{ '--d': 1 }}>
          <TextField label="Email" id="email" name="email" type="email" autoComplete="email" required placeholder="name@company.com" disabled={isPending || state.success} autoFocus={!needsSetup} icon={Mail} />
        </div>
        <div className="login-stagger" style={{ '--d': 2 }}>
          <PasswordField
            label="Password"
            id="password"
            name="password"
            autoComplete={needsSetup ? 'new-password' : 'current-password'}
            minLength={needsSetup ? 8 : undefined}
            required
            placeholder={needsSetup ? 'At least 8 characters' : 'Enter your password'}
            hint={needsSetup ? 'Use at least 8 characters.' : undefined}
            disabled={isPending || state.success}
            icon={LockKeyhole}
            onChange={(event) => setPassword(event.target.value)}
            onBlur={() => setCapsLock(false)}
          />
          {capsLock && (
            <p className="login-caps mt-1.5 flex items-center gap-1.5 text-xs text-[var(--warning,#b45309)]" role="status">
              <TriangleAlert size={12} aria-hidden="true" /> Caps Lock is on
            </p>
          )}
          {needsSetup && password && (
            <div className="mt-2" aria-live="polite">
              <div className="flex gap-1.5">
                {[1, 2, 3, 4].map((step) => (
                  <span key={step} className={`login-strength h-1.5 flex-1 rounded-full ${strength >= step ? `is-on is-${strength}` : ''}`} />
                ))}
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">{strengthLabels[strength]}</p>
            </div>
          )}
        </div>

        <FormMessage state={state} />
      </div>

      <div className="login-stagger" style={{ '--d': 3 }}>
        <button
          type="submit"
          disabled={isPending || state.success}
          className={`btn btn-primary login-submit w-full py-3 ${state.success ? 'is-success' : ''}`}
          aria-live="polite"
        >
          {state.success ? (
            <>
              <Check size={16} className="login-check" aria-hidden="true" />
              Signed in — redirecting…
            </>
          ) : isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Please wait…
            </>
          ) : (
            <>
              {needsSetup ? 'Create admin account' : 'Sign in'}
              <ArrowRight size={16} aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
