import React from 'react';
import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/contexts/AuthContext';
import '../styles/tailwind.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Matrix Coder AI — Multi-Agent AI Coding Workspace',
  description:
    'Matrix Coder AI gives developers a streaming AI pair programmer with Planning, Coding, and Reviewing agents — generate full codebases, debug instantly, and retain memory across sessions.',
  icons: {
    icon: [{ url: '/favicon.ico', type: 'image/x-icon' }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-matrix-bg text-matrix-green font-mono antialiased overflow-hidden">
        <AuthProvider>
          <div className="matrix-scanline" />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}