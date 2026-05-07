// ============================================================================
// Baseline Load Test — Crux-Webmail
// ============================================================================
// Simula tráfico realista (20 VUs por 5 min) para establecer línea base
// Uso: k6 run tests/load/baseline-test.js
// ============================================================================

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('http_errors');
const apiLatency = new Trend('api_latency', true);

export const options = {
  scenarios: {
    baseline: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '30s', target: 10 },  // Ramp up
        { duration: '2m',   target: 20 },  // Steady state
        { duration: '1m',   target: 30 },  // Peak
        { duration: '1m',   target: 20 },  // Cool down
        { duration: '30s',  target: 0 },   // Stop
      ],
      gracefulRampDownPeriod: '10s',
    },
  },
  thresholds: {
    http_req_duration: ['p(90)<500', 'p(95)<1000', 'p(99)<2000'],
    http_errors: ['rate<0.05'],
    api_latency: ['p(95)<1500'],
    iterations: ['count>100'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';
const WEB_URL  = __ENV.WEB_BASE_URL || 'http://localhost:3001';

// ============================================================================
// Workload profiles
// ============================================================================
const endpoints = {
  health: { method: 'GET', path: '/health', weight: 20 },
  admin_users: { method: 'GET', path: '/api/admin/users', weight: 15 },
  admin_stats: { method: 'GET', path: '/api/admin/stats', weight: 10 },
  admin_domains: { method: 'GET', path: '/api/admin/domains', weight: 10 },
  admin_settings: { method: 'GET', path: '/api/admin/settings', weight: 5 },
  login: { method: 'POST', path: '/api/auth/login', weight: 25 },
  web_index: { method: 'GET', path: '/', weight: 15 },
};

function weightedRandom() {
  const items = Object.entries(endpoints);
  const totalWeight = items.reduce((sum, [, v]) => sum + v.weight, 0);
  let r = Math.random() * totalWeight;
  for (const [key, val] of items) {
    r -= val.weight;
    if (r <= 0) return val;
  }
  return items[0][1];
}

// ============================================================================
// Auth helper
// ============================================================================
const authState = {};

function loginIfNeeded() {
  if (authState.token && Date.now() - authState.tokenExpiry < 5 * 60 * 1000) {
    return authState.token;
  }
  const payload = JSON.stringify({
    username: __ENV.TEST_USERNAME || 'admin',
    password: __ENV.TEST_PASSWORD || 'test-password',
  });
  const res = http.post(`${BASE_URL}/api/auth/login`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (res.status === 200) {
    try {
      const body = res.json();
      authState.token = body.token || body?.access_token;
      authState.tokenExpiry = Date.now();
    } catch {}
  }
  return null;
}

// ============================================================================
// Default iteration
// ============================================================================
export default function () {
  const endpoint = weightedRandom();
  const url = endpoint.path.startsWith('/api') || endpoint.path === '/health'
    ? `${BASE_URL}${endpoint.path}`
    : `${WEB_URL}${endpoint.path}`;

  const headers = {};
  if (authState.token && endpoint.method === 'POST') {
    headers['Authorization'] = `Bearer ${authState.token}`;
  }

  const start = Date.now();
  const params = endpoint.method === 'POST'
    ? { headers: { 'Content-Type': 'application/json', ...headers } }
    : { headers };

  const res = http[endpoint.method.toLowerCase()](
    url,
    endpoint.method === 'POST'
      ? JSON.stringify({ username: 'admin', password: 'password' })
      : null,
    params
  );

  const latency = Date.now() - start;
  apiLatency.add(latency);
  errorRate.add(res.status >= 400);

  check(res, {
    [`${endpoint.method} ${endpoint.path} returns 2xx`]: (r) =>
      r.status >= 200 && r.status < 300,
    [`${endpoint.path} latency < 1000ms`]: (r) => r.timings.duration < 1000,
  });

  sleep(Math.random() * 2 + 0.5);
}

// ============================================================================
// Summary
// ============================================================================
export function handleSummary(data) {
  return {
    'stdout': textSummary(data),
    'results/baseline-report.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  const dur = data.state?.testRunDurationMs || 0;
  const reqs = data.metrics?.http_reqs?.values?.count || 0;
  const errors = data.metrics?.http_errors?.values?.rate || 0;
  const p50 = data.metrics?.api_latency?.values?.['p(50)'] || 0;
  const p90 = data.metrics?.api_latency?.values?.['p(90)'] || 0;
  const p95 = data.metrics?.api_latency?.values?.['p(95)'] || 0;
  const p99 = data.metrics?.api_latency?.values?.['p(99)'] || 0;

  return `
╔══════════════════════════════════════════════╗
║  Crux-Webmail — Baseline Load Test Report    ║
╚══════════════════════════════════════════════╝

Duration:    ${(dur / 1000).toFixed(0)}s
Total Reqs:  ${reqs}
RPS:         ${(reqs / (dur / 1000)).toFixed(1)}

Latency:
  P50: ${p50.toFixed(0)}ms
  P90: ${p90.toFixed(0)}ms
  P95: ${p95.toFixed(0)}ms
  P99: ${p99.toFixed(0)}ms

Errors: ${(errors * 100).toFixed(2)}%
${p95 < 1000 && errors < 0.05 ? '✅ BASELINE PASSED' : '❌ BASELINE FAILED'}
`;
}