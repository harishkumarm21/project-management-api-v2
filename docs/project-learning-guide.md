# Project Learning Guide — Engineering Handbook

**Purpose of this document:** if you step away from this project for six months, read only this file to rebuild your full mental model before writing another line of code. This is not a tutorial — it's a reference for *this specific codebase*.

**Current real state (be honest with future-you):** only the `auth` module is built (register, login, refresh, logout, get-current-user). The schema already defines `Workspace`, `Project`, `Task`, `Comment`, `ActivityLog` — none have code yet. Cookie-parser is installed as a dependency but **not currently used anywhere** — refresh tokens today travel in the JSON request body, not a cookie. `src/routes/index.ts` is a dead stub. Note these so you don't hunt for functionality that doesn't exist yet.

---

## 1. Project Overview

**What it does:** A project-management API (think mini-Jira/Trello backend) — workspaces contain projects, projects contain tasks, tasks have comments and an activity log. Users belong to workspaces with a role (`OWNER`/`ADMIN`/`MEMBER`).

**Why it exists:** Learning/building project to practice a production-shaped Node backend: layered architecture, Prisma/PostgreSQL, JWT auth with refresh-token sessions, centralized error handling.

**Main features (target, per schema):**
| Domain | Status |
|---|---|
| Auth (register/login/refresh/logout/me) | ✅ Built |
| Workspaces + membership + invitations | ❌ Schema only |
| Projects | ❌ Schema only |
| Tasks | ❌ Schema only |
| Comments | ❌ Schema only |
| Activity log | ❌ Schema only |

**Users:** Any registered user; role-scoped per-workspace (`OWNER`, `ADMIN`, `MEMBER`) via `WorkspaceMembership`.

**High-level architecture:**
```
Browser / Client
      ↓
   Express  (src/app.ts — global middleware, mounts routers)
      ↓
   Routes   (*.routes.ts — URL + method → handler chain)
      ↓
 Middleware (validate → authenticate, per route)
      ↓
 Controllers (*.controller.ts — HTTP in/out only)
      ↓
  Services  (*.service.ts — business rules)
      ↓
Repositories (*.repository.ts — ONLY layer touching Prisma)
      ↓
Prisma Client (generated in src/generated/prisma)
      ↓
  PostgreSQL
```

**What should I remember?**
- Only `auth` is implemented; everything else is schema-first, code-pending.
- Refresh tokens today = request body, not cookies (despite `cookie-parser` being installed).
- One-way data flow: every layer only calls the layer directly below it.
- Build order for what's missing: Workspace → Project → Task → Comment/ActivityLog (each depends on the previous existing).

---

## 2. Folder Structure

```
src/
├── app.ts            Express app: global middleware + router mounting (composition root)
├── server.ts          Process entry point: starts the HTTP listener on env.PORT
├── config/            Loads & validates environment variables (fail-fast at boot)
├── modules/            Feature code, one folder per feature, self-contained
│   └── auth/            (the only feature built so far)
├── middleware/          Cross-cutting request checkpoints (validate, authenticate, error/404 handling)
├── errors/              Typed error classes carrying HTTP status codes
├── lib/                Shared infrastructure singletons (Prisma client)
├── utils/               Small reusable helpers (JWT, password hashing, response envelope)
├── generated/prisma/    Auto-generated Prisma Client — never hand-edit
├── routes/              Dead stub (index.ts), not wired into app.ts — ignore/remove when cleaning up
└── types/               Ambient TypeScript augmentation (adds req.user to Express's Request)
```

**Folder responsibility, one line each:**

| Folder | Responsibility |
|---|---|
| `config/` | "What are the app's settings, and are they valid?" |
| `modules/<feature>/` | "Everything about one feature, in one place" |
| `middleware/` | "What must be checked before a controller runs?" |
| `errors/` | "What are the known ways a request can fail, and what status code goes with each?" |
| `lib/` | "What shared infrastructure object does the whole app depend on?" |
| `utils/` | "What small stateless helper is reused across features?" |
| `generated/prisma/` | "What does Prisma think my database looks like?" (machine-generated) |
| `types/` | "How do I teach TypeScript about a runtime addition to Express's `Request`?" |

**What should I remember?**
- Feature code lives under `modules/<feature>/`; shared code lives everywhere else.
- `generated/prisma/` regenerates from `prisma/schema.prisma` via `npx prisma generate` — never edit it by hand.
- A new feature = a new folder under `modules/`, copying `auth/`'s internal file set.

