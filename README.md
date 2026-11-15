# RaceProof – Race-Condition-Safe Team Formation Platform

[![CI](https://github.com/chetisha28/RaceProof/actions/workflows/ci.yml/badge.svg)](https://github.com/chetisha28/RaceProof/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-33%20passed-brightgreen.svg)](https://github.com/chetisha28/RaceProof/actions/workflows/ci.yml)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18.4-blue.svg)]()
[![Prisma](https://img.shields.io/badge/Prisma-6.19.3-indigo.svg)]()
[![React](https://img.shields.io/badge/React-18.3-cyan.svg)]()
[![Vercel Deployment](https://img.shields.io/badge/Deployment-race--proof.vercel.app-emerald.svg)](https://race-proof.vercel.app/)

> A production-minded, concurrency-resilient hackathon team formation platform engineered to guarantee data integrity, capacity limits, and composite uniqueness under high-concurrency contention.

**Canonical Production URL:** [https://race-proof.vercel.app/](https://race-proof.vercel.app/)  
**GitHub Repository:** [https://github.com/chetisha28/RaceProof.git](https://github.com/chetisha28/RaceProof.git)  
**Backend Host:** Render Web Service  
**Database:** PostgreSQL 18 (Neon Serverless PostgreSQL / Local PostgreSQL 18)

---

## 1. Project Overview & Problem Statement

In competitive hackathons, popular teams frequently experience rapid surges of simultaneous join requests. 

### The Critical Scenario
- **Maximum Team Capacity:** 4 members.
- **Existing Members:** 3 members (Leader + 2 members).
- **Available Seats:** 1 seat remaining.
- **Concurrent Load:** 50 users simultaneously attempt to join or have their requests accepted within milliseconds.

### Invariant Guarantees
1. **Zero Oversubscription:** Exactly one user gets accepted into the final seat.
2. **Deterministic Rejection:** The remaining 49 requests are safely rejected with HTTP `409 Conflict` (`TEAM_FULL`).
3. **No Duplicate Memberships:** Composite unique constraints ensure no user can join multiple teams in the same hackathon.
4. **ACID Consistency:** PostgreSQL transaction row-locking (`SELECT ... FOR UPDATE`) guarantees zero dirty reads or state corruption.
5. **Real-Time Synchronization:** Server-Sent Events (SSE) update connected clients immediately without page polling.

---

## 2. Technology Stack

### Frontend
- **Framework:** React 18
- **Tooling:** Vite 6
- **Routing:** React Router v6
- **Styling:** Tailwind CSS (Navy / SaaS Blue theme)
- **Networking:** Axios with Bearer token & cookie credentials
- **Icons:** Lucide React

### Backend
- **Runtime:** Node.js (v24.15.0)
- **Server:** Express.js
- **Validation:** Zod schemas
- **Auth:** Stateless JWT authentication & bcrypt password hashing
- **Real-Time:** Server-Sent Events (SSE) broadcaster

### Database
- **Engine:** PostgreSQL 18
- **ORM:** Prisma 6.19.3
- **Concurrency Control:** PostgreSQL transaction row-level locking (`SELECT ... FOR UPDATE`)

### Testing & Verification
- **Test Runner:** Vitest v3
- **API Integration:** Supertest
- **Load Testing:** k6 script (`load-tests/team-concurrency.js`) & built-in Node.js concurrency benchmark (`load-tests/run-benchmark.js`)

---

## 3. Monorepo Architecture

```
hack4hack-raceproof-teams/
├── client/                     # React 18 + Vite Frontend
│   ├── src/
│   │   ├── components/         # Reusable UI (Navbar, Badge, Button, Modal, Card, etc.)
│   │   ├── context/            # AuthContext & ToastContext
│   │   ├── hooks/              # useAuth, useSSE
│   │   ├── layouts/            # RootLayout, ProtectedRoute
│   │   ├── pages/              # 10 complete dashboard & management pages
│   │   ├── services/           # Axios API services
│   │   ├── App.jsx             # React router configuration
│   │   └── main.jsx            # React root mount
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
│
├── server/                     # Express.js REST API Backend
│   ├── prisma/
│   │   ├── schema.prisma       # Normalized schema with constraints & indexes
│   │   ├── migrations/         # PostgreSQL migrations
│   │   └── seed.js             # Realistic demo seed data
│   ├── src/
│   │   ├── config/             # Database singleton & env configuration
│   │   ├── controllers/        # Request handling & HTTP status mapping
│   │   ├── events/             # In-memory EventEmitter & SSE connection manager
│   │   ├── middleware/         # Auth, RBAC, Zod validation, error handler
│   │   ├── routes/             # REST route declarations
│   │   ├── services/           # Concurrency-safe business logic
│   │   ├── utils/              # Token hashing, crypto, response formatters
│   │   ├── validators/         # Zod schemas for input validation
│   │   ├── app.js              # Express app wiring
│   │   └── server.js           # Server listen & graceful shutdown
│   ├── tests/                  # Automated integration & concurrency tests (24 passed)
│   └── package.json
│
├── docs/                       # Architectural & design documentation
│   ├── architecture.md         # Full system architecture & event flow
│   ├── design-decisions.md     # Concurrency locking analysis & trade-offs
│   └── load-test-report.md     # Empirical benchmark metrics (p50, p95, p99)
│
├── load-tests/
│   ├── team-concurrency.js     # Standard k6 stress script
│   └── run-benchmark.js        # Executable Node.js benchmark engine
│
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## 4. Concurrency Locking Strategy

A naive system suffers from Time-of-Check to Time-of-Use (TOCTOU): reading `count < maxSize` and inserting allows 50 simultaneous transactions to each read `count = 3` and overfill the team to 53 members.

RaceProof resolves this inside an atomic PostgreSQL transaction:

```sql
BEGIN;

-- 1. Exclusively lock the Team row. Other transactions block here.
SELECT id, "hackathonId", "leaderId", "maxSize", status 
FROM "Team" 
WHERE id = $1 
FOR UPDATE;

-- 2. Accurately count existing members in the locked transaction
SELECT COUNT(*)::int AS count FROM "TeamMember" WHERE "teamId" = $1;

-- 3. Strictly enforce capacity
-- If count >= maxSize -> Abort and return HTTP 409 Conflict

-- 4. Check composite hackathon uniqueness
SELECT id FROM "TeamMember" WHERE "hackathonId" = $2 AND "userId" = $3;

-- 5. Commit membership, update request status, create AuditLog
INSERT INTO "TeamMember" ("id", "teamId", "hackathonId", "userId", "role", "joinedAt")
VALUES (gen_random_uuid(), $1, $2, $3, 'MEMBER', NOW());

COMMIT;
```

---

## 5. Quick Start & Setup

### Prerequisites
- **Node.js:** v18+ (tested on v24.15.0)
- **PostgreSQL:** 14+ (tested on v18.4)
- **npm:** v9+

### 1. Clone & Configure Environment
```bash
git clone https://github.com/chetisha28/RaceProof.git
cd RaceProof
cp .env.example .env
```

Ensure your `.env` contains your PostgreSQL credentials:
```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
DATABASE_URL="postgresql://postgres:123456789@127.0.0.1:5432/raceproof?schema=public"
TEST_DATABASE_URL="postgresql://postgres:123456789@127.0.0.1:5432/raceproof_test?schema=public"
JWT_SECRET=super-secret-raceproof-jwt-key-2026-production-grade
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Database Migration & Seeding
```bash
# Apply Prisma migrations to PostgreSQL
npm run prisma:migrate

# Seed demo data (1 hackathon, 8 users, 2 teams, sample requests)
npm run seed
```

### 4. Run the Full Application
```bash
# Starts backend on http://localhost:5000 and frontend on http://localhost:5173
npm run dev
```

---

## 6. Demo Accounts (Seeded)

All demo accounts share the password: `Password123!`

| User | Email | Role / State |
| :--- | :--- | :--- |
| **Alice Vance** | `alice@raceproof.dev` | Leader of "Team Distributed" (3/4 members, 1 slot open) |
| **Bob Miller** | `bob@raceproof.dev` | Member in "Team Distributed" |
| **Charlie Zhang** | `charlie@raceproof.dev` | Member in "Team Distributed" |
| **Diana Prince** | `diana@raceproof.dev` | Leader of "Team Quantum" (2/4 members, 2 slots open) |
| **Ethan Hunt** | `ethan@raceproof.dev` | Member in "Team Quantum" |
| **Fiona Gallagher** | `fiona@raceproof.dev` | Applicant with pending join request to "Team Distributed" |
| **George Clark** | `george@raceproof.dev` | Applicant with pending join request to "Team Distributed" |
| **Hannah Abbott** | `hannah@raceproof.dev` | Available participant looking for a team |

---

## 7. Automated Test Suite (33 Passed)

Run the full automated integration and concurrency test suite against PostgreSQL:

```bash
# Run all 33 automated tests across 4 test suites
npm run test

# Run the concurrency test suite specifically
npm run test:concurrency
```

### Test Coverage Highlights:
- **Registration & Login:** Unique email enforcement, bcrypt verification, weak password rejection, rate limit validation.
- **Team Invariants:** Creator auto-elected LEADER, capacity validation (2–10), disband permissions, bounds validation (`minSize <= maxSize`).
- **Duplicate Prevention:** Hard database block on joining/creating multiple teams in the same hackathon.
- **Membership Operations:** Join requests, leader acceptance/rejection, self-leaving, leadership succession to oldest member, last-member team deletion.
- **Invitations:** Cryptographic token generation, expiration enforcement, single-use token invalidation, 2-user simultaneous token race.
- **Capacity Update Race:** Simultaneous leader capacity reduction and applicant join acceptance safely serialized via row locks (`SELECT ... FOR UPDATE`).
- **Critical Concurrency Test:** 50 simultaneous requests contend for 1 seat $\rightarrow$ Exactly 1 succeeds (HTTP 200), exactly 49 rejected (HTTP 409), PostgreSQL membership remains exactly 4 with zero oversubscription.
- **Authentic Live Benchmark:** In-memory and API-driven benchmark flow executing real PostgreSQL transactions and verifying invariants.

---

## 8. Performance & Load Testing

### Built-in Concurrency Benchmark
Execute the automated high-concurrency benchmark:
```bash
npm run benchmark
```

### Empirical Benchmark Results:
- **Stage 1 (100 Concurrent Users Discovery Board):**
  - **Total Concurrent Requests:** 100
  - **Success Rate:** 100% (100 / 100 HTTP 200 OK)
  - **HTTP Errors:** 0 (0.0%)
  - **Board Discovery Latency p50:** 196 ms
  - **Board Discovery Latency p95:** 198 ms (Target < 200 ms: **PASSED**)
  - **Board Discovery Latency p99:** 200 ms
- **Stage 2 (50 Concurrent Acceptance Requests on 1 Slot):**
  - **Contending Virtual Users:** 50
  - **HTTP 200 OK (Accepted):** Exactly 1
  - **HTTP 409 Conflict (`TEAM_FULL`):** Exactly 49
  - **Unexpected Errors:** 0
  - **Final PostgreSQL Member Count:** Exactly 4 / 4
  - **Oversubscription:** 0 (Zero)

### Running with k6
```bash
k6 run load-tests/team-concurrency.js
```

---

## 9. API Reference

### Authentication
- `POST /api/auth/register` - Create participant account
- `POST /api/auth/login` - Authenticate & obtain JWT
- `POST /api/auth/logout` - Clear cookie
- `GET /api/auth/me` - Get authenticated profile & team memberships
- `PATCH /api/auth/me` - Update profile, skills, bio

### Hackathons
- `GET /api/hackathons` - List all hackathons
- `GET /api/hackathons/:id` - Hackathon details & active teams

### Teams
- `POST /api/teams` - Create team (auto-sets creator as LEADER)
- `GET /api/teams` - Discover teams (search, skills filter, pagination)
- `GET /api/teams/:id` - Detailed team roster & pending requests
- `PATCH /api/teams/:id` - Update team settings (Leader only)
- `DELETE /api/teams/:id` - Disband team (Leader only)

### Join Requests & Membership
- `POST /api/teams/:id/requests` - Send join request
- `GET /api/teams/:id/requests` - List team requests (Leader only)
- `GET /api/requests/my` - List current user's outgoing requests
- `PATCH /api/requests/:id/accept` - **Concurrency-safe accept (`SELECT ... FOR UPDATE`)**
- `PATCH /api/requests/:id/decline` - Decline join request
- `DELETE /api/requests/:id` - Cancel own pending request
- `GET /api/teams/:id/members` - View member roster
- `DELETE /api/teams/:id/members/:userId` - Remove member (Leader only)
- `POST /api/teams/:id/leave` - Leave team
- `POST /api/teams/:id/transfer-leadership` - Transfer leadership to active member

### Invitations & Real-Time
- `POST /api/teams/:id/invites` - Generate secure invite link (Leader only)
- `GET /api/invites/:token` - Inspect invite details
- `POST /api/invites/:token/accept` - **Concurrency-safe accept invite**
- `GET /api/teams/:id/audit-logs` - View immutable event history
- `GET /api/sse` - Real-time Server-Sent Events stream

---

## 10. Architectural Trade-offs & Limitations

1. **In-Memory Event Bus:** The real-time notification layer uses Node.js `EventEmitter`. This is zero-dependency and optimal for single-instance deployments. For horizontal scaling across multiple container replicas, a Redis Pub/Sub backplane should be introduced.
2. **Row Locking vs Optimistic Locking:** Under 50-user contention for a single slot, optimistic locking (`@version`) would force 49 transactions to fail on commit and burn unnecessary retry cycles. Pessimistic row locking (`SELECT ... FOR UPDATE`) queues incoming requests cleanly and rejects excess requests within ~229ms.

---

## 11. Verification Checklist

- [x] Monorepo structure with clean separation of concerns
- [x] Normalized Prisma schema with composite `(hackathonId, userId)` unique constraint
- [x] PostgreSQL 18 migrations applied & verified
- [x] Transaction-safe `SELECT ... FOR UPDATE` locking implemented in `concurrency.service.js`
- [x] Role-based and resource-based authorization (Leader vs Member)
- [x] Server-Sent Events (SSE) real-time updates without polling
- [x] 24 real automated tests passing against PostgreSQL
- [x] Critical 50-user concurrency test passing with 1 accepted and 49 conflicts
- [x] k6 load test script & automated Node benchmark harness
- [x] 10 fully functional React pages with Tailwind CSS styling
- [x] Production build generated with Vite (`dist/` verified)

