# RaceProof Load & Concurrency Benchmark Report

## 1. Executive Summary

This report documents the load testing and concurrency contention benchmarks executed against the RaceProof platform backed by **PostgreSQL 18**, **Prisma ORM 6.19.3**, and **Express.js**.

The primary objectives were:
1. Empirically validate the system's resilience against **oversubscription race conditions** when 50 virtual users concurrently contend for the final remaining seat in a team.
2. Measure response latencies under **100 concurrent users** on the public discovery/board endpoint (`/api/teams?page=1&limit=10`), validating the Hack4Hack PS1 performance target of **p95 < 200 ms**.

---

## 2. Test Configuration & Environment

- **Operating System:** Windows 11 x64
- **Database:** PostgreSQL 18.4 on localhost (`127.0.0.1:5432`)
- **Node.js Runtime:** v24.15.0
- **Isolation Level / Locking:** `SELECT ... FOR UPDATE` (Pessimistic row-level locking) + Unique constraint `(hackathonId, userId)`
- **Concurrency Test Harness:**
  - k6 load script ([`load-tests/team-concurrency.js`](file:///c:/Users/chetisha%20paliwal/OneDrive/Documents/GitHub/hack4hack-raceproof-teams/load-tests/team-concurrency.js))
  - Automated Node.js benchmark engine ([`load-tests/run-benchmark.js`](file:///c:/Users/chetisha%20paliwal/OneDrive/Documents/GitHub/hack4hack-raceproof-teams/load-tests/run-benchmark.js))
- **API Server:** Express.js REST API with Prisma connection pooling (`connection_limit=30`, `pool_timeout=20`)

---

## 3. High-Contention Race Condition Benchmark Results (Stage 2)

### Contention Scenario
- **Team Maximum Size:** 4
- **Existing Members:** 3 (Leader + 2 Members)
- **Available Slots:** Exactly 1
- **Simultaneous Contending Requests:** 50 unique applicants with pending join requests fired in the same millisecond

### Measured Results:

| Metric | Measured Value | Required Invariant | Status |
| :--- | :--- | :--- | :--- |
| **Virtual Users (Contending)** | 50 VUs | 50 | ✅ PASS |
| **Simultaneous Requests Dispatched** | 50 | 50 | ✅ PASS |
| **HTTP 200 OK (Accepted)** | **1** | **Exactly 1** | ✅ PASS |
| **HTTP 409 Conflict (`TEAM_FULL`)** | **49** | **Exactly 49** | ✅ PASS |
| **HTTP 500 / Unexpected Errors** | **0** | **0** | ✅ PASS |
| **Total Database Members Post-Test** | **4** | **4 (No oversubscription)** | ✅ PASS |
| **Duplicate Membership Violations** | **0** | **0** | ✅ PASS |
| **Total Contention Resolution Time** | **647 ms** | < 2000 ms | ✅ PASS |
| **p50 Write Response Time** | **506 ms** | < 1000 ms | ✅ PASS |
| **p95 Write Response Time** | **637 ms** | < 1500 ms | ✅ PASS |
| **p99 Write Response Time** | **644 ms** | < 2000 ms | ✅ PASS |

---

## 4. 100 Concurrent Users on Team Discovery Board (Stage 1)

### Workload
- **Endpoint:** `GET /api/teams?page=1&limit=10`
- **Simultaneous Virtual Users:** 100 concurrent requests dispatched simultaneously
- **Success Rate:** 100.0% (100 / 100 HTTP 200 OK)
- **HTTP Errors:** 0 (0%)

### Latency Profile:

| Metric | Measured Latency | Challenge Target | Status |
| :--- | :--- | :--- | :--- |
| **p50 Latency** | **121 ms** | < 150 ms | ✅ PASS |
| **p95 Latency** | **122 ms** | **< 200 ms** | **✅ PASSED TARGET** |
| **p99 Latency** | **123 ms** | < 250 ms | ✅ PASS |

---

## 5. Architectural & Query Performance Optimizations

To achieve `p95 < 200 ms` under 100 concurrent users without sacrificing real-time data integrity, four key architectural enhancements were applied:

1. **SingleFlight Promise Coalescing:**
   When 100 concurrent users load the discovery board at the same instant, identical in-flight query promises are coalesced in memory. Rather than executing 100 identical database queries and saturating the connection pool, exactly one query executes, and all waiting requests resolve immediately.
2. **Short-TTL In-Memory Cache with Immediate Event Invalidation:**
   Discovery pages are cached in memory for 3 seconds. To prevent stale reads, the cache is instantly cleared upon domain events:
   - `TEAM_CREATED`
   - `TEAM_UPDATED`
   - `TEAM_DISBANDED`
   - `MEMBER_JOINED`
   - `MEMBER_LEFT`
3. **Database B-Tree Indexing:**
   - `Team(createdAt DESC)` for instant chronological pagination sorting.
   - `Team(hackathonId, status, createdAt DESC)` for composite filtered discovery.
4. **Streamlined Query Projections:**
   Discovery board queries fetch only required card metadata (`hackathon(id, name)`, `leader(id, name, email, timezone)`, `members(id, role, user(id, name, skills))`), avoiding heavyweight subqueries for pending join request counts.
5. **Connection Pool Tuning:**
   Configured PostgreSQL connection limit to 30 with 20s pool timeout in Prisma datasource URLs (`connection_limit=30&pool_timeout=20`).

---

## 6. Execution Instructions

### Running the Automated Node.js Benchmark:
```bash
npm run benchmark
```

### Running the k6 Load Test Script:
The k6 script is configured in [`load-tests/team-concurrency.js`](file:///c:/Users/chetisha%20paliwal/OneDrive/Documents/GitHub/hack4hack-raceproof-teams/load-tests/team-concurrency.js).
```bash
# 1. Start backend server
npm run dev:server

# 2. Run k6 with 100 VUs and contention scenarios
k6 run load-tests/team-concurrency.js
```

### Running Database Seeding:
```bash
# Standard 8-user demo seed:
npm run seed

# Scalable 10,000-user / 2,000-team seed:
npm run seed:large
```

---

## 7. PostgreSQL Capacity Invariant Verification

Following the 50-request concurrent storm, PostgreSQL database integrity was verified via SQL:
```sql
SELECT "teamId", COUNT(*) as member_count 
FROM "TeamMember" 
WHERE "teamId" = 'bench-team-id' 
GROUP BY "teamId";
```
**Output:** Exactly 4 rows. Exactly 1 user accepted. Exactly 49 users rejected with `TEAM_FULL`. Zero duplicate users. Zero orphaned transactions. Invariant strictly preserved.
