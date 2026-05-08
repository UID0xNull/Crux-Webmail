'use client';

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
export interface PerformanceMetrics {
  // Core Web Vitals
  fcp: number | null;      // First Contentful Paint
  lcp: number | null;      // Largest Contentful Paint
  cls: number | null;      // Cumulative Layout Shift
  fid: number | null;      // First Input Delay
  ttfb: number | null;     // Time to First Byte

  // Custom metrics
  firstPaint: number | null;
  domContentLoaded: number | null;
  loadComplete: number | null;
  componentRenders: number;
  slowRenders: Map<string, number>;

  // Navigation
  navigationType: string;
  redirectCount: number;
  dnsTime: number | null;
  tcpTime: number | null;
  ttfbTime: number | null;
  domInteractive: number | null;
}

interface PerformanceContextValue {
  metrics: PerformanceMetrics;
  isMonitoring: boolean;
  report: (name: string, value: number) => void;
  clearMetrics: () => void;
}

// ------------------------------------------------------------------
// Context
// ------------------------------------------------------------------
const PerformanceContext = createContext<PerformanceContextValue | null>(null);

export function usePerformance(): PerformanceContextValue {
  const ctx = useContext(PerformanceContext);
  if (!ctx) {
    return {
      metrics: defaultMetrics(),
      isMonitoring: false,
      report: () => {},
      clearMetrics: () => {},
    };
  }
  return ctx;
}

// ------------------------------------------------------------------
// Defaults
// ------------------------------------------------------------------
function defaultMetrics(): PerformanceMetrics {
  return {
    fcp: null,
    lcp: null,
    cls: null,
    fid: null,
    ttfb: null,
    firstPaint: null,
    domContentLoaded: null,
    loadComplete: null,
    componentRenders: 0,
    slowRenders: new Map(),
    navigationType: 'navigate',
    redirectCount: 0,
    dnsTime: null,
    tcpTime: null,
    ttfbTime: null,
    domInteractive: null,
  };
}

