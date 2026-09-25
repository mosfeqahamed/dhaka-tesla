'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLogout, useMe } from '@/lib/queries';

export function AppHeader() {
  const { data: me } = useMe();
  const logout = useLogout();
  const router = useRouter();
  const pathname = usePathname();

  const links =
    me?.role === 'PASSENGER'
      ? [
          { href: '/ride', label: 'Ride' },
          { href: '/ride/history', label: 'History' },
        ]
      : me?.role === 'DRIVER'
        ? [
            { href: '/drive', label: 'Drive' },
            { href: '/drive/history', label: 'Trips' },
          ]
        : [];

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-brand-600">
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white"
          >
            T
          </span>
          <span className="hidden sm:inline">Dhaka Tesla Pool</span>
        </Link>

        <nav className="flex gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? 'page' : undefined}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 aria-[current=page]:bg-brand-50 aria-[current=page]:text-brand-700"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {me && (
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-stone-600">{me.name}</span>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
              disabled={logout.isPending}
              onClick={() =>
                logout.mutate(undefined, { onSuccess: () => router.replace('/login') })
              }
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
