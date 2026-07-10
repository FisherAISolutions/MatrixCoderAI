import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import ProjectsClient from './ProjectsClient';

export const metadata: Metadata = {
  title: 'Projects | Matrix Coder AI',
  description: 'Save, reopen, and manage generated Matrix Coder AI projects.',
};

export default function ProjectsPage() {
  return (
    <AppShell
      title="Projects"
      description="Save generated apps, reopen them in Workspace, and keep your builds organized."
      breadcrumbs={[{ label: 'Matrix Coder AI', href: '/' }, { label: 'Projects' }]}
      contentClassName="h-full p-0"
      showHeader={false}
    >
      <ProjectsClient />
    </AppShell>
  );
}
