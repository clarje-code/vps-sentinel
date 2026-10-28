import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const reqDuration = new Trend('app_duration');
const failureRate = new Rate('app_failures');

export const options = {
  stages: [
    { duration: '10s', target: 5 },
    { duration: '20s', target: 10 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{status:200}': ['p(95)<800'],
    'app_failures': ['rate<0.01'],
  },
};

const BASE_URL = __ENV.APP_URL || 'https://delivery.sokoci.com';

export default function () {
  const params = { headers: { 'User-Agent': 'VPS-Sentinel-Bot/1.0' }, timeout: '8s' };

  // 1. /up
  const r1 = http.get(`${BASE_URL}/up`, params);
  reqDuration.add(r1.timings.duration);
  failureRate.add(r1.status !== 200);

  sleep(0.5);

  // 2. /login
  const r2 = http.get(`${BASE_URL}/login`, params);
  reqDuration.add(r2.timings.duration);
  failureRate.add(r2.status !== 200);

  sleep(1);

  // 3. /guide
  const r3 = http.get(`${BASE_URL}/guide`, params);
  reqDuration.add(r3.timings.duration);
  failureRate.add(r3.status !== 200);

  sleep(1);
}
