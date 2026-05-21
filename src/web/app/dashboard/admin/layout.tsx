'use client';

import { useAuthStore } from 'lib/store/auth';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import React, { useEffect } from 'react';

const NAV_ITEMS = [
  { href: '/dashboard/admin', label: 'Overview' },
  { href: '/dashboard/admin/users', label: 'Users' },
  { href: '/dashboard/admin/audit', label: 'Audit Logs' },
  { href: '/dashboard/admin/health', label: 'Health' },
  { href: '/dashboard/admin/mail', label: 'Mail System' },
  { href: '/dashboard/admin/sessions', label: 'Sessions' },
  { href: '/dashboard/admin/settings', label: 'Settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = Array.isArray(user?.roles) && user.roles.includes('admin');

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/dashboard/inbox');
    }
  }, [isAdmin, router]);

  if (!isAdmin) return null;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gray-50 dark:bg-gray-950 text-gray-800 dark:text-gray-200">
      <nav className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6">
        <div className="max-w-screen-xl mx-auto flex gap-1 overflow-x-auto">
          {NAV_ITEMS.map(({ href, label }) => {
            const active = href === '/dashboard/admin'
              ? pathname === '/dashboard/admin'
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  active
                    ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
      {children}
    </div>
  );
}