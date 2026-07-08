import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import DashboardClient from './DashboardClient';

export const metadata: Metadata = {
  title: 'Dashboard | Matrix Coder AI',
  description: 'Choose where to start inside Matrix Coder AI.',
};

export default function DashboardPage() {
  return (
    <AppShell
      title="Dashboard"
      description="Choose where to start."
      breadcrumbs={[{ label: 'Matrix Coder AI', href: '/' }, { label: 'Dashboard' }]}
      contentClassName="h-full p-0"
      showHeader={false}
    >
      <DashboardClient />
    </AppShell>
  );
}
