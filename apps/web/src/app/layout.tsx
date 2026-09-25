import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { Providers } from '@/components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dhaka Tesla Pool',
  description: 'Share a seat. Split the fare. Survive Dhaka traffic.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <Providers>
          <AppHeader />
          <main className="mx-auto w-full max-w-xl px-4 pb-16 pt-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