---

## 3. Complete Request Lifecycle (traced through `POST /api/v1/auth/login`)

```
HTTP Request: POST /api/v1/auth/login  { email, password }
      ↓
Express (app.ts) — express.json() parses the body
      ↓
Route match — app.use("/api/v1/auth", authRouter) → authRouter.post("/login", ...)
      ↓
Validation — validate(loginSchema) checks/cleans req.body via Zod; throws ValidationError on bad input
      ↓
Authentication — NOT required for /login itself (you're proving identity here, not presenting it)
      ↓
Authorization — none needed (no resource ownership check on login)
      ↓
Controller — AuthController.login(req, res): calls authService.login(req.body)
      ↓
Service — AuthService.login: finds user by email, bcrypt.compare(password, hash),
          generates access token (15m) + refresh token (7d), hashes the refresh token,
          creates a Session row
      ↓
Repository — AuthRepository.findUserByEmail (read), SessionRepository.create (write)
      ↓
Prisma — prisma.user.findUnique(...), prisma.session.create(...)
      ↓
PostgreSQL — SELECT on users, INSERT on sessions
      ↓
Response — controller calls sendSuccess({ statusCode: 200, data: { user, accessToken, refreshToken } })
```

Real files touched, in order: `app.ts` → `auth.routes.ts` → `validate.ts` (+ `auth.validation.ts`) → `auth.controller.ts` → `auth.service.ts` → `auth.repository.ts` + `session.repository.ts` → `lib/prisma.ts` → Postgres.

If anything throws along the way (`UnauthorizedError` for bad credentials, `ValidationError` for bad body shape), Express 5 auto-forwards it to `error-handler.ts`, which never even reaches the controller's `sendSuccess` line.

**What should I remember?**
- Not every route needs every step — `/login` skips authentication/authorization (you don't have a token yet); `/me` requires `Authenticate` but has no extra authorization logic (a user can always see themselves).
- Validation always runs before the controller; authentication (when required) always runs before the controller too — both are middleware, both can short-circuit the request via `throw`/`next(err)`.
- The controller is a thin translator: HTTP body in, one service call, HTTP response out. Nothing else.

---

## 4. Application Layers

| Layer | Purpose | Belongs here | Must NOT be here | Files (this project) |
|---|---|---|---|---|
| **Routes** | Map URL + method to a middleware/handler chain | `router.post(path, ...middleware, controllerMethod)` | Business logic, Prisma calls | `auth.routes.ts` |
| **Middleware** | Cross-cutting checks before the handler | Validation, auth checks, error/404 catch-all | Feature-specific business rules | `middleware/*.ts` |
| **Controllers** | Translate HTTP ⇄ plain function calls | Read `req`, call one service method, call `sendSuccess`/rely on thrown errors | Prisma calls, business rules, direct `res.json()` | `auth.controller.ts` |
| **Services** | Enforce business rules | Password checks, token generation, throwing `AppError`s, orchestrating multiple repository calls | Reading `req`/`res` directly, raw SQL/Prisma calls | `auth.service.ts` |
| **Repositories** | Persistence only | One method = one Prisma call, named for intent | Business rules, validation, HTTP concerns | `auth.repository.ts`, `session.repository.ts` |
| **Prisma** | ORM — translates JS calls into SQL | N/A (generated) | Hand-edits | `generated/prisma/` |
| **Database** | Durable storage, constraints, indexes | N/A | N/A | PostgreSQL, defined via `schema.prisma` |
| **Utils** | Small stateless helpers reused everywhere | JWT sign/verify, bcrypt hash/compare, response envelope | Business rules, state | `utils/*.ts` |
| **Config** | App settings, validated at boot | Env var schema | Feature logic | `config/env.ts` |

**Example flow through the layers** — see Section 3 above; it's the canonical example.

**What should I remember?**
- If you're tempted to call `prisma.*` outside a repository file, stop — that's the one hard rule in this codebase.
- If you're tempted to `throw new Error(...)` (plain) instead of an `AppError` subclass, stop — it'll get flattened to a generic 500 and lose your intended status code.
- Controllers should be boring. If a controller has an `if` statement implementing a business rule, that logic belongs in the service instead.

---

## 5. Database

**Why PostgreSQL?** Relational, strongly-constrained data (users → workspaces → projects → tasks → comments) with real foreign keys, uniqueness constraints, and transactional guarantees — a good fit for this domain versus a document store.

**Why Prisma?** Type-safe query building (autocomplete + compile-time checks against your actual schema), a migration system, and it removes hand-written SQL string-building (a SQL-injection risk) from the repository layer.

**How Prisma works internally:**
```
TypeScript call
  prisma.user.findUnique({ where: { email } })
        ↓
Prisma Client (generated code in src/generated/prisma)
  validates the call shape against your schema at compile time
        ↓
Query Engine (Prisma's Rust binary, runs alongside your Node process)
  translates the call into an actual SQL query
        ↓
   SELECT * FROM users WHERE email = $1
        ↓
     PostgreSQL
        ↓
   Raw rows back → Query Engine maps columns to your TS types → returned to your code
```

**Migrations, simply:** `schema.prisma` is the source of truth for what your tables *should* look like. Running `npx prisma migrate dev` compares that to the database's actual current shape, generates a SQL file describing the difference (a "migration"), and applies it. This project has one migration so far: `prisma/migrations/20260709022321_init/`. Every future schema change (adding the `Workspace` table's first index, say) gets its own timestamped migration folder — migrations are a *history*, never edited after being applied.