// ------------------------------------------------------------------
// PerformanceProvider
// ------------------------------------------------------------------
export function PerformanceProvider({ children }: { children: ReactNode }) {
  const [metrics, setMetrics] = useState<PerformanceMetrics>(defaultMetrics());
  const slowRendersRef = useRef<Map<string, number>>(new Map());
  const renderCountRef = useRef(0);
  const observersRef = useRef<PerformanceObserver[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ----------------------------------------------------------------
  // Navigation Timing
  // ----------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;

      if (navEntry) {
        const dnsTime = navEntry.domainLookupEnd - navEntry.domainLookupStart;
        const tcpTime = navEntry.connectEnd - navEntry.connectStart;
        const ttfbTime = navEntry.responseStart - navEntry.requestStart;
        const domInteractive = navEntry.domInteractive - navEntry.startTime;
        const domContentLoaded = navEntry.domContentLoadedEventEnd - navEntry.startTime;
        const loadComplete = navEntry.loadEventEnd - navEntry.startTime;

        setMetrics((prev) => ({
          ...prev,
          navigationType: navEntry.type,
          redirectCount: navEntry.redirectCount,
          dnsTime: dnsTime >= 0 ? dnsTime : null,
          tcpTime: tcpTime >= 0 ? tcpTime : null,
          ttfbTime: ttfbTime >= 0 ? ttfbTime : null,
          domInteractive: domInteractive >= 0 ? domInteractive : null,
          domContentLoaded,
          loadComplete,
        }));
      }
    } catch {
      // Performance API not available
    }
  }, []);

  // ----------------------------------------------------------------
  // Largest Contentful Paint (LCP)
  // ----------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let lcpValue = 0;

    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          lcpValue = entry.startTime;
        }
        setMetrics((prev) => ({ ...prev, lcp: lcpValue }));
      });

      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      observersRef.current.push(lcpObserver);
    } catch {
      // LCP not supported
    }

    return () => {
      observersRef.current.forEach((obs) => obs.disconnect());
      observersRef.current = [];
    };
  }, []);

  // ----------------------------------------------------------------
  // Cumulative Layout Shift (CLS)
  // ----------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const clsObserver = new PerformanceObserver((list) => {
        let clsValue = 0;
        for (const entry of list.getEntries()) {
          const ls = entry as LayoutShift;
          if (!ls.hadRecentInput) {
            clsValue += ls.value;
          }
        }
        setMetrics((prev) => ({ ...prev, cls: clsValue }));
      });

      clsObserver.observe({ type: 'layout-shift', buffered: true });
      observersRef.current.push(clsObserver);
    } catch {
      // CLS not supported
    }
  }, []);

  // ----------------------------------------------------------------
  // First Input Delay (FID)
  // ----------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const fidObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const fid = entry.processingStart - entry.startTime;
          setMetrics((prev) => ({ ...prev, fid }));
        }
      });

      fidObserver.observe({ type: 'first-input', buffered: true });
      observersRef.current.push(fidObserver);
    } catch {
      // FID not supported
    }
  }, []);

  // ----------------------------------------------------------------
  // First Contentful Paint (FCP)
  // ----------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const fcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          setMetrics((prev) => ({ ...prev, fcp: entry.startTime }));
        }
      });

      fcpObserver.observe({ type: 'paint', buffered: true });
      observersRef.current.push(fcpObserver);
    } catch {
      // FCP not supported
    }
  }, []);

  // ----------------------------------------------------------------
  // Paint timing (First Paint)
  // ----------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const paintEntries = performance.getEntriesByType('paint');
      for (const entry of paintEntries) {
        if (entry.name === 'first-paint') {
          setMetrics((prev) => ({ ...prev, firstPaint: entry.startTime }));
        }
      }
    } catch {
      // Paint API not available
    }
  }, []);

  // ----------------------------------------------------------------
  // Dev: periodic slow-render logging
  // ----------------------------------------------------------------
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    intervalRef.current = setInterval(() => {
      if (slowRendersRef.current.size > 0) {
        console.group('[Performance] Slow Renders');
        slowRendersRef.current.forEach((ms, name) => {
          console.warn(`${name}: ${ms.toFixed(2)}ms`);
        });
        console.groupEnd();
      }
    }, 30_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // ----------------------------------------------------------------
  // Cleanup observers on unmount
  // ----------------------------------------------------------------
  useEffect(() => {
    return () => {
      observersRef.current.forEach((obs) => {
        try {
          obs.disconnect();
        } catch {
          // Observer already disconnected
        }
      });
      observersRef.current = [];
    };
  }, []);

  // ----------------------------------------------------------------
  // Context value
  // ----------------------------------------------------------------
  const contextValue: PerformanceContextValue = {
    metrics: {
      ...metrics,
      slowRenders: slowRendersRef.current,
      componentRenders: renderCountRef.current,
    },
    isMonitoring: true,
    report: (name: string, value: number) => {
      slowRendersRef.current.set(name, value);
      setMetrics((prev) => ({ ...prev })); // trigger re-render
    },
    clearMetrics: () => {
      setMetrics(defaultMetrics());
      slowRendersRef.current.clear();
      renderCountRef.current = 0;
    },
  };

  return (
    <PerformanceContext.Provider value={contextValue}>
      {children}
    </PerformanceContext.Provider>
  );
}

// ------------------------------------------------------------------
// Hook: track component render time
// ------------------------------------------------------------------
export function useRenderTime(componentName: string, thresholdMs = 100): void {
  const startTime = useRef<number | null>(null);
  const { report } = usePerformance();

  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    startTime.current = performance.now();
  }, []);

  // Measure on state changes (approximate)
  React.useInsertionEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const now = performance.now();
    if (startTime.current) {
      const elapsed = now - startTime.current;
      if (elapsed > thresholdMs) {
        report(componentName, elapsed);
      }
      startTime.current = null;
    }
  });
}

// ------------------------------------------------------------------
// Hook: track route transition time
// ------------------------------------------------------------------
export function useRouteTransition(routeName: string): void {
  const startTimeRef = useRef<number>(0);
  const { report } = usePerformance();

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    startTimeRef.current = performance.now();

    return () => {
      const elapsed = performance.now() - startTimeRef.current;
      report(`route:${routeName}`, elapsed);
    };
  }, [routeName, report]);
}