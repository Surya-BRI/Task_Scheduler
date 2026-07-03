import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Smoke load test — run against a running API:
 *   k6 run perf/api-smoke.js
 *
 * Override targets:
 *   k6 run -e API_BASE=http://localhost:7000/api/v1 -e VUS=100 perf/api-smoke.js
 */
const API_BASE = __ENV.API_BASE ?? 'http://localhost:7000/api/v1';
const VUS = Number(__ENV.VUS ?? 50);

export const options = {
  vus: VUS,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
};

export default function () {
  const health = http.get(`${API_BASE}/health`);
  check(health, {
    'health status 200': (r) => r.status === 200,
    'health body ok': (r) => r.json('status') === 'ok',
  });

  const login = http.post(
    `${API_BASE}/auth/login`,
    JSON.stringify({ email: 'invalid@example.com', password: 'wrong' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(login, {
    'login rejects bad credentials': (r) => r.status === 401,
  });

  sleep(1);
}
