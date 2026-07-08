import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import DeploymentCenterClient from './components/DeploymentCenterClient';

export const metadata: Metadata = {
  title: 'Deployment Center - Matrix Coder AI',
  description: 'Deployment and export readiness for Matrix Coder AI projects.',
};

export default function DeploymentCenterPage() {
  return (
    <AppShell
      title="Deployment Center"
      description="Export, production checks, Vercel, and Android preparation."
      breadcrumbs={[
        { label: 'Matrix Coder AI', href: '/' },
        { label: 'Deployment Center' },
      ]}
      showHeader={false}
      contentClassName="h-full p-0"
    >
      <DeploymentCenterClient />
    </AppShell>
  );
}
