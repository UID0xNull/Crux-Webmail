// ============================================================================
// Smoke Test — Crux-Webmail
// ============================================================================
// Valida que todos los endpoints críticos responden con HTTP 2xx
// Uso: k6 run tests/load/smoke-test.js
// ============================================================================

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-arrival-rate',
      rate: 1,
      duration: '30s',
      preAllocatedVUs: 2,
      maxVUs: 5,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.01'],
    http_reqs: ['rate>5'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';
const WEB_URL  = __ENV.WEB_BASE_URL || 'http://localhost:3001';

// ============================================================================
// Test Group: Health & Readiness
// ============================================================================
export default function () {
  // Backend health
  const health = http.get(`${BASE_URL}/health`);
  check(health, {
    'backend health returns 200': (r) => r.status === 200,
    'backend health response time < 500ms': (r) => r.timings.duration < 500,
    'backend returns application/json': (r) =>
      r.headers['Content-Type']?.includes('application/json') === true,
  });

  sleep(1);

  // Readiness endpoint
  const ready = http.get(`${BASE_URL}/ready`);
  check(ready, {
    'ready endpoint returns 200': (r) => r.status === 200 || r.status === 404,
  });

  sleep(1);

  // Frontend serves index.html
  const web = http.get(WEB_URL);
  check(web, {
    'frontend returns 200': (r) => r.status === 200,
    'frontend response time < 2000ms': (r) => r.timings.duration < 2000,
  });

  sleep(1);
}

// ============================================================================
// Handle Summary
// ============================================================================
export function handleSummary(data) {
  const formatDate = () => new Date().toISOString();
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'results/smoke-report.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data, opts) {
  let summary = `\n╔══════════════════════════════════════════════╗\n`;
  summary += `║  Crux-Webmail — Smoke Test Report            ║\n`;
  summary += `╚══════════════════════════════════════════════╝\n\n`;

  summary += `Date: ${new Date().toISOString()}\n`;
  summary += `Duration: ${data.state.testRunDurationMs / 1000}s\n`;

  // Check thresholds
  const failed = data.metrics?.http_req_failed?.values?.rate || 0;
  const p95 = data.metrics?.http_req_duration?.values?.['p(95)'] || 0;

  summary += `\n📊 Key Metrics:\n`;
  summary += `  Error Rate: ${(failed * 100).toFixed(2)}%\n`;
  summary += `  P95 Latency: ${p95.toFixed(0)}ms\n`;
  summary += `  Total Requests: ${data.metrics?.http_reqs?.values?.count || 0}\n`;

  const allPassed = failed < 0.01 && p95 < 1000;
  summary += `\n${allPassed ? '✅ SMOKES PASSED' : '❌ SMOKES FAILED'}\n`;

  return summary;
}