**`schema.prisma`:** Three sections — `generator client` (tells Prisma to output a JS/TS client, and *where*: this project customizes the output to `src/generated/prisma` instead of the `node_modules` default), `datasource db` (says "postgresql," reads the connection string from `DATABASE_URL`), and the `model`/`enum` blocks (Section 6 below).

**Generated Prisma Client (`src/generated/prisma/`):** Fully auto-generated from `schema.prisma` by `npx prisma generate` (also runs automatically after `prisma migrate dev`). Contains typed methods like `prisma.user.findUnique(...)`, `prisma.session.create(...)` — one property per model, named by lowercasing the model name. Never edit these files; if the schema is wrong, fix `schema.prisma` and regenerate.

**What should I remember?**
- Change data shape → edit `schema.prisma` → `npx prisma migrate dev` (creates + applies a migration + regenerates the client). Never hand-edit `generated/prisma/`.
- The custom generator output path (`src/generated/prisma` instead of `node_modules/.prisma/client`) means imports look like `from "@prisma/client"` still (check `auth.repository.ts` — it imports `Prisma` from `"@prisma/client"`) — Prisma re-exports from the custom path under the hood.
- Migrations are an append-only history — don't edit an already-applied migration folder; create a new one.

---

## 6. Database Schema

```
User
 │
 ├─< Session                (1 user → many sessions/devices)
 ├─< WorkspaceMembership >─ Workspace
 │                             │
 │                             ├─< WorkspaceInvitation
 │                             └─< Project
 │                                   │
 │                                   └─< Task
 │                                         ├─< Comment
 │                                         └─< ActivityLog
 └─ (also: creator/assignee/author/actor on Workspace, Project, Task, Comment, ActivityLog)
```

