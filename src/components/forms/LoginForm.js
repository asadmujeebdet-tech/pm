'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { createFirstAdmin, signIn } from '@/lib/actions';
import { FormMessage, PasswordField, TextField } from '@/components/ui/Field';

const initialState = { success: false, message: '' };

export default function LoginForm({ needsSetup }) {
  const router = useRouter();
  const authAction = needsSetup ? createFirstAdmin : signIn;
  const [state, formAction, isPending] = useActionState(async (previousState, formData) => {
    const result = await authAction(previousState, formData);
    if (result.success) router.replace('/overview');
    return result;
  }, initialState);

  return (
    <form action={formAction} className={`login-form space-y-5 ${state.success ? 'login-form-success' : ''}`} aria-busy={isPending}>
      {needsSetup && (
        <TextField label="Full name" id="full-name" name="fullName" type="text" required autoComplete="name" placeholder="Your name" disabled={isPending} autoFocus icon={UserRound} />
      )}
      <TextField label="Email" id="email" name="email" type="email" autoComplete="email" required placeholder="name@company.com" disabled={isPending} autoFocus={!needsSetup} icon={Mail} />
      <PasswordField
        label="Password"
        id="password"
        name="password"
        autoComplete={needsSetup ? 'new-password' : 'current-password'}
        minLength={needsSetup ? 8 : undefined}
        required
        placeholder={needsSetup ? 'At least 8 characters' : 'Enter your password'}
        hint={needsSetup ? 'Use at least 8 characters.' : undefined}
        disabled={isPending}
        icon={LockKeyhole}
      />

      <FormMessage state={state} />

      <button type="submit" disabled={isPending} className="btn btn-primary login-submit w-full py-3" aria-live="polite">
        {isPending ? (
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
    </form>
  );
}
