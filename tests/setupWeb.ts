// ============================================================================
// Crux-Webmail — Jest Web Setup (Frontend / jsdom)
// ============================================================================

import '@testing-library/jest-dom';

// ------------------------------------------------------------------
// Mock window APIs
// ------------------------------------------------------------------

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = () => {};
  disconnect = () => {};
  unobserve = () => {};
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: class MockResizeObserver {
    observe = () => {};
    disconnect = () => {};
    unobserve = () => {};
  },
});

// Mock PerformanceObserver for Core Web Vitals
class MockPerformanceObserver {
  observe = () => {};
  disconnect = () => {};
  takeRecords = () => [];
}

Object.defineProperty(window, 'PerformanceObserver', {
  writable: true,
  value: MockPerformanceObserver,
});

// Mock crypto.getRandomValues
Object.defineProperty(window, 'crypto', {
  writable: true,
  value: {
    getRandomValues: (buffer: Uint8Array) => {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = Math.floor(Math.random() * 256);
      }
      return buffer;
    },
  },
});

// ------------------------------------------------------------------
// Suppress console errors in tests (unless explicitly enabled)
// ------------------------------------------------------------------
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('Warning:')) return;
    originalError(...args);
  };
});

afterAll(() => {
  console.error = originalError;
});