| Table | Purpose | Key relationships | Cascade behavior | Notable constraints/indexes |
|---|---|---|---|---|
| **users** | Account record | 1→many everything else | — | `email` unique, UUID PK |
| **sessions** | One row per refresh token / login session | belongs to `User` | `onDelete: Cascade` (delete user → delete their sessions) | index on `(userId, revokedAt)` for fast "active sessions" lookups |
| **workspaces** | Top-level container/tenant | belongs to creator `User`; has memberships, invitations, projects | creator FK is `Restrict` (can't delete a user who still owns a workspace) | `slug` unique, index on `createdById` |
| **workspace_memberships** | Join table: who's in which workspace, with what role | belongs to `Workspace` + `User` | both FKs `Cascade` (delete workspace or user → membership row goes too) | unique `(workspaceId, userId)` — one membership per user per workspace |
| **workspace_invitations** | Pending invite to join a workspace | belongs to `Workspace` + inviting `User` | workspace FK `Cascade`; creator FK `Restrict` | `token` unique, unique `(workspaceId, invitedEmail)` — can't double-invite the same email |
| **projects** | A project inside a workspace | belongs to `Workspace` + creator `User`; has tasks | workspace FK `Cascade`; creator FK `Restrict` | indexes on `workspaceId`, `createdById`, `status`, and the combo `(workspaceId, status)` |
| **tasks** | A task inside a project | belongs to `Project` + creator `User`; optional `assignee User` | project FK `Cascade`; creator `Restrict`; assignee `SetNull` (unassign, don't block deletion) | indexes on `projectId`, `assigneeId`, `status`, `priority` |
| **comments** | Comment on a task | belongs to `Task` + author `User` | task FK `Cascade`; author `Restrict` | indexes on `taskId`, `authorId` |
| **activity_logs** | Audit trail of task events | belongs to `Task` + actor `User` | task FK `Cascade`; actor `Restrict` | `metadata` is JSON; indexes on `taskId`, `actorId`, `eventType` |

**Pattern worth noticing:** every "child of a container" relation (session→user, membership→workspace, project→workspace, task→project, comment→task, log→task) cascades on delete. Every "who did this" relation (creator, author, actor, inviter) is `Restrict` — you can't delete a user who has created things, preventing orphaned "created by (unknown)" data — **except** task assignee, which is `SetNull`, because unassigning someone from a task when they leave is fine; blocking their account deletion because of it wouldn't be.

**What should I remember?**
- Cascade = "container relation" (delete the parent, children go too). Restrict = "attribution relation" (can't delete a user who authored/created things). SetNull = "soft link" (assignee only).
- All PKs are UUIDs (`@default(uuid())`), not auto-increment integers — harder to guess/enumerate, safe to generate client-side if ever needed.
- `updatedAt` uses Prisma's `@updatedAt` — Prisma sets it automatically on every update, you never set it manually in repository code.
- `@map`/`@@map` mean TS field names are camelCase (`passwordHash`) but actual Postgres columns are snake_case (`password_hash`) — a naming-convention bridge, not a functional difference.

---

## 7. Authentication Flow

```
REGISTER                         LOGIN                              REFRESH                        LOGOUT
--------                         -----                              -------                         ------
POST /register                   POST /login                        POST /refresh                  POST /logout
  │                                 │                                   │                                │
  ▼                                 ▼                                   ▼                                ▼
validate body                   validate body                      validate body                   validate body
  │                                 │                                   │                                │
  ▼                                 ▼                                   ▼                                ▼
check email unique               find user by email                verify refresh JWT              verify refresh JWT
  │                                 │                                   │                                │
  ▼                                 ▼                                   ▼                                ▼
bcrypt.hash(password)            bcrypt.compare(password, hash)    hash the token (SHA-256)        hash the token (SHA-256)
  │                                 │                                   │                                │
  ▼                                 ▼                                   ▼                                ▼
create User row                 generate access token (15m)        look up Session by hash          look up Session by hash
  │                                 generate refresh token (7d)     (must exist, not revoked,        (must exist)
  │                                 hash refresh token (SHA-256)     not expired)                       │
  │                                 create Session row                  │                                ▼
  │                                    │                                ▼                          revoke Session (set revokedAt)
  │                                    ▼                            generate NEW access token             │
  ▼                              return {user, accessToken,             │                                ▼
return {id, email,               refreshToken}                     return {accessToken}             return 200 OK
 displayName, createdAt}
```

**GET /me:** `Authenticate` middleware reads `Authorization: Bearer <accessToken>`, verifies it, loads the user, attaches `req.user`. Controller just echoes `req.user` back.

**Key concepts, simply:**
- **JWT (JSON Web Token):** a signed, tamper-evident string proving "this is user X, issued at time T, expires at time T+n" — verifiable without a database call, just cryptography.
- **Refresh token:** a *second*, longer-lived JWT whose only job is to mint new access tokens later, without forcing the user to log in again every 15 minutes.
- **Session table:** the database record of a refresh token's existence, so it can be looked up and **revoked** (logout) — something a stateless JWT alone can't do (you can't "delete" a JWT once issued; you can only refuse to honor it, which requires a database check).
- **Cookies:** installed (`cookie-parser`) but **not currently wired into the auth flow** — today, `accessToken`/`refreshToken` are returned in the JSON response body and the client is responsible for storing/sending them (e.g. `refreshToken` in the request body for `/refresh` and `/logout`). Worth revisiting later — an httpOnly cookie for the refresh token is the more common production pattern, but that's a future change, not current behavior.
- **Why both a JWT and a Session row?** The access token is stateless-fast (no DB hit per request... except this project's `Authenticate` middleware *does* still hit the DB — see Section 8's note). The refresh token needs to be revocable (logout, "log out all devices," stolen-token response), and revocation requires a database record — a pure JWT can't be revoked by itself.

**What should I remember?**
- Access token: 15 minutes, signed with `JWT_ACCESS_SECRET`, used per-request.
- Refresh token: 7 days, signed with `JWT_REFRESH_SECRET` (different secret on purpose), used only to mint new access tokens, and its *hash* (not the raw token) is stored in the `sessions` table.
- Logout = revoke the Session row (`revokedAt` set), it does not blacklist the still-valid access token (it just expires naturally within 15 minutes).
- No cookies are actually used yet, despite the dependency being installed.

---

## 8. How Authentication Works In THIS Project (file-level reference)

| Step | File | Function/Method |
|---|---|---|
| Route definitions | `src/modules/auth/auth.routes.ts` | `authRouter.post("/register" \| "/login" \| "/refresh" \| "/logout", ...)`, `authRouter.get("/me", Authenticate, ...)` |
| Request validation | `src/modules/auth/auth.validation.ts` | `registerSchema`, `loginSchema`, `refreshSchema`, `logoutSchema` (Zod) |
| Controller | `src/modules/auth/auth.controller.ts` | `AuthController.register/login/refresh/logout` |
| Service (business rules) | `src/modules/auth/auth.service.ts` | `AuthService.register/login/refresh/logout` |
| User persistence | `src/modules/auth/auth.repository.ts` | `AuthRepository.findUserByEmail/findUserById/createUser` |
| Session persistence | `src/modules/auth/session.repository.ts` | `SessionRepository.create/findByRefreshTokenHash/revoke` |
| Prisma models used | `prisma/schema.prisma` | `User`, `Session` |
| JWT sign/verify | `src/utils/jwt.ts` | `generateAccessToken/generateRefreshToken/verifyAccessToken/verifyRefreshToken` |
| Password hashing | `src/utils/password.ts` | `hashPassword` (bcrypt), `hashRefreshToken` (SHA-256) |
| Route-guard middleware | `src/middleware/auth.ts` | `Authenticate` |
| Type augmentation | `src/types/express.d.ts` | adds `req.user: AuthUser` |

**How cookies are set:** they aren't, currently (see Section 7).

**How tokens are verified:** `Authenticate` middleware splits the `Authorization` header on the space, expects `"Bearer <token>"`, calls `verifyAccessToken(token)` (checks signature + expiry via `JWT_ACCESS_SECRET`), then — important detail — **also queries the database** (`authRepository.findUserById`) to confirm the user still exists and `isActive` is true. This closes a gap pure JWT verification can't: a cryptographically valid token for a since-deactivated account.

**How sessions are stored:** `SessionRepository.create` stores a *hash* of the refresh token (`hashRefreshToken`, SHA-256), never the raw token — so a database leak alone doesn't hand out usable refresh tokens. Lookups (`refresh`, `logout`) re-hash the incoming raw token and match against the stored hash.

**What should I remember?**
- `Authenticate` = signature check + DB active-user check, not signature check alone.
- Refresh/logout both re-verify the JWT *and* look up the hashed token in `sessions` — belt and suspenders (a tampered or expired JWT fails at `verifyRefreshToken`; a revoked-but-not-yet-expired JWT fails at the `findByRefreshTokenHash` step because revoked sessions are excluded from that query).
- `session.repository.ts` and `auth.repository.ts` are separate because they own different tables — keep that split when you add more repositories.

---

## 9. Backend Conventions

| Convention | Why it exists |
|---|---|
| UUID primary keys everywhere | Avoids sequential-ID enumeration attacks, safe for distributed/future multi-service use |
| `@updatedAt` — Prisma manages `updatedAt` automatically | One less thing repositories can forget or get wrong |
| Services own business logic; repositories only persist | Keeps "the rule" and "the storage detail" independently changeable |
| Feature-module folder structure (`modules/<feature>/`) | Everything about one feature lives in one place, not spread across role-based folders |
| Standard API response envelope (`sendSuccess`/`sendError`) | Frontend can always check `response.success` regardless of endpoint |
| Typed error classes (`AppError` subclasses) instead of plain `Error` | One global handler can safely decide what's safe to show the client vs. what to hide |
| Validation via Zod middleware factory (`validate(schema)`) | Reusable across every route with a different body shape, without repeating parsing logic in controllers |
| Passwords hashed with bcrypt; refresh tokens hashed with SHA-256 | Different threat models — brute-force resistance (slow hash) for low-entropy human passwords vs. no need for that (fast hash is fine) on already-random tokens |
| Two JWT secrets (access vs. refresh) | A leak of one secret doesn't compromise the other, longer-lived token type |
| `env.ts` validates all config at boot (fail fast) | Crash immediately with a clear message rather than fail mysteriously mid-request later |
| Prisma client is a `globalThis` singleton | One connection pool, avoids leaks from dev hot-reload |
| No explicit transactions yet | Not needed yet — no current operation writes to two tables where partial failure would be unsafe. **Revisit when building Workspace creation** (a workspace + its first `OWNER` membership should be created atomically — see Section 14/Debugging note) |

**What should I remember?**
- These conventions are the checklist to follow when adding a new feature module — not guidelines to reconsider each time, just repeat them.
- The one you're most likely to need soon: wrap multi-table writes in `prisma.$transaction(...)` once you build Workspace creation (workspace row + membership row must succeed or fail together).

---

## 10. Feature Implementation Blueprint

When adding a new feature (e.g. `Workspace`):

```
1. Prisma schema        (already defined for Workspace — confirm no changes needed)
        ↓
2. Migration             npx prisma migrate dev   (only if schema.prisma changed)
        ↓
3. src/modules/workspace/
     workspace.types.ts        — shared interfaces
     workspace.validation.ts   — Zod schemas (create, update, list, etc.)
        ↓
4.   workspace.repository.ts   — one method per Prisma call (findById, create, listForUser, ...)
        ↓
5.   workspace.service.ts      — business rules (slug uniqueness, membership creation, ownership checks),
                                  throws AppError subclasses
        ↓
6.   workspace.controller.ts   — thin: req → service call → sendSuccess
        ↓
7.   workspace.routes.ts       — router.post/get/patch(path, validate(schema), Authenticate, controller.method)
        ↓
8. Wire into app.ts             app.use("/api/v1/workspaces", workspaceRouter)
```

**What should I remember?**
- Bottom-up when *writing* (repository → service → controller → routes) makes each layer testable against the one below it; top-down when *reading/tracing* a request (routes → ... → repository).
- Always add `Authenticate` to routes that need a logged-in user — it's opt-in per-route, not global.
- Don't forget the `app.ts` wiring step — it's easy to build a whole module and forget to mount its router (this already happened once in this project: `src/routes/index.ts` was built but never mounted).

---

## 11. End-to-End Feature Walkthrough: Authentication

**Files involved, and their one-sentence responsibility:**
1. `auth.routes.ts` — declares the 5 endpoints and their middleware chains
2. `auth.validation.ts` — defines the exact shape/rules for each endpoint's body
3. `auth.controller.ts` — HTTP translation layer, 4 thin methods
4. `auth.service.ts` — all the actual rules: uniqueness, password checking, token issuance, session lifecycle
5. `auth.repository.ts` — 3 methods, all on the `User` table
6. `session.repository.ts` — 3 methods, all on the `Session` table
7. `utils/jwt.ts` — token sign/verify, used by the service
8. `utils/password.ts` — hash/compare/hash-refresh-token, used by the service
9. `middleware/auth.ts` — guards `/me` (and will guard future protected routes across other modules)
10. `types/express.d.ts` — lets `req.user` type-check anywhere after `Authenticate`

**How they communicate (diagram):**
```
auth.routes.ts
   │ imports & wires
   ▼
validate.ts (generic) ──uses──> auth.validation.ts (schemas)
   ▼
auth.controller.ts
   │ calls authService.<method>(req.body)
   ▼
auth.service.ts
   │ calls               │ calls              │ calls
   ▼                     ▼                     ▼
auth.repository.ts   session.repository.ts   utils/jwt.ts, utils/password.ts
   │                     │
   ▼                     ▼
       prisma (lib/prisma.ts) → PostgreSQL (users, sessions tables)
```
`middleware/auth.ts` sits *beside* this chain, invoked only on `/me`, and itself calls `auth.repository.ts` directly (middleware is allowed to call a repository — it's a cross-cutting concern, not tied to one controller).

**What should I remember?**
- This exact shape (routes → validate → controller → service → repository → prisma) is the template — Section 10's blueprint is just this walkthrough generalized.
- Middleware can call repositories directly (as `Authenticate` does); controllers should not.
- Two repositories in one module is fine when a module spans two tables (`User`, `Session`) — don't force everything into one repository file.

---

## 12. Common Patterns

**Repository Pattern**
- *Purpose:* isolate all database access behind small, intention-named methods so the rest of the app never sees raw Prisma calls.
- *Diagram:* `Service → Repository.methodName() → prisma.model.operation()`
- *Example:* `AuthRepository.findUserByEmail(email)` → `prisma.user.findUnique({ where: { email } })`

**Dependency Injection (lightweight, constructor-based)**
- *Purpose:* let a service receive its dependencies instead of constructing them itself, so they can be swapped (e.g. in tests) without editing the service.
- *Diagram:* `new AuthService(new AuthRepository(), new SessionRepository())`
- *Example:* `auth.service.ts` bottom: `export const authService = new AuthService(new AuthRepository(), new SessionRepository());` — a manual, no-framework version of DI (no container library is used here).

**Error Handling**
- *Purpose:* one predictable place to convert "something went wrong" into the right HTTP status + safe message.
- *Diagram:* `throw new SomeAppError() → Express 5 auto-catch → error-handler.ts → instanceof check → sendError`
- *Example:* `throw new ConflictError("Email is already Registered")` in `auth.service.ts`.

**Validation**
- *Purpose:* reject malformed input before it reaches business logic.
- *Diagram:* `validate(schema) → schema.parse(req.body) → next() or throw ValidationError`
- *Example:* `validate(loginSchema)` in `auth.routes.ts`.

**API Response Envelope**
- *Purpose:* one consistent JSON shape (`{ success, message?, data }` or `{ success: false, message }`) for every endpoint.
- *Diagram:* `controller → sendSuccess/sendError → res.status(code).json(envelope)`
- *Example:* every method in `auth.controller.ts`.

**Configuration**
- *Purpose:* centralize and validate all environment-derived settings.
- *Diagram:* `.env → dotenv.config() → Zod schema.parse(process.env) → env object`
- *Example:* `config/env.ts`.

**Prisma Client Singleton**
- *Purpose:* one shared connection pool, safe across dev hot-reloads.
- *Diagram:* `globalThis.prisma ?? new PrismaClient()`
- *Example:* `lib/prisma.ts`.

**Transactions** *(pattern not yet used in this codebase — documenting for when you need it)*
- *Purpose:* make multiple writes succeed or fail together (e.g. creating a Workspace row + its first OWNER Membership row).
- *Diagram:* `prisma.$transaction([op1, op2]) or prisma.$transaction(async (tx) => { ...use tx instead of prisma... })`
- *When you'll need it first:* Workspace-creation service method — see Section 9's note.

**What should I remember?**
- DI here is manual (constructor arguments), not a framework — don't go looking for a DI container, there isn't one.
- Every pattern above already has exactly one canonical example in `modules/auth/` — copy that shape, don't invent a new one.
- Transactions are the one pattern you'll need soon that isn't demonstrated yet.

---

## 13. Debugging Guide

| Symptom | Where to look first | Likely cause |
|---|---|---|
| Request fails with generic 500 | Server console log (error-handler.ts logs non-AppErrors) | An unexpected/unhandled error — a real bug, not a thrown `AppError` |
| "Validation" error (400ish, message lists field issues) | The relevant `*.validation.ts` schema vs. actual request body sent | Client sent a field with the wrong type/missing field; check Zod message |
| Database error (Prisma throws) | Repository method, then `prisma.*` query, check constraint names in `schema.prisma` | Unique constraint violation, missing required field, FK violation (e.g. inserting a `Task` with a bad `projectId`) |
| JWT error ("Invalid access/refresh token") | `utils/jwt.ts` verify functions, check which secret + which token | Wrong secret used, expired token, token signed before a secret rotation, or a raw token was hashed/not hashed inconsistently |
| Prisma "client did not initialize" / import errors | `src/generated/prisma/` present? Did you run `npx prisma generate`? | Forgot to regenerate the client after a schema change |
| "Authorization header missing/invalid" | `middleware/auth.ts` | Client not sending `Authorization: Bearer <token>`, or malformed (missing "Bearer " prefix) |
| Refresh/logout says "Invalid refresh token" even though login just worked | `session.repository.ts findByRefreshTokenHash` — checks `revokedAt: null` and `expiresAt > now` | Token already used to logout (revoked), expired (>7 days), or the raw token being hashed doesn't match what's stored (check you're not accidentally re-hashing an already-hashed value) |
| Cookie missing | N/A currently | Cookies aren't wired into auth flow yet — this isn't a bug, it's a not-yet-built feature (see Section 7) |
| Transaction rollback | N/A currently — no transactions in the codebase yet | Not applicable yet; once you add `prisma.$transaction`, a thrown error anywhere inside the transaction callback rolls back all writes in it |

**Flowchart — "my request isn't working":**
```
Did the request reach the route at all?
   │ No → check app.ts mounting + auth.routes.ts path/method
   │ Yes
   ▼
Did validation pass?
   │ No → read the ValidationError message, compare against *.validation.ts schema
   │ Yes
   ▼
Did authentication pass (if required)?
   │ No → check Authorization header format, token expiry, JWT secret match
   │ Yes
   ▼
Did the service throw an AppError?
   │ Yes → that IS the answer, read err.message (ConflictError/NotFoundError/etc.)
   │ No
   ▼
Did Prisma throw?
   │ Yes → read the constraint/error code, check schema.prisma for that table's constraints
   │ No
   ▼
Check server console for an unexpected 500 — likely a real bug, add a console.log at the service boundary
```

**What should I remember?**
- Always check `*.validation.ts` first for 400-shaped failures, `*.service.ts` for business-rule (409/401/403/404) failures, and the console log for genuine 500s.
- "Invalid refresh token" can mean expired, revoked, *or* tampered — the service layer doesn't currently distinguish these in the error message; check the DB row directly (`revokedAt`, `expiresAt`) if you need to know which.
- No cookies, no transactions yet — don't debug for functionality that hasn't been built.

---

## 14. Architecture Summary (one page)

**This project is:** an Express + TypeScript + Prisma + PostgreSQL API, organized by feature module, with a strict one-directional layered request pipeline and a centralized error/response system.

```
                         ┌─────────────────────────────┐
                         │        Client / Browser      │
                         └───────────────┬───────────────┘
                                         │ HTTP
                         ┌───────────────▼───────────────┐
                         │   Express app (src/app.ts)    │
                         │  express.json(), route mount  │
                         └───────────────┬───────────────┘
                                         │
                    ┌────────────────────▼────────────────────┐
                    │      modules/auth/auth.routes.ts          │
                    │  (only built module — more to come)       │
                    └───┬─────────┬─────────┬─────────┬─────────┘
                        │         │         │         │
                  validate()  Authenticate  validate() validate()
                        │         │         │         │
                    ┌───▼─────────▼─────────▼─────────▼───┐
                    │        auth.controller.ts             │
                    └───────────────┬────────────────────────┘
                                    │
                    ┌───────────────▼────────────────────────┐
                    │         auth.service.ts                  │
                    │  bcrypt, jwt utils, business rules        │
                    └───┬─────────────────────────┬────────────┘
                        │                         │
              ┌─────────▼─────────┐    ┌─────────▼─────────┐
              │ auth.repository.ts │    │session.repository.ts│
              └─────────┬─────────┘    └─────────┬─────────┘
                        │                         │
                    ┌───▼─────────────────────────▼───┐
                    │     Prisma Client (lib/prisma.ts) │
                    └───────────────┬────────────────────┘
                                    │
                         ┌──────────▼──────────┐
                         │      PostgreSQL       │
                         │ users, sessions, +5   │
                         │ more tables (schema-  │
                         │ only, no code yet)    │
                         └───────────────────────┘

Cross-cutting, used from anywhere:
  errors/*.ts (typed failures) → middleware/error-handler.ts → utils/api-response.ts (sendError)
  utils/api-response.ts (sendSuccess) — used by every controller
  config/env.ts — validated settings, used by jwt.ts, server.ts
```

**Next milestone:** build `modules/workspace/` following Section 10's blueprint — it unblocks `project`, which unblocks `task`, which unblocks `comment`/`activityLog`. First new pattern you'll need that hasn't appeared yet: `prisma.$transaction` for atomic workspace + owner-membership creation.

**What should I remember (final, whole-project):**
- Layer order is non-negotiable: routes → middleware → controller → service → repository → Prisma → Postgres.
- Feature-module structure: copy `modules/auth/`'s file set for every new feature.
- Only repositories call Prisma; only services throw `AppError`s; only controllers call `sendSuccess`/`sendError`.
- Auth uses two JWTs (access 15m / refresh 7d, separate secrets) plus a `Session` table so refresh tokens are revocable.
- Cookies and transactions are installed/schema-ready but **not yet implemented** — don't assume they work.
- Cascade = container relations, Restrict = attribution relations, SetNull = soft links (task assignee only) — this pattern repeats across the whole schema.
