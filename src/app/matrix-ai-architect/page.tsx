import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import MatrixAIArchitectClient from './components/MatrixAIArchitectClient';

export const metadata: Metadata = {
  title: 'Matrix AI Architect | Matrix Coder AI',
  description: 'Plan app architecture before generation inside Matrix Coder AI.',
};

export default function MatrixAIArchitectPage() {
  return (
    <AppShell
      title="Matrix AI Architect"
      description="Gather requirements, recommend architecture, and prepare Blueprint Studio."
      breadcrumbs={[
        { label: 'Matrix Coder AI', href: '/' },
        { label: 'Projects', href: '/projects' },
        { label: 'Matrix AI Architect' },
      ]}
      contentClassName="h-full p-0"
      showHeader={false}
    >
      <MatrixAIArchitectClient />
    </AppShell>
  );
}
