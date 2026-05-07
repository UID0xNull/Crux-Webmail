'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

// ------------------------------------------------------------------
// Props & State
// ------------------------------------------------------------------
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKeys?: string[];
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

// ------------------------------------------------------------------
// Global Error Boundary for the entire app
// ------------------------------------------------------------------
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render shows the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error (in production, send to error tracking service)
    console.error('[ErrorBoundary] Uncaught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Report to error monitoring (if available)
    if (typeof window !== 'undefined' && window.__ERROR_MONITOR__) {
      window.__ERROR_MONITOR__.report(error, errorInfo);
    }
  }

  // Allow resetting the error boundary
  resetErrorBoundary = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <DefaultErrorFallback resetErrorBoundary={this.resetErrorBoundary} error={this.state.error} />;
    }

    return this.props.children;
  }
}

// ------------------------------------------------------------------
// Default fallback UI
// ------------------------------------------------------------------
function DefaultErrorFallback({
  resetErrorBoundary,
  error,
}: {
  resetErrorBoundary: () => void;
  error: Error | null;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] px-4 text-center">
      <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 rounded-full">
        <AlertTriangle className="w-12 h-12 text-red-600 dark:text-red-400" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        Algo salió mal
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md">
        Se produjo un error inesperado. Podés intentar recargar la vista o volver
        al inicio.
      </p>

      {process.env.NODE_ENV === 'development' && error && (
        <details className="mb-6 w-full max-w-lg text-left">
          <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            Ver detalles del error
          </summary>
          <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto text-red-600 dark:text-red-400">
            {error.toString()}
          </pre>
        </details>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={resetErrorBoundary}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar
        </button>
        <a
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          <Home className="w-4 h-4" />
          Volver al inicio
        </a>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Boundary for individual components (lighter weight)
// ------------------------------------------------------------------
export function ComponentErrorBoundary({
  children,
  fallbackText = 'Este componente no se pudo cargar',
  resetKey,
}: {
  children: ReactNode;
  fallbackText?: string;
  resetKey?: string;
}) {
  // Key-based reset: changing the key unmounts and remounts the boundary
  return (
    <ErrorBoundary
      key={resetKey || 'default'}
      fallback={
        <div className="flex flex-col items-center justify-center p-8 text-center gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-500" />
          <p className="text-sm text-gray-600 dark:text-gray-400">{fallbackText}</p>
          <button
            onClick={() => location.reload()}
            className="text-xs text-blue-600 hover:underline focus:outline-none"
          >
            Recargar
          </button>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

// ------------------------------------------------------------------
// Type declarations for error monitoring integration
// ------------------------------------------------------------------
declare global {
  interface Window {
    __ERROR_MONITOR__?: {
      report: (error: Error, info?: unknown) => void;
    };
  }
}