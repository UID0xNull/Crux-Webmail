'use client';

import { useWebSocket } from 'hooks/useWebSocket';
import DashboardLayout from 'components/layout/DashboardLayout';
import AuthGate from 'components/auth/AuthGate';

export default function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Initialize WebSocket connection
  useWebSocket();

  return (
    <AuthGate>
      <DashboardLayout>{children}</DashboardLayout>
    </AuthGate>
  );
}
