import type { ReactNode } from 'react';
import { RoleGuard } from '@/components/RoleGuard';

export default function RideLayout({ children }: { children: ReactNode }) {
  return <RoleGuard role="PASSENGER">{children}</RoleGuard>;
}
