# PROJECT_OVERVIEW.md

Single source of truth for **Multi-Tenant Team Workspace & Project Management Platform**. Read this file to understand the project's architecture, conventions, and current state before making changes.

---

## 1. Project Overview

**Purpose:** A multi-tenant project management platform (Jira/Trello/Asana-style) — workspaces contain projects, projects contain tasks, tasks carry comments and an activity feed. Engineered as a reference-quality backend/full-stack build: clear layering, explicit conventions, and production-shaped practices throughout.

**Current status:** Backend authentication is complete and verified. Domain schema is fully designed and migrated. Workspace, Project, Task, Comment, and ActivityLog modules exist in the database schema only — no application code yet. Frontend tooling is Next.js (App Router); frontend implementation has not started.

**Implementation progress:**

| Area | Status |
|---|---|
| Domain model / DB schema | Complete — all 9 tables migrated |
| Backend infrastructure (config, error handling, response envelope, Prisma client) | Complete |
| Backend — Auth module (register/login/refresh/logout/me) | Complete |
| Backend — Workspace module | Not started — next milestone |
| Backend — Project, Task, Comment, ActivityLog modules | Schema only |
| Frontend | Not started |
| Testing / CI / Deployment | Not started |

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Backend runtime | Node.js, TypeScript, Express 5 |
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS |
| Database | PostgreSQL 16+ (`pgcrypto` extension enabled) |
| ORM | Prisma (`prisma-client-js` generator, custom client output at `src/generated/prisma`) |
| Authentication | JWT access + refresh tokens (`jsonwebtoken`), bcrypt password hashing |
| Validation | Zod (request bodies and environment variables) |
| Dev tools | `tsx` (dev server/watch), `dotenv` |
| Deployment | Vercel (frontend), Railway/Render (backend + Postgres) |

---

## 3. Architecture

**Style:** Modular layered monolith. Feature-based (vertical-slice) module folders, each internally layered.

**Request flow (backend):**
```
Browser
  ↓
Next.js Component
  ↓
API Client / fetch layer
  ↓
Express Route
  ↓
Middleware: Validation → Authentication → Authorization
  ↓
Controller (HTTP only)
  ↓
Service (business rules, owns transaction boundaries)
  ↓
Repository (persistence only)
  ↓
Prisma Client
  ↓
PostgreSQL
```

**Dependency direction:** strictly downward. Controllers depend on services; services depend on repositories; repositories depend on Prisma. No layer calls upward, and no layer skips a level — a controller never calls a repository or Prisma directly.

**Layer responsibilities:**

| Layer | Owns | Must never contain |
|---|---|---|
| Route | URL/method → middleware chain → controller method | Business logic |
| Middleware | Cross-cutting checks (validate shape, authenticate identity, authorize action) | Feature-specific rules |
| Controller | Read `req`, call one service method, shape HTTP response | Business logic, Prisma calls |
| Service | Business rules, use-case-named methods (e.g. `assignTask()`, not generic `update()`), owns transaction boundaries | Direct Prisma calls, `req`/`res` access |
| Repository | One Prisma model per repository, intention-named methods | Business logic, thrown `AppError`s, opening transactions |

---

## 4. Folder Structure

```
src/
├── app.ts                Express app: global middleware + router mounting
├── server.ts              Process entry point
├── config/env.ts           Zod-validated environment variables (fail-fast at boot)
├── modules/<feature>/       One folder per feature; routes/controller/service/repository/types/validation
│   └── auth/                 (only implemented module)
├── middleware/              validate.ts, auth.ts, error-handler.ts, not-found.ts
├── errors/                  AppError + 5 typed subclasses
├── lib/prisma.ts            Prisma Client singleton (globalThis-cached in development)
├── utils/                   jwt.ts, password.ts, api-response.ts
├── generated/prisma/         Auto-generated Prisma Client — never hand-edited
├── routes/index.ts           Unused stub, not wired into app.ts — pending removal or adoption
└── types/express.d.ts        Augments Express Request with `user: AuthUser`
```

---

## 5. Database

**Domain model (aggregates and ownership):**
```
User
 ├─< Session                       (device/login sessions)
 ├─< WorkspaceMembership >─ Workspace
 │                              ├─< WorkspaceInvitation
 │                              └─< Project
 │                                    └─< Task
 │                                          ├─< Comment
 │                                          └─< ActivityLog
```

