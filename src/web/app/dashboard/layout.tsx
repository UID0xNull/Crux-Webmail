'use client';

import DashboardLayout from '../../components/layout/DashboardLayout';
import { useWebSocket } from '../../hooks/useWebSocket';

export default function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Initialize WebSocket connection
  useWebSocket();

  return <DashboardLayout>{children}</DashboardLayout>;
}
