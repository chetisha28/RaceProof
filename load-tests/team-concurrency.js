import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const teamDiscoveryTrend = new Trend('team_discovery_duration', true);
const teamDetailTrend = new Trend('team_detail_duration', true);
const joinRequestTrend = new Trend('join_request_duration', true);
const acceptRequestTrend = new Trend('accept_request_duration', true);
const conflictCounter = new Counter('capacity_conflict_count');
const successCounter = new Counter('success_join_count');

export const options = {
  scenarios: {
    // Scenario 1: High-concurrency discovery & detail read load
    read_traffic: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '10s', target: 50 },
        { duration: '20s', target: 50 },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '5s',
      exec: 'readTraffic',
    },
    // Scenario 2: High-contention join request submissions
    join_contention: {
      executor: 'per-vu-iterations',
      vus: 50,
      iterations: 1,
      startTime: '5s',
      maxDuration: '20s',
      exec: 'joinContention',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'], // Max 5% unexpected server failure (409 is expected for full teams)
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    team_discovery_duration: ['p(95)<300'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000/api';

export function readTraffic() {
  group('1. Concurrent Team Discovery', () => {
    const res = http.get(`${BASE_URL}/teams?page=1&limit=10`);
    teamDiscoveryTrend.add(res.timings.duration);
    check(res, {
      'Discovery status is 200': (r) => r.status === 200,
      'Discovery returned teams array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.data);
        } catch {
          return false;
        }
      },
    });
  });

  sleep(0.5);

  group('2. Concurrent Team Details', () => {
    // Fetch first available team
    const listRes = http.get(`${BASE_URL}/teams?limit=1`);
    if (listRes.status === 200) {
      try {
        const teams = JSON.parse(listRes.body).data;
        if (teams.length > 0) {
          const teamId = teams[0].id;
          const detailRes = http.get(`${BASE_URL}/teams/${teamId}`);
          teamDetailTrend.add(detailRes.timings.duration);
          check(detailRes, {
            'Team details status is 200': (r) => r.status === 200,
            'Has member count': (r) => JSON.parse(r.body).data.memberCount !== undefined,
          });
        }
      } catch (e) {}
    }
  });

  sleep(0.5);
}

export function joinContention() {
  const vuId = __VU;
  const email = `load_applicant_${vuId}@raceproof.dev`;
  const password = 'Password123!';

  // Step 1: Register unique applicant
  const regPayload = JSON.stringify({
    name: `Load Applicant ${vuId}`,
    email: email,
    password: password,
  });

  const regRes = http.post(`${BASE_URL}/auth/register`, regPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  let token = null;
  if (regRes.status === 201) {
    token = JSON.parse(regRes.body).data.token;
  } else if (regRes.status === 409) {
    // User exists, login
    const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email, password }), {
      headers: { 'Content-Type': 'application/json' },
    });
    if (loginRes.status === 200) {
      token = JSON.parse(loginRes.body).data.token;
    }
  }

  if (!token) return;

  // Step 2: Submit join request to target team
  const teamsRes = http.get(`${BASE_URL}/teams?search=Distributed`);
  if (teamsRes.status === 200) {
    try {
      const teams = JSON.parse(teamsRes.body).data;
      if (teams.length > 0) {
        const teamId = teams[0].id;

        const reqPayload = JSON.stringify({
          message: `Concurrent load test join submission from VU ${vuId}`,
        });

        const submitRes = http.post(`${BASE_URL}/teams/${teamId}/requests`, reqPayload, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        joinRequestTrend.add(submitRes.timings.duration);

        if (submitRes.status === 201) {
          successCounter.add(1);
        } else if (submitRes.status === 409) {
          conflictCounter.add(1);
        }

        check(submitRes, {
          'Join status is 201 or 409 (valid response)': (r) => r.status === 201 || r.status === 409,
        });
      }
    } catch (e) {}
  }
}

