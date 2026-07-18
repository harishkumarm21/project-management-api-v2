# Engineering Playbook

Reusable conventions for building features in `project-management-api-v2`. This file barely changes — consult it every time you add a module. It does not explain *this project's* current state (that's [`project-learning-guide.md`](./project-learning-guide.md)); it defines the *standard* every feature must follow.

---

## 1. Folder Structure

```
src/modules/<feature>/
  <feature>.routes.ts        Router: path + method → middleware chain → controller method
  <feature>.controller.ts    HTTP translation only
  <feature>.service.ts       Business rules
  <feature>.repository.ts    Persistence only (Prisma calls)
  <feature>.types.ts         Shared interfaces for this feature
  <feature>.validation.ts    Zod schemas
```

Rules:
- One folder per feature under `src/modules/`. Never split a feature's controller/service/repository across top-level `controllers/`, `services/`, `repositories/` folders.
- A module may have more than one repository if it owns more than one table (e.g. `auth` has `auth.repository.ts` for `User` and `session.repository.ts` for `Session`). One repository per table it manages, not one per feature.
- Shared, cross-feature code lives outside `modules/`: `middleware/`, `errors/`, `lib/`, `utils/`, `config/`, `types/`.
- Never import one feature module's internals from another feature module directly. If two features need to share logic, extract it to `utils/` or `lib/`.

---

## 2. Request Lifecycle

Every route follows this exact chain, in this order. Do not skip or reorder steps.

```
Route → Middleware (validate → authenticate → authorize) → Controller → Service → Repository → Prisma → PostgreSQL
```

- **Validation** always runs before **authentication** — reject a malformed body before spending effort checking who sent it.
- **Authentication** (`Authenticate` middleware) always runs before **authorization** (role/ownership checks) — you must know *who* before deciding *what they're allowed to do*.
- A route only includes the middleware it actually needs — public routes (register, login) skip `Authenticate`; routes with no ownership concept skip authorization.
- Controllers call exactly one service method per request. If a controller needs to call two service methods to fulfill one request, that's a sign the service method boundary is wrong — fix the service, don't stack calls in the controller.

---

## 3. Service Responsibilities

**A service:**
- Holds all business rules (uniqueness checks, state transitions, ownership/role logic, orchestration across multiple repositories).
- Receives and returns plain data (validated input in, plain objects/DTOs out) — never touches `req`/`res`.
- Throws typed `AppError` subclasses for every expected failure (see Section 7).
- Is the only layer allowed to call more than one repository, or a repository from a different module (e.g. `AuthService` uses both `AuthRepository` and `SessionRepository`).
- Owns transaction boundaries when an operation spans multiple writes (see Section 5).

**A service must never:**
- Call `prisma.*` directly — always go through a repository.
- Read `req.headers`, `req.user`, cookies, etc. directly — the controller extracts what's needed and passes it in as a plain argument.
- Format an HTTP response — that's the controller's job.

**Construction pattern:** manual constructor-based dependency injection, no DI framework.
```ts
export class WorkspaceService {
  constructor(
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly membershipRepository: MembershipRepository,
  ) {}
}

export const workspaceService = new WorkspaceService(
  new WorkspaceRepository(),
  new MembershipRepository(),
);
```

---

## 4. Repository Responsibilities

**A repository:**
- Wraps exactly one Prisma model (one table) per repository class.
- Exposes small, intention-named methods: `findByEmail`, `create`, `revoke` — not generic `query(sql)` escape hatches.
- Contains zero business logic — no `if` statements deciding whether an action *should* happen, only *how* to persist/retrieve it.
- Returns Prisma's native result shape (or a `select`-narrowed version of it) — mapping to a public-facing DTO shape happens in the service, not the repository.

**A repository must never:**
- Throw `AppError` subclasses — a "not found" from a repository is just `null`/`undefined`; the *service* decides whether that's an error and which error type.
- Call another repository.
- Contain `req`/`res`/HTTP concerns of any kind.

**Naming pattern:** verb + noun, matching intent, not matching the raw Prisma method name 1:1 when a clearer name exists (`findUserByEmail`, not `findUnique`).

---

## 5. Transaction Rules

Use `prisma.$transaction(...)` whenever a single logical operation requires **more than one write** that must all succeed or all fail together.

**Must use a transaction:**
- Creating a `Workspace` + its first `WorkspaceMembership` (OWNER) row.
- Any "create parent + create related row(s)" operation where an orphaned parent (created but its required child row missing) would leave invalid state.
- Multi-row status transitions where partial application would violate a business invariant (e.g. revoking all sessions for a user across multiple rows).

**Do not need a transaction:**
- A single Prisma call (`create`, `update`, `delete`, `findX`) — Postgres already guarantees atomicity for one statement.
- Sequential reads with no write dependency between them.

