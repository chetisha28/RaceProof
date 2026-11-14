# RaceProof: Concurrency Engineering & Design Decisions

## 1. Executive Summary

RaceProof is a concurrency-resilient hackathon team formation platform built to guarantee absolute data integrity under high-concurrency contention. In competitive team formation, when a team has 1 remaining slot and 50 users attempt to join simultaneously, a naive system suffers from Time-of-Check to Time-of-Use (TOCTOU) race conditions, resulting in oversubscribed teams, duplicate memberships, and inconsistent state.

This document details the failure modes of naive systems, the mathematical and transactional mechanics of row-level locking (`SELECT ... FOR UPDATE`), defense-in-depth constraints, and architectural trade-offs.

---

## 2. The Critical Concurrency Problem

### Scenario
- **Team Maximum Size:** 4 members.
- **Current Membership:** 3 members (Leader + 2 members).
- **Available Capacity:** 1 seat remaining.
- **Contention:** 50 users submit or have their join requests accepted simultaneously within a window of milliseconds.

### The Naive Application-Level Antipattern
A standard web application pattern commonly implements membership logic as follows:

```typescript
// DANGEROUS / NAIVE ANTIPATTERN (DO NOT USE)
async function naiveAcceptRequest(teamId, requestId) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { members: true }
  });

  if (team.members.length >= team.maxSize) {
    throw new Error("Team is already full");
  }

  // Latency window: network delay, database I/O, event loop ticks
  await prisma.teamMember.create({
    data: { teamId, userId: request.userId, hackathonId: team.hackathonId }
  });
}
```

### Why Naive Checks Fail (TOCTOU Race Condition)
Under concurrent traffic:
1. Requests $R_1, R_2, \dots, R_{50}$ execute the `SELECT` query at nearly the identical timestamp $t_0$.
2. All 50 transactions read `team.members.length = 3` from the database snapshot.
3. Every transaction tests `3 < 4`, which evaluates to `true`.
4. All 50 transactions issue `INSERT INTO "TeamMember"`.
5. Result: The team ends up with up to 53 members instead of 4, violating business invariants and corrupting the state.

---

## 3. The Solution: Pessimistic Row Locking (`SELECT ... FOR UPDATE`)

To guarantee strict serializability and atomicity, RaceProof uses PostgreSQL transaction row locking.

### Transactional Mechanics
When an operation attempts to mutate team membership (accepting a join request, accepting an invite, joining a team), it executes inside an explicit PostgreSQL transaction:

```sql
BEGIN;

-- Step 1: Acquire exclusive row lock on the parent Team record
SELECT id, "maxSize", "hackathonId", status 
FROM "Team" 
WHERE id = $1 
FOR UPDATE;

-- Step 2: In the same transaction, count existing members
SELECT COUNT(*)::int AS count 
FROM "TeamMember" 
WHERE "teamId" = $1;

-- Step 3: Evaluate invariant strictly against locked row
-- IF count >= maxSize -> ROLLBACK and RETURN 409 Conflict

-- Step 4: Verify user is not already in another team in this hackathon
SELECT id FROM "TeamMember" 
WHERE "hackathonId" = $2 AND "userId" = $3;

-- Step 5: Perform inserts and updates atomically
INSERT INTO "TeamMember" ("id", "teamId", "hackathonId", "userId", "role", "joinedAt")
VALUES (gen_random_uuid(), $1, $2, $3, 'MEMBER', NOW());

UPDATE "JoinRequest" 
SET status = 'ACCEPTED', "updatedAt" = NOW() 
WHERE id = $4;

-- If capacity is reached, update status to FULL
-- Insert AuditLog record

COMMIT;
```

### Why `SELECT ... FOR UPDATE` Works
1. **Serialization of Critical Section:** The first transaction $T_1$ acquires an exclusive row lock (`RowExclusiveLock` / `X` lock) on the `Team` tuple with `id = $1`.
2. **Blocking Competitors:** Transactions $T_2$ through $T_{50}$ attempting to execute `SELECT ... FOR UPDATE` on that same `Team` row are placed into a wait state by the PostgreSQL lock manager until $T_1$ commits or rolls back.
3. **Fresh Snapshot on Resume:** When $T_1$ commits, $T_2$ wakes up. Because PostgreSQL re-evaluates the row after the lock is released, $T_2$ reads the newly committed state: `count` is now 4.
4. **Immediate Rejection:** $T_2$ sees `count (4) >= maxSize (4)`, aborts the mutation, and returns an HTTP `409 Conflict` with code `TEAM_FULL`.
5. **Deterministic Outcome:** Exactly 1 user is accepted; the remaining 49 are safely rejected.

---

## 4. Multi-Layered Defense-in-Depth

Application logic and row locks can theoretically fail if developer bypasses occur. Therefore, RaceProof enforces multi-layered constraints:

| Layer | Mechanism | Role |
| :--- | :--- | :--- |
| **Layer 1: Frontend UX** | Reactive state & SSE | Prevents unnecessary UI clicks by disabling buttons when seats reach 0 |
| **Layer 2: API Validation** | Zod schemas | Validates input formats, UUID types, string sanitization |
| **Layer 3: Row Locking** | `SELECT ... FOR UPDATE` | Prevents oversubscription and serializes capacity verification |
| **Layer 4: Database Unique Index** | `UNIQUE ("hackathonId", "userId")` | Hard constraint preventing any user from belonging to >1 team per hackathon |
| **Layer 5: Database Foreign Keys** | `ON DELETE CASCADE / RESTRICT` | Prevents orphan records, dangling references, or ghost memberships |

### The Essential Unique Constraint: `(hackathonId, userId)`
Even if two concurrent requests target different teams for the same user in the same hackathon, the unique constraint `@@unique([hackathonId, userId])` guarantees that PostgreSQL rejects the second commit with error code `23505 (unique_violation)`. The application catches this error and returns HTTP `409 Conflict` with `ALREADY_IN_TEAM`.

---

## 5. Failure and Error Handling Strategy

When concurrent operations conflict, the system guarantees:
- **Clean Rollback:** Every failed transaction executes `ROLLBACK`, leaving no dirty reads, partial inserts, or unlinked records.
- **Explicit HTTP Semantics:**
  - `409 Conflict`: Team is full (`TEAM_FULL`) or user is already in a team (`ALREADY_IN_TEAM`).
  - `404 Not Found`: Team or Request does not exist.
  - `403 Forbidden`: Authenticated user is not the leader.
  - `400 Bad Request`: Validation failure or invalid transition.
- **Zero In-Memory Drift:** Member counts are never cached in uncoordinated in-memory variables. Capacity is dynamically derived or locked transactionally.

---

## 6. Trade-Off Analysis

| Strategy | Advantages | Disadvantages | Decision |
| :--- | :--- | :--- | :--- |
| **Optimistic Locking (`version` column)** | High read throughput, non-blocking | Under 50-user contention, 49 transactions fail on commit and must retry, wasting DB cycles | Rejected for high-contention join operations |
| **Redis Distributed Lock (Redlock)** | Offloads DB locking | Introduces external dependency, failure modes on lock expiry, split-brain risk | Rejected: Adds unnecessary complexity for single DB |
| **Message Queue / Job Worker** | Decouples requests | High latency, requires polling or asynchronous push, complex error forwarding | Rejected for synchronous REST endpoints |
| **PostgreSQL `SELECT ... FOR UPDATE`** | Native ACID guarantee, zero external deps, sub-millisecond lock duration | Locks the team row for duration of tx (~2-5ms) | **Selected:** Industry standard for financial & ticket booking systems |