**Tenant boundary:** `Workspace` is the tenant. Shared database, shared schema — no schema-per-tenant, no database-per-tenant. Tenant isolation is enforced at the **service layer** via query scoping and authorization, not by duplicating `workspaceId` on every descendant table. `Task` does not store `workspaceId`; it is derived via `Task → Project → Workspace`. Cross-tenant invariants (e.g. "assignee must be a workspace member") are service-layer responsibilities, not database constraints.

**Cascade rules:**

| Relation type | `onDelete` | Example |
|---|---|---|
| Container (child meaningless without parent) | `Cascade` | Session→User, Membership→Workspace/User, Project→Workspace, Task→Project, Comment/ActivityLog→Task |
| Attribution (who created/authored) | `Restrict` | Workspace.createdBy, Project.creator, Task.creator, Comment.author, ActivityLog.actor |
| Optional soft link | `SetNull` | Task.assignee |

**Soft delete vs. hard delete:**

| Entity | Deletion model |
|---|---|
| User | Deactivate (`isActive`), never hard-deleted |
| Workspace, Project | Archive (`isArchived` + `archivedAt`), no hard-delete endpoint |
| Task, Comment, ActivityLog | Hard delete permitted (no archive concept) |
| Session | Revoke (`revokedAt` timestamp), row retained |

**Transaction philosophy:** Use an explicit `prisma.$transaction` whenever a business operation requires multiple writes that must remain consistent. Services decide when a transaction is needed and own the boundary; repositories accept a transaction client (`tx`) but never open one themselves.

**Database conventions:**
- UUID primary keys (`gen_random_uuid()` via `pgcrypto`), never auto-increment
- Tables: plural snake_case (`workspace_memberships`); FK columns: `<entity>_id`
- Named constraints/indexes (`fk_...`, `uq_...`, `idx_...`)
- All timestamps `TIMESTAMPTZ`; `updatedAt` is application-managed via Prisma's `@updatedAt`, not a database trigger
- Booleans named `is_active`/`is_archived` (not bare `active`)
- Status/role/priority fields use native Prisma enums (generates Postgres `CREATE TYPE ... ENUM`)
- Emails normalized to lowercase in the application layer; `UNIQUE(email)` at the database level
- Migrations are forward-only, one logical schema change per migration, committed alongside the `schema.prisma` change that produced them

---

## 6. Authentication

**Flow:**
```
REGISTER → hash password (bcrypt, 12 rounds) → create User row
LOGIN     → verify password → issue access token (15m) + refresh token (7d)
             → hash refresh token (SHA-256) → persist as Session row
REFRESH   → verify refresh JWT → hash it → look up non-revoked, non-expired Session
             → issue new access token
LOGOUT    → verify refresh JWT → hash it → find Session → set revokedAt (soft revoke)
GET /me   → Authenticate middleware: verify access JWT → load user (select, excludes
             passwordHash) → attach req.user
```

**JWT design:** access token 15 min, refresh token 7 days; payload `{ sub: userId }`; separate signing secrets for access vs. refresh (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, both Zod-validated to ≥32 characters at boot) so a leak of one does not compromise the other.

**Session table:** a first-class aggregate (not a bare token string), supporting multi-device sessions, per-device logout, and future "logout all devices." Stores `refreshTokenHash` (never the raw token), `deviceInfo`/`ipAddress`/`userAgent`, `expiresAt`, `revokedAt`.

**Password hashing:** bcrypt, 12 salt rounds. Refresh tokens: SHA-256 — acceptable because refresh tokens are already high-entropy random strings, unlike human passwords.

**Token rotation:** not implemented. `/refresh` issues a new access token only; the refresh token remains valid until its own expiry or explicit revocation.

**Session revocation on password change:** required behavior, not yet implemented.

**Cookies:** `cookie-parser` is installed but unused. Tokens currently travel in the JSON request/response body, not httpOnly cookies.

---

## 7. Engineering Conventions

Full detail lives in [`docs/engineering-playbook.md`](docs/engineering-playbook.md) — summary here:

