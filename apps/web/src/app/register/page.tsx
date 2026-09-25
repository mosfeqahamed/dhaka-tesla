'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, Field, fieldError, Input } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useRegister } from '@/lib/queries';

export default function RegisterPage() {
  const router = useRouter();
  const register = useRegister();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    register.mutate(form, { onSuccess: () => router.replace('/ride') });
  }

  const err = register.error;
  const duplicate =
    err instanceof ApiError && (err.code === 'EMAIL_TAKEN' || err.code === 'PHONE_TAKEN');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create a passenger account</h1>
        <p className="mt-1 text-sm text-stone-600">
          Drivers are onboarded with their Tesla, so sign-up here is for passengers.
        </p>
      </div>
      <Card>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {err && !(err instanceof ApiError && err.code === 'VALIDATION_ERROR') && (
            <Alert>
              {err.message}
              {duplicate && (
                <>
                  {' '}
                  <Link href="/login" className="font-semibold underline">
                    Sign in instead?
                  </Link>
                </>
              )}
            </Alert>
          )}
          <Field label="Name" error={fieldError(err, 'name')}>
            <Input autoComplete="name" value={form.name} onChange={set('name')} />
          </Field>
          <Field label="Email" error={fieldError(err, 'email')}>
            <Input type="email" autoComplete="email" value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Mobile number" error={fieldError(err, 'phone')} hint="e.g. 01712-345678">
            <Input type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />
          </Field>
          <Field label="Password" error={fieldError(err, 'password')} hint="At least 8 characters">
            <Input
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
            />
          </Field>
          <Button type="submit" className="w-full" loading={register.isPending}>
            Create account
          </Button>
        </form>
      </Card>
      <p className="text-center text-sm text-stone-600">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
