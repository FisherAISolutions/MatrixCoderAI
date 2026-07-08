import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import BlueprintStudioClient from './BlueprintStudioClient';

export const metadata: Metadata = {
  title: 'Blueprint Studio | Matrix Coder AI',
  description: 'Review future app blueprint structure inside Matrix Coder AI.',
};

export default function BlueprintStudioPage() {
  return (
    <AppShell
      title="Blueprint Studio"
      description="Read-only foundation for future app planning."
      breadcrumbs={[
        { label: 'Matrix Coder AI', href: '/' },
        { label: 'Blueprint Studio' },
      ]}
      contentClassName="h-full p-0"
      showHeader={false}
    >
      <BlueprintStudioClient />
    </AppShell>
  );
}
