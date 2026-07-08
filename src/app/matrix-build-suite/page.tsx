import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import MatrixBuildSuiteClient from './components/MatrixBuildSuiteClient';

export const metadata: Metadata = {
  title: 'Matrix Build Suite - Matrix Coder AI',
  description: 'Guided app prompt builder for Matrix Coder AI.',
};

export default function MatrixBuildSuitePage() {
  return (
    <AppShell
      title="Matrix Build Suite"
      description="Design marketplace, templates, saved builds, and prompt handoff."
      breadcrumbs={[
        { label: 'Matrix Coder AI', href: '/' },
        { label: 'Matrix Build Suite' },
      ]}
      showHeader={false}
      contentClassName="h-full p-0"
    >
      <MatrixBuildSuiteClient />
    </AppShell>
  );
}
