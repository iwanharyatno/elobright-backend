# AGENTS.md

Express 5 + TypeScript REST API for the Elobright assessment platform. Drizzle ORM over PostgreSQL. **Package manager is Yarn** (not npm).

## Commands

- `yarn dev` — run via `ts-node-dev --respawn --transpile-only src/index.ts` (no typechecking on run)
- `yarn build` — `tsc`; **this is the only typecheck step** (no lint/typecheck script exists)
- `yarn start` — run compiled `dist/index.js`
- `yarn test` — jest + ts-jest (unit tests only, no DB needed)
- `yarn db:generate` / `yarn db:migrate` — drizzle-kit generate/migrate
- `yarn db:seed` — **destructive**: truncates answer/submission/question/exam tables, then reloads `src/infrastructure/database/seeder/seeder.sql`

Run a single test: `yarn test -- tests/unit/use-cases/exam/ManageExams.test.ts`

## Architecture

Layered (clean-architecture style); all wiring is **manual constructor injection done inside each route file** (`src/infrastructure/web/routes/*.ts`): instantiate `Drizzle*Repository` → UseCase class → Controller, then register routes. Follow this pattern for new endpoints.

- `src/domain/` — entities + repository interfaces
- `src/use-cases/` — plain classes with repository dependencies
- `src/interface-adapters/` — controllers + `Drizzle*Repository` implementations
- `src/infrastructure/` — `web/` (server, routes, middleware), `database/` (drizzle `schema.ts`, `db.ts`, seeder)

Errors are passed via `next(error)` to the central handler in `src/infrastructure/web/middleware/errorHandler.ts` (ZodError → 400; `Email already in use` → 409; `Invalid email or password` → 401; else 500).

## Auth

JWT Bearer via `authMiddleware(allowedRoles)` in `src/infrastructure/web/middleware/authMiddleware.ts`. Roles: `superadmin`, `admin`, `reviewer`, `moderator`, `user`. Presets `ROLE_USER` and `ROLE_ADMIN`. `req.user = { userId, role }` is available after auth.

Email verification via 6-digit code (10 min TTL) sent through nodemailer (`src/infrastructure/email/mailer.ts`, creds from `SMTP_*`/`EMAIL_FROM` env vars):
- `POST /api/auth/register` — creates user (`is_verified=false`) and emails a code
- `POST /api/auth/verify-email` `{ email, code }`
- `POST /api/auth/resend-verification` `{ email }`
- `POST /api/auth/login` — **rejects unverified accounts** (403 `Email not verified`)
- Use case helpers in `src/use-cases/auth/verificationCode.ts`; inject `IEmailService` into use cases so tests can mock it. `NodemailerEmailService` throws `SMTP is not configured` (→503) if creds are missing.
- Error mappings: `User not found`→404, `Invalid verification code`/`Verification code has expired`→400, `Email not verified`→403.

## Rate limiting

Custom in-memory `rateLimit({ windowMs, max })` middleware in `src/infrastructure/web/middleware/rateLimiter.ts` (no external lib). Applied globally to `/api` in `server.ts` (120 req/min) and stricter per-endpoint on auth routes (e.g. login 5 req/15 min) in `authRoutes.ts`.

## Certification scores (for certificate printing)

Data for combining teacher-entered scores with exam scores. Two tables in `src/infrastructure/database/schema.ts`:
- `certification_additional_scores` — `id`, `score_name`, `weight` (0–1). CRUD at `/api/certification-additional-scores` (writes `ROLE_ADMIN`, reads `ROLE_USER`).
- `certification_score` — `id`, `user_id`, `exam_submission_id` (unique), `additional_score` (jsonb, `{ score_name: value }`, nullable), `exam_score_override` (0–100, nullable). Routes in `certificationScoreRoutes.ts` (`ROLE_ADMIN` except download):
  - `GET /api/certification-scores` (list, optional `?exam_submission_id=` filter)
  - `PATCH /api/certification-scores/:id` `{ additional_score?, exam_score_override? }`
  - `GET /api/certification-scores/:id/download` — **public** (no JWT): renders the PDF certificate via pdfkit
  - `POST /api/certification-scores/blast-email` `{ exam_submission_id }` — emails that submission's user their certificate download link + identity

Key behaviors:
- `ManageExamSessions.finishExam` (use case in `src/use-cases/exam/`) auto-creates a `certification_score` row (`additional_score` null) on finish via `createForSubmission` (idempotent, `onConflictDoNothing` on `exam_submission_id`).
- `PATCH` validates `additional_score` keys against configured `score_name`s; unknown keys → 400 `Unknown additional score name: <key>`.
- Certificate score math lives in `src/use-cases/certification/certificateComputation.ts`: exam score = `exam_score_override` if set, else normalized `(Σ section-submission totalScore / Σ question points across the exam's sections) × 100`; exam weight = `1 − Σ additional weights` (clamped ≥ 0); `final = examScore × examWeight + Σ(additionalScore × weight)`.
- PDF rendering in `src/infrastructure/pdf/certificatePdf.ts`; background image is hardcoded at `assets/certificate-background.png` (repo root, resolved via `process.cwd()`; missing file → plain white PDF). Replace the PNG to customize the look.
- Certificate emails use `sendCertificateEmail` on `NodemailerEmailService` (`SMTP_*` env); the download link is built from `BASE_URL` env (default `http://localhost:3000`).
- New use cases live in `src/use-cases/certification/` (same constructor-injection pattern; wired in the route files).

## DB / migrations

- Schema source of truth: `src/infrastructure/database/schema.ts` (edit here, then `yarn db:generate`).
- `drizzle/` is **gitignored and untracked** — fresh clones have no migration SQL; CI never runs a DB. `db:migrate` requires locally generated files.
- `.env` `DATABASE_URL` uses host `db` (the docker-compose Postgres service name). For local non-Docker runs, override the host to `localhost`.
- DB is run via `docker-compose.yml` (dev) or `docker-compose.prod.yml`; the `.env` `POSTGRES_*` vars drive the postgres container.

## Gotchas

- Timezone: `process.env.TZ = env.TIME_ZONE` is set in `src/index.ts` (default `Asia/Jakarta`); timestamps are stored with timezone.
- Route mount mismatch: `examSubmissionRoutes` is mounted at `/api/exam-sessions` in `server.ts`. Answer submission uses `multipart/form-data` (field `audio`), not JSON.
- Uploaded files go to `uploads/` (gitignored) via `uploadMiddleware`; the `/uploads` static route in `server.ts` is commented out, so uploads aren't publicly served.
- Test mode: `src/config/env.ts` skips env validation and uses fallback values when `NODE_ENV=test` (jest sets this automatically). CI passes `JWT_SECRET=secret`.
- Tests mock `bcryptjs`/`jsonwebtoken` and repository interfaces; they live in `tests/unit/use-cases/` mirroring `src/use-cases/`.
- Express **5**, not 4 — async handlers are not auto-caught; controllers wrap calls in try/catch and forward to `next`.
- Exam attempt flow and API contract: `docs/assessment-flow.md`; Postman collection at `docs/collection.json`.
- **Tests are partially broken on `main`** (pre-existing): `ManageExamSections`, `ManageExamSessions`, `ManageQuestions`, `RecordUserAnswer` test suites fail to compile — their mocks are missing newer repository methods (`findAllWithDetails`, `findByIds`, etc.) and entity fields. Only `auth` + `ManageExams` suites pass. Run a single suite with `yarn test -- --runInBand <path>` (on low-memory machines the default parallel workers OOM).
- Dependencies are pinned to `node_modules/`; `nodemailer` requires real SMTP creds in `.env` to send codes.
