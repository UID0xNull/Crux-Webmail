'use client';

import { useAuthStore } from 'lib/store/auth';
import { useRouter } from 'next/navigation';
import React, { useEffect } from 'react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const isAdmin =
    Array.isArray(user?.roles) && user.roles.includes('admin');

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/dashboard/inbox');
    }
  }, [isAdmin, router]);

  // While redirecting, don't render content so there's no flash of admin UI.
  if (!isAdmin) return null;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gray-50 dark:bg-gray-950 text-gray-800 dark:text-gray-200">
      {children}
    </div>
  );
}