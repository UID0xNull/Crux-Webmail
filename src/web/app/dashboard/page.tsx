'use client';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default function DashboardPage() {
  redirect('/dashboard/inbox');
}