'use client';

export interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  rounded?: 'full' | 'rounded' | 'none';
  children: React.ReactNode;
  className?: string;
}

const baseStyles = 'inline-flex items-center font-medium transition-all duration-200 shadow-sm';

const sizeStyles: Record<BadgeProps['size'], string> = {
  sm: 'px-2 py-0.5 text-xs rounded-full',
  md: 'px-3 py-1 text-xs rounded-md',
  lg: 'px-4 py-1.5 text-sm rounded-lg',
};

const variantStyles: Record<BadgeProps['variant'], string> = {
  default: 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300',
  success: 'bg-teal-50 text-teal-700 border border-teal-200/60 hover:bg-teal-100 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700/40',
  warning: 'bg-amber-50 text-amber-700 border border-amber-200/60 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/40',
  error: 'bg-red-50 text-red-700 border border-red-200/60 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700/40',
  info: 'bg-indigo-50 text-indigo-700 border border-indigo-200/60 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700/40',
  primary: 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700 transition-colors dark:bg-indigo-500 dark:hover:bg-indigo-400',
  secondary: 'bg-slate-200 text-slate-800 border border-slate-300/60 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600',
};

const radiusStyles: Record<BadgeProps['rounded'], string> = {
  full: 'rounded-full',
  rounded: '', // md default
  none: 'rounded-sm',
};

export function Badge({ variant = 'default', size = 'md', rounded, children, className = '' }: BadgeProps) {
  const radiusClass = rounded || (size === 'sm' ? 'full' : size === 'lg' ? 'rounded' : undefined);

  return (
    <span
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${(radiusClass && radiusStyles[radiusClass]) ?? ''}${className}`}>
      {children}
    </span>
  );
}