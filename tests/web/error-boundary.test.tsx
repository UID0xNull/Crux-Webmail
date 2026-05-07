// ============================================================================
// Crux-Webmail — Unit Tests: Error Boundary & Performance Provider
// ============================================================================

import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  ErrorBoundary,
  ComponentErrorBoundary,
} from 'src/web/components/ui/ErrorBoundary';
import { PerformanceProvider, usePerformance } from 'src/web/components/ui/PerformanceProvider';

// ------------------------------------------------------------------
// Error Boundary Tests
// ------------------------------------------------------------------
describe('ErrorBoundary', () => {
  it('should render children normally', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Hello World</div>
      </ErrorBoundary>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('should catch render errors and show fallback', () => {
    const ThrowComponent = () => {
      throw new Error('Boom!');
    };

    const { container } = render(
      <ErrorBoundary>
        <ThrowComponent />
      </ErrorBoundary>
    );

    // Fallback UI should be present
    expect(container).toHaveTextContent('Algo salió mal');
  });

  it('should handle custom errorComponent', () => {
    const ThrowComponent = () => {
      throw new Error('Custom boom');
    };

    const CustomFallback = () => <div data-testid="custom-fallback">Custom Error</div>;

    const { container } = render(
      <ErrorBoundary errorComponent={CustomFallback}>
        <ThrowComponent />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
  });

  it('should track errors via onerror callback', () => {
    const onError = jest.fn();
    const ThrowComponent = () => {
      throw new Error('Tracked error');
    };

    render(
      <ErrorBoundary onerror={onError}>
        <ThrowComponent />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe('Tracked error');
  });
});

describe('ComponentErrorBoundary', () => {
  it('should wrap a single component with its own boundary', () => {
    const ThrowComponent = () => {
      throw new Error('Inner error');
    };

    const { container } = render(
      <ComponentErrorBoundary component={ThrowComponent} fallback="Error occurred" />
    );

    expect(container).toHaveTextContent('Error occurred');
  });

  it('should render component when no error', () => {
    const SafeComponent = () => <div data-testid="safe">Safe</div>;

    render(
      <ComponentErrorBoundary component={SafeComponent} fallback="Error" />
    );

    expect(screen.getByTestId('safe')).toBeInTheDocument();
  });
});

// ------------------------------------------------------------------
// Performance Provider Tests
// ------------------------------------------------------------------
describe('PerformanceProvider', () => {
  it('should provide default metrics', () => {
    const Consumer = () => {
      const { metrics } = usePerformance();
      return (
        <div>
          <span data-testid="renders">{metrics.componentRenders}</span>
          <span data-testid="monitoring">{metrics.fcp !== null ? 'has-fcp' : 'no-fcp'}</span>
        </div>
      );
    };

    render(
      <PerformanceProvider>
        <Consumer />
      </PerformanceProvider>
    );

    expect(screen.getByTestId('renders')).toHaveTextContent('0');
  });

  it('should report custom metrics', () => {
    const Consumer = () => {
      const { report } = usePerformance();
      React.useEffect(() => {
        report('test-component', 42);
      }, []);
      return <div>Done</div>;
    };

    render(
      <PerformanceProvider>
        <Consumer />
      </PerformanceProvider>
    );
  });

  it('should clear metrics', () => {
    const Consumer = () => {
      const { metrics, clearMetrics } = usePerformance();
      return (
        <button onClick={clearMetrics}>
          Renders: {metrics.componentRenders}
        </button>
      );
    };

    render(
      <PerformanceProvider>
        <Consumer />
      </PerformanceProvider>
    );

    expect(screen.getByText(/Renders:/)).toBeInTheDocument();
  });
});