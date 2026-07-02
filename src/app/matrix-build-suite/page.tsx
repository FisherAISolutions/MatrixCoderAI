import type { Metadata } from 'next';
import MatrixBuildSuiteClient from './components/MatrixBuildSuiteClient';

export const metadata: Metadata = {
  title: 'Matrix Build Suite - Matrix Coder AI',
  description: 'Guided app prompt builder for Matrix Coder AI.',
};

export default function MatrixBuildSuitePage() {
  return <MatrixBuildSuiteClient />;
}
