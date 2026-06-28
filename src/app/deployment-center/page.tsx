import type { Metadata } from 'next';
import DeploymentCenterClient from './components/DeploymentCenterClient';

export const metadata: Metadata = {
  title: 'Deployment Center - Matrix Coder AI',
  description: 'Deployment and export readiness for Matrix Coder AI projects.',
};

export default function DeploymentCenterPage() {
  return <DeploymentCenterClient />;
}
