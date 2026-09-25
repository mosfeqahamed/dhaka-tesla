'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { homeFor } from '@/components/RoleGuard';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useLogin } from '@/lib/queries';

const DEMO = [
  { name: 'Nusrat', email: 'nusrat@teslapool.test', note: 'passenger' },
  { name: 'Rafiq', email: 'rafiq@teslapool.test', note: 'passenger' },
  { name: 'Shirin', email: 'shirin@teslapool.test', note: 'passenger' },
  { name: 'Jashim', email: 'jashim@teslapool.test', note: 'drives Bullet' },
];

// Only allow redirects back into this app, never to another site.
const safeNext = (next: string | null) =>
  next?.startsWith('/') && !next.startsWith('//') ? next : null;

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    login.mutate(
      { email, password },
      { onSuccess: ({ user }) => router.replace(next ?? homeFor(user.role)) },
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="mt-1 text-sm text-stone-600">
          Share a seat. Split the fare. Survive Dhaka traffic.
        </p>
      </div>

      <Card>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {login.error && (
            <Alert>
              {login.error instanceof ApiError && login.error.code === 'RATE_LIMITED'
                ? 'Too many attempts. Wait a few minutes and try again.'
                : login.error.message}
            </Alert>
          )}
          <Field label="Email">
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button
            type="submit"
            className="w-full"
            loading={login.isPending}
            disabled={!email || !password}
          >
            Sign in
          </Button>
        </form>
      </Card>

      <Card className="space-y-3">
        <p className="text-sm font-semibold text-stone-700">Demo accounts</p>
        <p className="text-xs text-stone-500">
          Pick one to fill in the email. The password is the <code>SEED_PASSWORD</code> from your{' '}
          <code>.env</code>.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              onClick={() => setEmail(d.email)}
              className="rounded-lg border border-stone-200 px-3 py-2 text-left text-sm hover:border-brand-500 hover:bg-brand-50"
            >
              <span className="block font-semibold">{d.name}</span>
              <span className="block text-xs text-stone-500">{d.note}</span>
            </button>
          ))}
        </div>
      </Card>

      <p className="text-center text-sm text-stone-600">
        New here?{' '}
        <Link href="/register" className="font-semibold text-brand-700 hover:underline">
          Create a passenger account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