| Concern | Convention |
|---|---|
| Repositories | One per Prisma model; intention-named methods; no business logic; accept but never open transactions |
| Services | Own business rules and transaction boundaries; use-case-named methods; only layer allowed to call multiple repositories |
| Controllers | Thin HTTP translation; one service call per request |
| Validation | Zod schemas per endpoint in `<feature>.validation.ts`; applied via `validate(schema)` middleware factory; runs before authentication |
| Error handling | Typed `AppError` subclasses (`ValidationError` 400, `UnauthorizedError` 401, `ForbiddenError` 403, `NotFoundError` 404, `ConflictError` 409); single global `error-handler.ts` middleware; unknown errors return a generic 500 and are logged server-side, never leaked to the client |
| API responses | `sendSuccess`/`sendError` only; envelope `{ success, data, message? }` / `{ success: false, message }` |
| Logging | `console.*`, used sparingly, only for unexpected conditions; never log raw passwords/tokens; no debug `console.log`s in committed code |
| Transactions | `prisma.$transaction`, opened in the service, executed in the repository via a passed `tx` |
| Naming | `<feature>.<layer>.ts` files; PascalCase classes; camelCase singleton exports; `xSchema`/`XInput` pairs for Zod; verb+noun repository methods |
| Prisma | Singleton client from `lib/prisma.ts` only; `select` to exclude sensitive fields at the query boundary; schema change → migrate → commit migration with schema |

---

## 8. Business Rules

**Tenant boundary:** Workspace. All authorization and scoping is relative to a user's `WorkspaceMembership`.

**Authorization model:** three roles — `OWNER`, `ADMIN`, `MEMBER`. Finer-grained roles are out of scope unless a concrete requirement emerges; any future need is handled via a permission-set model layered on top of these three, not by adding more roles.

**Workspace rules:**
- Creating a workspace transactionally creates its first `WorkspaceMembership` as `OWNER`.
- Deletion is archive-only (`isArchived`/`archivedAt`); no hard-delete endpoint.

**Project rules:**
- All workspace members can view all projects by default. Project-level restricted visibility is a future extension, not current behavior.
- Create/edit/archive/delete are role-gated, not available to plain membership.
- Archive-only deletion, same as Workspace.

**Task rules:**
- Exactly zero or one assignee, for accountability.
- Assignee must be a member of the task's workspace (service-layer check, not a database constraint).
- Hard delete permitted.

**Comment rules:**
- Attached only to `Task` via `taskId` — not polymorphic across other entities.

**Activity log rules:**
- A user-visible product feature (activity feed), not an audit log or event bus. Inclusion test: would a teammate reasonably expect to see this?
- Scoped to `Task`, not `Workspace`.
- Application-immutable — insert/select only at the application level.
- `metadata` (JSONB) holds event-specific display details only, never IDs or relationships — those are real foreign keys.

**Invitation vs. Membership:** two separate aggregates. Invitation tracks who may join (`PENDING`/`ACCEPTED`/`DECLINED`/`EXPIRED`/`REVOKED`, unique per `(workspaceId, invitedEmail)`); Membership tracks who has joined.

---

## 9. Completed Features

- User registration (`POST /api/v1/auth/register`)
- Login with access + refresh token issuance (`POST /api/v1/auth/login`)
- Access token refresh with session validation (`POST /api/v1/auth/refresh`)
- Logout via session revocation (`POST /api/v1/auth/logout`)
- Current-user retrieval via JWT-guarded route (`GET /api/v1/auth/me`)
- Backend infrastructure: environment validation, Prisma singleton, typed error hierarchy, global error/404 handlers, standard response envelope
- Complete Prisma schema and first migration for all 9 domain tables

---

## 10. Pending Features

- Workspace module: create, list, get, update, archive, invite member, accept/decline invitation, list/remove members
- Project module: CRUD, archive, listing scoped to workspace
- Task module: CRUD, assignment, status/priority workflow, filtering, search, pagination
- Comment module: create/list on a task
- Activity log: automatic event recording tied to task actions
- Authorization checks for role-gated actions (Owner/Admin/Member)
- Frontend: entire application (Next.js)
- Session revocation on password change
- Production readiness: structured logging, rate limiting, Helmet, CORS hardening, compression, testing, CI/CD, Docker, deployment

---

## 11. Current Milestone

**Completed:** Backend authentication module — register, login, refresh, logout, current-user retrieval.

**In progress:** Frontend project setup (Next.js, App Router), the first step toward a full authentication UI.

