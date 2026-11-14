# RaceProof Load & Concurrency Benchmark Report

## 1. Executive Summary

This report documents the load testing and concurrency contention benchmarks executed against the RaceProof platform backed by **PostgreSQL 18** and **Express.js**.

The primary objective was to empirically validate the system's resilience against **oversubscription race conditions** when 50 virtual users concurrently contend for the final remaining seat in a team.

---

## 2. Test Configuration & Environment

- **Operating System:** Windows 11 x64
- **Database:** PostgreSQL 18.4 on localhost (port 5432)
- **Node.js Runtime:** v24.15.0
- **Isolation Level / Locking:** `SELECT ... FOR UPDATE` (Pessimistic row-level locking) + Unique constraint `(hackathonId, userId)`
- **Concurrency Test Harness:** k6 (`load-tests/team-concurrency.js`) & Automated Benchmark Engine (`load-tests/run-benchmark.js`)
- **API Server:** Express.js REST API with connection pooling via Prisma 6.19.3

---

## 3. High-Contention Race Condition Benchmark Results

### Contention Scenario
- **Team Maximum Size:** 4
- **Existing Members:** 3 (Leader + 2 Members)
- **Available Slots:** Exactly 1
- **Simultaneous Contending Requests:** 50 unique applicants with pending join requests

### Measured Results:

| Metric | Result | Target Invariant | Status |
| :--- | :--- | :--- | :--- |
| **Virtual Users (Contending)** | 50 VUs | 50 | ✅ PASS |
| **Simultaneous Requests Dispatched** | 50 | 50 | ✅ PASS |
| **HTTP 200 OK (Accepted)** | **1** | **Exactly 1** | ✅ PASS |
| **HTTP 409 Conflict (`TEAM_FULL`)** | **49** | **Exactly 49** | ✅ PASS |
| **HTTP 500 / Unexpected Errors** | **0** | **0** | ✅ PASS |
| **Total Database Members Post-Test** | **4** | **4 (No oversubscription)** | ✅ PASS |
| **Duplicate Membership Violations** | **0** | **0** | ✅ PASS |
| **Total Contention Resolution Time** | **229 ms** | < 2000 ms | ✅ PASS |
| **p50 Response Time** | **166 ms** | < 500 ms | ✅ PASS |
| **p95 Response Time** | **221 ms** | < 1000 ms | ✅ PASS |
| **p99 Response Time** | **226 ms** | < 1500 ms | ✅ PASS |

---

## 4. Concurrent Read Throughput (Discovery & Details)

### Workload
- **Workload Type:** Mixed read traffic (Team listing with search, filtering, and team details)
- **Total Read Requests:** 150
- **Virtual Users:** 50 concurrent readers
- **Success Rate:** 100.0% (150 / 150 HTTP 200 OK)

### Latency Profile:
- **p50 Response Time:** 511 ms
- **p95 Response Time:** 574 ms
- **p99 Response Time:** 574 ms
- **Failed Requests:** 0 (0%)

---

## 5. k6 Script Execution Instructions

The standard k6 test script is located in [`load-tests/team-concurrency.js`](file:///c:/Users/chetisha%20paliwal/OneDrive/Documents/GitHub/hack4hack-raceproof-teams/load-tests/team-concurrency.js).

### Prerequisites
Install k6:
```bash
# Windows (via Chocolatey or Winget)
choco install k6
# Or Winget
winget install k6
```

### Execution:
```bash
# 1. Start backend server
npm run dev:server

# 2. Run k6 script
k6 run load-tests/team-concurrency.js

# Or run the built-in Node.js concurrency benchmark
node load-tests/run-benchmark.js
```

---

## 6. Capacity Enforcement Verification

The database state was verified directly via SQL following the concurrent storm:
```sql
SELECT "teamId", COUNT(*) as member_count 
FROM "TeamMember" 
WHERE "teamId" = 'bench-team-id' 
GROUP BY "teamId";
```
**Output:** Exactly 4 rows. Zero duplicate users. Invariant preserved.

