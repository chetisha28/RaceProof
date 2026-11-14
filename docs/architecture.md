# RaceProof System Architecture

## 1. System Topology

RaceProof is architected as a modular, decoupled full-stack application composed of:
1. **Client Tier:** React 18 single-page application powered by Vite, Tailwind CSS, and React Router.
2. **API Tier:** Node.js Express REST API server providing stateless JWT authentication, validation pipelines, and transactional services.
3. **Real-Time Tier:** Server-Sent Events (SSE) broadcaster with a client-agnostic channel broker.
4. **Data Tier:** PostgreSQL 18 with Prisma ORM and raw transaction locks for concurrency control.

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Browser                        │
│  React 18 + Tailwind CSS + Lucide Icons + EventSource (SSE) │
└──────────────┬──────────────────────────────▲───────────────┘
               │ HTTP REST Requests           │ Server-Sent Events
               ▼                              │
┌─────────────────────────────────────────────┴───────────────┐
│                     Express API Server                      │
│                                                             │
│   ┌───────────────┐  ┌────────────────┐  ┌──────────────┐   │
│   │ Auth Filter   │  │ Zod Validator  │  │ Rate Limiter │   │
│   └───────┬───────┘  └───────┬────────┘  └──────────────┘   │
│           ▼                  ▼                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                 Controllers Layer                   │   │
│   │  (Auth, Hackathon, Team, Membership, Invite, Audit) │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              ▼                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              Business Services Layer                │   │
│   │  - Concurrency Lock Engine (SELECT ... FOR UPDATE)  │   │
│   │  - Transaction Boundary Manager                     │   │
│   │  - Domain Invariant Verifiers                       │   │
│   └──────────────┬───────────────────────────┬──────────┘   │
│                  ▼                           ▼              │
│          ┌───────────────┐           ┌───────────────┐      │
│          │ Event Emitter │           │ Prisma Client │      │
│          └───────┬───────┘           └───────┬───────┘      │
└──────────────────┼───────────────────────────┼──────────────┘
                   │ Broadcast Updates         │ SQL Queries
                   ▼                           ▼
            ┌──────────────┐          ┌───────────────────┐
            │ SSE Stream   │          │   PostgreSQL 18   │
            │  Subscribers │          │ (ACID & Row Locks)│
            └──────────────┘          └───────────────────┘
```

---

## 2. Directory Structure & Responsibilities

```
hack4hack-raceproof-teams/
├── client/                     # Vite + React 18 Frontend
│   ├── src/
│   │   ├── components/         # Reusable UI widgets (Navbar, Modal, Badge, Button, Input)
│   │   ├── context/            # Global AuthContext and ToastContext
│   │   ├── hooks/              # Custom hooks (useAuth, useTeams, useSSE)
│   │   ├── layouts/            # DashboardLayout, AuthLayout, RootLayout
│   │   ├── pages/              # 10 comprehensive dashboard and management views
│   │   ├── services/           # Axios API services (auth, teams, requests, invites)
│   │   ├── utils/              # Formatters, date helpers, status colors
│   │   ├── App.jsx             # Route definitions & guards
│   │   └── main.jsx            # Entry point
│   ├── package.json
│   └── vite.config.js
│
├── server/                     # Express.js REST API Backend
│   ├── prisma/
│   │   ├── schema.prisma       # Normalized schema with constraints & indexes
│   │   ├── migrations/         # PostgreSQL migrations
│   │   └── seed.js             # Realistic demo seed data
│   ├── src/
│   │   ├── config/             # Environment, Prisma client, constants
│   │   ├── controllers/        # Request parsing and HTTP response mapping
│   │   ├── events/             # In-memory EventEmitter & SSE connection manager
│   │   ├── middleware/         # Auth verification, error handling, request logger
│   │   ├── routes/             # REST routing declarations
│   │   ├── services/           # Core business logic & transactional locking
│   │   ├── utils/              # Password hashing, token generation, crypto
│   │   ├── validators/         # Zod schemas for input validation
│   │   ├── app.js              # Express app assembly & middleware wiring
│   │   └── server.js           # Server listen & graceful shutdown
│   ├── tests/                  # Integration and concurrency test suite
│   └── package.json
│
├── docs/                       # Architectural & design documentation
│   ├── architecture.md
│   ├── design-decisions.md
│   └── load-test-report.md
│
├── load-tests/                 # Performance & concurrency stress scripts
│   └── team-concurrency.js
│
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## 3. Real-Time Event Architecture (SSE)

Real-time capability is achieved through Server-Sent Events (SSE). Unlike WebSockets, SSE operates over standard HTTP, supports automated browser reconnection, and is lightweight for unidirectional dashboard updates.

### Broadcast Topics:
- `TEAM_UPDATED`: Triggered when team capacity, status, or details change.
- `MEMBER_JOINED`: Triggered when a new member is accepted or joins via invite.
- `MEMBER_LEFT`: Triggered when a member leaves or is removed.
- `REQUEST_CREATED`: Triggered when a join request is submitted.
- `REQUEST_RESOLVED`: Triggered when a join request is accepted or declined.

### Single-Instance Limitation:
The current implementation utilizes Node.js native `EventEmitter` in memory. This is ideal and zero-dependency for single-instance deployments. For horizontal scaling across multiple container replicas, the `EventEmitter` should be substituted with a Redis Pub/Sub backplane.

