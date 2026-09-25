import type { ReactNode } from 'react';
import { RoleGuard } from '@/components/RoleGuard';

export default function DriveLayout({ children }: { children: ReactNode }) {
  return <RoleGuard role="DRIVER">{children}</RoleGuard>;
}