**Pattern:**
```ts
async createWorkspace(input: CreateWorkspaceInput, ownerId: string) {
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({ data: { ... } });
    await tx.workspaceMembership.create({
      data: { workspaceId: workspace.id, userId: ownerId, role: "OWNER" },
    });
    return workspace;
  });
}
```
- The transaction callback lives in the **repository** (it's still just persistence — an atomic multi-write persistence operation), and it's the repository that receives `tx` and passes it to every call inside the callback instead of the module-level `prisma`.
- If the operation needs a business decision mid-transaction (e.g. "only create the membership if X"), that decision is made in the service *before* calling the repository — don't put conditional business logic inside a `$transaction` callback.
- Any error thrown inside the callback rolls back every write in it automatically — don't catch-and-swallow errors inside a transaction callback.

---

## 6. Validation Pipeline

- Every route that accepts a body uses `validate(schema)` from `middleware/validate.ts` as the first middleware in its chain.
- Schemas live in `<feature>.validation.ts`, one exported `zSchema` + one exported `z.infer<>` type per endpoint (e.g. `registerSchema` / `RegisterInput`).
- Validation-cleaned data (`schema.parse()` result) replaces `req.body` — controllers and services always receive the *validated, coerced* shape, never raw input.
- Business-rule checks (e.g. "email already exists") are **not** validation — they belong in the service, not the Zod schema, because they require a database lookup.
- Validation failures always become a `ValidationError` (400) — never a raw `ZodError` leaking past the middleware.

**Convention for schema definitions:**
```ts
export const createXSchema = z.object({ ... });
export type CreateXInput = z.infer<typeof createXSchema>;
```

---

## 7. Error Handling Strategy

- All expected failures throw a subclass of `AppError` (`src/errors/`). Never `throw new Error(...)` for an expected condition.
- Current subclasses and their status codes — reuse these, only add a new one if none fits:

| Class | Status | Use for |
|---|---|---|
| `ValidationError` | 400 | Malformed input (usually thrown by `validate` middleware, not manually) |
| `UnauthorizedError` | 401 | Missing/invalid/expired credentials |
| `ForbiddenError` | 403 | Authenticated, but not allowed to perform this action (role/ownership) |
| `NotFoundError` | 404 | Resource doesn't exist (or, for privacy, "doesn't exist for this requester") |
| `ConflictError` | 409 | Uniqueness violation, invalid state transition |

- Never let a controller or middleware catch and swallow an error silently — either let it throw (Express 5 auto-catches async throws) or explicitly `next(err)`.
- The global `errorHandler` is the only place that decides what's shown to the client vs. logged server-side. Don't add per-route try/catch blocks that duplicate this.
- Unexpected (non-`AppError`) errors always return a generic 500 to the client — never leak `err.message`, stack traces, or Prisma error internals to the client for unknown errors.

---

## 8. API Response Format

Every response goes through `utils/api-response.ts` — never call `res.json(...)` directly in a controller.

**Success:**
```ts
sendSuccess({ res, statusCode, message?, data });
// → { success: true, message?, data }
```

**Error** (only called from `error-handler.ts` / `not-found.ts`, not from controllers directly):
```ts
sendError({ res, statusCode, message });
// → { success: false, message }
```

Conventions:
- `statusCode` follows standard REST semantics: `200` read/update, `201` create, `204` no body (rare here — this project prefers `200` + `data: {}` for actions like logout), `4xx` client error, `500` server error.
- `data` is always present on success, even if empty (`data: {}`), never `undefined`.
- Never return raw Prisma model objects with sensitive fields (e.g. `passwordHash`, `refreshTokenHash`) — shape the return object explicitly in the service before it reaches the controller.

---

## 9. Logging Conventions

*(Not yet formalized in code — this is the standard to apply going forward.)*

- Use `console.log`/`console.error` sparingly and only for genuinely unexpected conditions (mirrors current `error-handler.ts` behavior: log only non-`AppError` failures).
- Never log raw passwords, raw tokens (access/refresh), or password/token hashes — log user IDs and event types instead.
- Don't add `console.log` debug statements to committed code (remove before merging — e.g. the stray `console.log("==========", schema)` in `middleware/auth.ts` is exactly what to avoid; clean it up next time that file is touched).
- If structured logging is introduced later (e.g. `pino`/`winston`), it replaces `console.*` everywhere in one pass — don't mix ad-hoc `console.log` with a structured logger.

---

## 10. Authorization Conventions

- **Authentication** (`Authenticate` middleware) answers "who is this?" — always runs first, attaches `req.user`.
- **Authorization** answers "is this user allowed to do this specific thing?" — a separate concern, checked in the **service**, not the middleware, because it usually needs to know about the specific resource (e.g. "is `req.user.id` a member of *this* `workspaceId`?").
- Pattern for resource-scoped authorization: the service loads the relevant `WorkspaceMembership` (or ownership record) and throws `ForbiddenError` if the requester's role doesn't permit the action, *before* performing the write.
- Role checks (`OWNER`/`ADMIN`/`MEMBER`) belong in the service layer, expressed as explicit checks, not scattered `if` statements across controllers.
- Default posture: a route is public only if it's explicitly meant to be (register, login). Every other route gets `Authenticate` plus, where relevant, a service-level ownership/role check.

---

## 11. Prisma Conventions

- Only repository files import and call `prisma`. Every repository imports the shared singleton from `src/lib/prisma.ts` — never `new PrismaClient()` anywhere else.
- One repository class per Prisma model/table.
- Use `select` to narrow returned fields whenever a query result will cross a layer boundary into a controller response (never let `passwordHash`/`refreshTokenHash` leak out — see `AuthRepository.findUserById`'s explicit `select` as the reference example).
- Any schema change: edit `prisma/schema.prisma` → `npx prisma migrate dev --name <descriptive_name>` → commit the generated migration folder. Never hand-edit `src/generated/prisma/`.
- Migration names are short, snake_case, descriptive of the change (`add_workspace_table`, not `update` or `fix`).
- Multi-write atomic operations use `prisma.$transaction` inside the repository layer (see Section 5).
- Foreign key `onDelete` behavior convention: container relations (child row meaningless without parent) → `Cascade`. Attribution relations (who created/authored something) → `Restrict`. Optional soft links (e.g. task assignee) → `SetNull`. Follow this pattern for every new relation; don't default to `Cascade` everywhere.

---

## 12. Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Files | `<feature>.<layer>.ts` | `workspace.service.ts` |
| Classes | PascalCase, suffixed by layer | `WorkspaceService`, `WorkspaceRepository` |
| Exported singleton instance | camelCase, same name lowercased | `export const workspaceService = new WorkspaceService(...)` |
| Zod schemas | camelCase + `Schema` suffix | `createWorkspaceSchema` |
| Inferred input types | PascalCase + `Input` suffix | `CreateWorkspaceInput` |
| Error classes | PascalCase + `Error` suffix, one per HTTP status meaning | `NotFoundError` |
| Repository methods | verb + noun describing intent | `findByEmail`, `revoke`, `create` |
| Prisma model fields (TS side) | camelCase | `passwordHash`, `createdAt` |
| Database columns (via `@map`) | snake_case | `password_hash`, `created_at` |
| Route paths | kebab-case, plural resource nouns | `/api/v1/workspaces`, `/api/v1/auth/login` (auth is an exception — action-style, not a resource) |
| Env vars | SCREAMING_SNAKE_CASE | `JWT_ACCESS_SECRET` |

---

## 13. Git Workflow

- Commit early and often on feature work; squash/clean up isn't required before merging to `main` in this solo-project setup, but each commit should represent one coherent step (e.g. "add workspace repository," not "wip").
- Prefer descriptive, present-tense or past-tense commit summaries over vague ones like "update" or "fix stuff." Existing history is informal (`"login phase 1 tested"`, `"bearer impl"`) — going forward, prefer the more structured style already used a few times in this repo (`"chore: setup project infrastructure and initial database migration"`), i.e. `<type>: <what changed>` where useful (`feat`, `fix`, `chore`, `refactor`).
- Branch per feature module when work will span multiple sessions (`feature/workspace-module`); commit directly to `main` for small, self-contained fixes.
- Never commit `.env`, `node_modules/`, or `src/generated/prisma/` if a `.gitignore` entry doesn't already cover them — verify before adding new generated-file types to the repo.
- A migration folder under `prisma/migrations/` is committed in the same commit as the `schema.prisma` change that produced it — never split them across commits.

---

## 14. Code Review Checklist

Before considering a new feature module done, verify:

**Structure**
- [ ] New feature lives entirely under `src/modules/<feature>/`, matching the file set in Section 1.
- [ ] Router is mounted in `app.ts` (`app.use("/api/v1/<feature>", featureRouter)`) — don't repeat the `src/routes/index.ts` mistake of building a router and never wiring it in.

**Layering**
- [ ] Controller has no business logic, no `prisma.*` calls, no manual `res.json(...)`.
- [ ] Service has no `req`/`res` access, no direct `prisma.*` calls.
- [ ] Repository has no business rules, no thrown `AppError`s, no cross-repository calls.

**Validation & Auth**
- [ ] Every mutating route has a `validate(schema)` middleware.
- [ ] Every non-public route has `Authenticate`.
- [ ] Resource-scoped actions have an explicit authorization check in the service (role/ownership), not just authentication.

**Errors & Responses**
- [ ] All expected failure paths throw an existing `AppError` subclass (Section 7) — no plain `Error`, no new error subclass unless truly none fit.
- [ ] All responses go through `sendSuccess`/`sendError`.
- [ ] No sensitive fields (`passwordHash`, `refreshTokenHash`, raw tokens) appear in any response payload.

**Database**
- [ ] Multi-write operations that must be atomic use `prisma.$transaction`.
- [ ] New relations follow the Cascade/Restrict/SetNull convention (Section 11).
- [ ] Migration committed alongside the schema change, with a descriptive name.

**Hygiene**
- [ ] No stray `console.log` debug statements left in.
- [ ] No dead/unwired code committed (routers created but not mounted, unused exports).
- [ ] Naming follows Section 12 across files, classes, schemas, and routes.
