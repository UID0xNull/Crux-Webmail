'use client';

import { Loader2 } from 'lucide-react';

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit';
}

const variantStyles: Record<ButtonProps['variant'], string> = {
  primary:
    'bg-[#505CF0] text-white hover:bg-[#4150D0] active:bg-[#3647c8] disabled:bg-indigo-300 shadow-sm hover:shadow transition-all',
  secondary:
    'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300 disabled:bg-slate-50'
    + ' border border-slate-300/60 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600',
  ghost:
    'text-slate-600 hover:bg-slate-100 active:bg-slate-200 disabled:text-slate-400'
    + ' hover:shadow-sm transition-all dark:text-slate-400 dark:hover:bg-slate-800',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-300'
    + ' shadow-sm hover:shadow transition-all',
};

const sizeStyles: Record<ButtonProps['size'], string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  children,
  onClick,
  className = '',
  type = 'button',
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`
        inline-flex items-center justify-center font-medium rounded-md transition-colors
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
        disabled:cursor-not-allowed
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
    >
      {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
      {children}
    </button>
  );
}