**Next:** Backend Workspace module, built alongside its corresponding frontend UI. Backend and frontend features are built in parallel, one vertical slice at a time, rather than completing the entire backend before starting the frontend.

---

## 12. Frontend Plan

**Why frontend and backend proceed together:** Each feature is built as a complete vertical slice — backend endpoints, then the frontend UI that consumes them, verified end-to-end before moving to the next feature. Authentication is the first such slice.

**How it connects to the backend:** The Next.js app calls the Express API (`/api/v1/...`) over HTTP as a standard client; Next.js does not proxy through server-side logic of its own for this project. Auth state (access token, current user) lives in frontend state/context and is attached to requests via `Authorization: Bearer <token>`.

**Implementation order:** project setup → folder structure → routing → layout → API client → auth context → register page → login page → protected routes → current user → logout → error handling → loading states → route guards → auth persistence → dashboard placeholder → Workspace UI.

---

## 13. Learning Goals

This project is built to develop, in priority order:
1. **Architecture decision-making** — understanding why a layer, pattern, or convention exists, not just how to use it
2. **Backend engineering depth** — layered design, transaction boundaries, error handling strategy, database modeling for multi-tenancy
3. **Production practices** — validation pipelines, typed error hierarchies, consistent API contracts, auth design (access/refresh tokens, session revocation)
4. **Full-stack integration** — how a real frontend consumes a real backend, request lifecycle end-to-end
5. **Interview readiness** — the ability to explain every architectural decision and its trade-offs confidently and unaided

Depth of understanding is the success metric, not feature-count or delivery speed.

---

## 14. Non-Negotiable Rules

- **Architecture stability:** a finalized decision is revisited only for one of: a new business requirement, a proven implementation limitation, a correctness issue, or a security issue — never for "a cleaner pattern" or "seen elsewhere" alone.
- Services own transaction boundaries; repositories never open a transaction, only accept one.
- Only repositories call Prisma. Only services throw `AppError`s for business failures. Only controllers call `sendSuccess`/`sendError`.
- `Task` (and all descendants) never stores `workspaceId` directly — tenant scoping is always derived through the aggregate chain and enforced in the service layer.
- Business/contextual invariants (membership, permissions, status-transition rules) are never modeled as database constraints — only row-local invariants (foreign key, NOT NULL, UNIQUE, CHECK) belong in the database.
- Task assignment: zero or one assignee, never more.
- The activity log stays scoped to Task and remains a product feature, not an audit trail.
- Comments remain non-polymorphic (Task-only) unless a concrete second use case emerges.
- Workspace/Project deletion stays archive-only; no hard-delete endpoints without an explicit new requirement.
- All timestamps `TIMESTAMPTZ`; `updatedAt` stays application-managed via Prisma, never a database trigger.

---

## 15. Resume Work Here

**Current implementation status:** Backend authentication is complete. Frontend tooling is decided (Next.js, App Router); initial project scaffolding is the active task.

**Current milestone:** Frontend project setup, followed by the authentication UI (register, login, protected routes, current user, logout, persistence) as the frontend counterpart to the completed backend auth module.

**Immediate next task:** Scaffold the Next.js project, confirm the development server runs, then build the authentication screens against the existing `/api/v1/auth/*` endpoints.

**Next five milestones:**
1. Frontend authentication UI complete, integrated against backend auth endpoints
2. Backend Workspace module (CRUD, invitations, membership) — first use of `prisma.$transaction` for workspace + owner-membership creation
3. Frontend Workspace UI (create/switch workspace, invite flow)
4. Backend Project module + frontend Project UI
5. Backend Task module (including filters/search/pagination) + frontend Task UI

**Known technical debt:**
- `src/routes/index.ts` — dead stub router, never mounted; remove or adopt
- `cookie-parser` installed but unused — tokens travel in the JSON body, not httpOnly cookies
- No token rotation on refresh
- Session revocation on password change is required but unimplemented
- No tests, no CI, no deployment pipeline

**Intentionally deferred (not oversights):**
- Project-level restricted visibility (currently: all workspace members see all projects)
- Permission sets finer-grained than Owner/Admin/Member
- Workspace-scoped (vs. task-scoped) activity feed
- Hard-delete endpoints for Workspace/Project
- Team management as a standalone feature
