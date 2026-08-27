# Frontend Implementation Guide — All Breaking Changes + Score Import (Disposable)

> **Version**: `2026-08-28` · Backend `elobright-backend` · Migrations `0018_keen_cannonball.sql` (exam_submissions.group_number).

This single guide consolidates **every breaking change** since `groupName` addition and the new **Excel/CSV Score Import** feature. Older guides (`guide_group_en.md`, `guide_groups_id.md`) remain for history but this file is the source of truth for the next frontend release.

---

## 0) TL;DR — What You Must Change Before Deploy

| Area | Before | After | FE Action |
|---|---|---|---|
| `POST /api/exam-sessions/start` | `{userId, examId, timezone?}` | `{userId, examId, group_number, study_program, timezone?}` (`group_number` `varchar(50)` trim min1, `study_program` trim min1 max255) | Add 2 required inputs. Old call → `400`. |
| `GET /api/certification-scores` | `?examSubmissionId` (or no filter) returns every row, no group/program | `?examId` (uuid) returns **latest per user per exam** (deduplicated by `startedAt` desc), response `+ groupNumber + degreeProgram` (camelCase only, `string\|null`) — no `group_number`/`degree_program` snake | Replace filter param, render 2 new columns. Legacy `?examSubmissionId`/`?exam_submission_id` → `400 Use examId`. |
| `PATCH /api/certification-scores/:id` | `examScoreOverride: Record<uuid,0..100>` (`additional_score` snake) | `examScoreOverride: Record<sectionTitle,0..100>` case-insensitive, `additionalScore` (both strict camelCase), `null` clears, validated vs `exam_sections.title ?? id` | Send **titles** not uuids, use camelCase fields. |
| `POST /api/certification-scores/blast-email` | `{exam_submission_id}` snake | `{examSubmissionId}` camelCase strict | Rename field. |
| `GET /api/certification-scores/:id/download` | public | unchanged | — |
| **NEW** `POST /api/certification-scores/import` | — | `multipart/form-data` `examId` + `file` (xlsx/xls/csv, 5 MB, `NIM` required column) → `202 {importId,totalRows,warnings}` or `400/409` | Build admin import UI, validate before queue. |
| **NEW** `GET /api/certification-scores/import/:importId/progress` | — | polling `{state,progress:{percent,processed,total,success,failed,warnings,errors},returnvalue}` | Poll fallback. |
| **NEW** `GET /api/certification-scores/import/:importId/stream` | — | `SSE` `text/event-stream` `data: {event, progress}` via `QueueEvents` | Real-time progress UI. |
| `exam_submissions` DB | no group | `group_number varchar(50) nullable` | `yarn db:migrate` before backend. |

**Strict camelCase rule** — all *new* `certification-scores` payload/response/query fields are **strict camelCase** (`additionalScore`, `examScoreOverride`, `examSubmissionId`, `examId`, `groupNumber`, `degreeProgram`). Unknown keys → `400 {error:"Validation Error", details:[{code:"unrecognized_keys"}]}`. Older controllers (`exam-sessions/start` keeps `group_number`/`study_program` snake) are **not** retrofitted per product decision.

Deploy: `yarn db:migrate` → `yarn build` (`tsc`) + `yarn worker:build` → deploy `api` + `worker` (`scoreImportWorker` alongside `emailWorker`, shared `redis:7`) → frontend.

---

## 1) `POST /api/exam-sessions/start` — Required `group_number` + `study_program`

### Contract

```http
POST /api/exam-sessions/start
Authorization: Bearer <JWT> # ROLE_USER
Content-Type: application/json
{
  "userId": 334,
  "examId": "11111111-0000-4000-8000-000000000001",
  "timezone": "Asia/Jakarta",          // optional
  "group_number": "A1",                // required, z.string().trim().min(1).max(50) — DB varchar(50) nullable
  "study_program": "Computer Science" // required, z.string().trim().min(1).max(255) — students.degree_program
}
```

*DB* `exam_submissions.group_number varchar(50) nullable` (`schema.ts:76`). API is stricter than DB.  
*Code* `ExamSubmissionController.ts:12` (`startSchema`) and `ManageExamSessions.ts:94` (writes `groupNumber: group_number || null` and conditionally `students.degree_program`).

### Persistence

- `group_number` → `exam_submissions.group_number` **on creation only**. `409 Ongoing session already exists` returns `session.groupNumber` and does **not** overwrite.
- `study_program` → `students.degree_program` **only if `students` row exists** (`findByUserId` → `updateDegreeProgram`, else silently ignored). `type:"student"` at `POST /api/auth/register` creates row; `type:"user"` does not. Also not refreshed on `409`.

### Status

| Code | Body |
|---|---|
| `201` | `{message:"Exam started", session:{id, groupNumber:"A1", currentSectionSession:{endTimeLimit, endTimeLocale}}}` |
| `400` | `{error:"Validation Error", details:[{path:["group_number"], message:"group_number is required"}]}` |
| `401` | `{error:"Unauthorized"}` |
| `403` | `{message:"Exam can only be taken once"}` (`exam.isOnce`) |
| `404` | `{message:"Exam not found"}` |
| `409` | `{message:"Ongoing session already exists", session, checkpoint}` — rehydrate, don’t retry with different group/study |

### FE snippet

```ts
export type StartExamPayload = {userId:number; examId:string; group_number:string; study_program:string; timezone?:string};
export async function startExam(p:StartExamPayload, token:string){
  const r=await fetch('/api/exam-sessions/start',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(p)});
  if(r.status===400){const {details}=await r.json(); throw new ValidationError(details);}
  if(r.status===409){const {session}=await r.json(); return {resumed:true,session};}
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}
```

---

## 2) `GET /api/certification-scores` — `examId` + Latest per User

```http
GET /api/certification-scores
GET /api/certification-scores?examId=<uuid>
Authorization: Bearer <JWT> # ROLE_ADMIN (certificationScoreRoutes.ts:54)
```

*Controller* `CertificationScoreController.ts:22` now: `?examId` (`z.string().uuid()`), rejects legacy `?exam_submission_id`/`?examSubmissionId` with `400 {error:"Use examId (camelCase) query param"}`.  
*Use-case* `ManageCertificationScores.ts:90` `getAll(examId?)`:
- **with `examId`**: `findByExamId(examId)` → group by `userId` pick `max(startedAt)` (tie `submittedAt`) → `findByExamSubmissionId` for latest ids → `await Promise.all(certScores.filter(Boolean))`.
- **without**: `findAll()` → `findById` for each `examSubmissionId` to get `examId` → group by `${userId}-${examId}` picking latest → deduplicated.
- Enrichment per score: `submission.findById`, `exam.findById`, `student.findByUserId`, `buildSectionBreakdown` (with `title`), plus `groupNumber`/`degreeProgram` (camelCase only, `null` for legacy/missing).

```ts
{
  id, userId, examSubmissionId, additionalScore, examScoreOverride, // examScoreOverride now name-keyed, see §3
  user:{id,email,fullName,role,phoneNumber},
  exam:{id,title,type,isOnce},
  student?:{id,studentId,degreeProgram},
  scores:[{sectionId,sectionName,correctPoints,fullPoints,scaledScore}],
  overrides:[{sectionId,sectionName,overriddenScore}],
  originalExamScore, totalScore,
  groupNumber: string|null, // from latest exam_submissions for examId
  degreeProgram: string|null // from students for userId
}
```

```ts
// All, deduped
fetch(`/api/certification-scores`, {headers:{Authorization:`Bearer ${t}`}})
// Filtered, latest per user for that exam
fetch(`/api/certification-scores?examId=${examId}`, {headers:{Authorization:`Bearer ${t}`}})
```

---

## 3) `PATCH /api/certification-scores/:id` — By Section Name, Strict camelCase

```http
PATCH /api/certification-scores/:id
Authorization: Bearer <JWT> # ROLE_ADMIN
Content-Type: application/json
{
  "additionalScore": { "class_speaking_score": 95 },
  "examScoreOverride": { "Reading": 85, "Listening": 90 } // nullable to clear: null
}
```

*Schemas* `CertificationScoreController.ts:7` `.strict()`:
```ts
z.object({
  additionalScore: z.record(z.string(), z.number().min(0).max(100)).optional(),
  examScoreOverride: z.record(z.string().min(1), z.number().min(0).max(100)).nullable().optional(),
}).strict()
```
*Validation* `ManageCertificationScores.ts:131` case-insensitive:
- `additionalScore` keys vs `Set(scoreName.toLowerCase())` → `400 Unknown additional score name`
- `examScoreOverride` keys vs `Set((title ?? id).toLowerCase())` per exam (fallback `id` when `title` is `null`) → `400 Unknown section name`
*Computation* `certificateComputation.ts:75` `SectionScoreInput {examSectionId, title?, totalScore, maxPoints}` with `overridesLower = Map(lower(key)→value)` and `additionalScore` lookup `scoreName.toLowerCase()===key.toLowerCase()`. Keys **displayed as sent** (preserve casing). Both `ManageCertificate` and `ManageCertificationScores` now fetch real `additionalConfigs` and include `title: s.title ?? null`.

```bash
# Success
curl -X PATCH http://localhost:3000/api/certification-scores/12b5e730-... \
 -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
 -d '{"examScoreOverride":{"Reading":85}}'
# → 200 {message:"Certification score updated", score:{examScoreOverride:{"Reading":85}}}
# Case-insensitive
curl -d '{"examScoreOverride":{"reading":85}}' # also 200, stored as "reading"
# Legacy uuid now fails if title exists
curl -d '{"examScoreOverride":{"22222222-0000-4000-8000-000000000001":90}}' # → 400
# Clear
curl -d '{"examScoreOverride":null}'
```

FE: fetch sections `GET /api/exam-sections/exam/:examId` for titles, build `examScoreOverride` keyed by title, `POST` strict camelCase.

---

## 4) **NEW** Score Import — Excel/CSV Batch via Queue + SSE

### 4.1 Overview

New `scoreImportQueue` (`Queue('score-import')`) + `scoreImportWorker` (`Worker('score-import', concurrency:1)`) alongside `emailWorker`, shared `ioredis` (`REDIS_HOST/PORT/PASSWORD`), `src/worker/scoreImportQueue.ts` + `src/worker/scoreImportWorker.ts`, exported via `src/worker/index.ts`, started in `src/worker/main.ts` and `docker-compose.yml` `worker` service. No new DB table — progress via `job.updateProgress` + `QueueEvents('score-import')` and Redis lock `import:lock:<examId>` (per-`examId` concurrency, as confirmed).

### 4.2 Endpoint `POST /api/certification-scores/import`

```http
POST /api/certification-scores/import
Authorization: Bearer <JWT> # ROLE_ADMIN (scoreImportRoutes.ts)
Content-Type: multipart/form-data
Fields:
  examId: string (uuid, required, z.string().uuid())
  file: File (required, single('file'), xlsx|xls|csv, 5MB, 1 file)
Middleware: authMiddleware(ROLE_ADMIN) → scoreImportUploadMiddleware (multer diskStorage to uploads/tmp, fileFilter mime/ext, limits) → ScoreImportController.importScores → ScoreImportService.validateAndEnqueue
```

**Validation before enqueue** (`ScoreImportService.ts`):
1. `examId` exists (`examRepository.findById`) else `404 Exam not found` + unlink tmp.
2. Per-`examId` guard: `isImportActiveForExam(examId)` (`getActive`+`getWaiting`+`getDelayed` with `examId` match) or `redis SET import:lock:<examId> NX EX 3600` → if active → `409 {error:"Import already in progress for this exam"}` + unlink.
3. File read `readHeaders` (exceljs `workbook.xlsx.readFile` or `csv-parse/sync` `parse(content, skip_empty_lines, trim)`), extracts `headers: string[]` (trimmed) and `totalRows` (non-empty rows after header).
4. **Column spec** — only `NIM` required (case-insensitive `nim`), else `400 Nim column is required`:
   - Other headers case-insensitively classified: `exam_sections.title ?? id` (for provided `examId`) → `section` type else `certification_additional_scores.scoreName` → `additional` type else `unknown`.
   - `NIM` maps to `students.studentId` (via new `IStudentRepository.findByStudentId` case-insensitive `lower(studentId)=lower(?)`).
   - Order: `section` → `additional` → `unknown`; unknown headers produce `warnings: ["Unknown columns will be ignored: UnknownColumn"]`.
   - If no valid data column → warning `No known section...`.

**Response** `202`:

```json
{ "message":"Import queued", "importId":"c4a66185-...", "totalRows":4, "warnings":["Unknown columns will be ignored: UnknownColumn"] }
```

Errors: `400 NIM column is required` / `Exam not found` / `Failed to read file: ...` / `400 Invalid file type` (from multer `fileFilter`) / `413 File too large (max 5MB)` (`LIMIT_FILE_SIZE` in `errorHandler.ts`) / `409 Import already in progress`.

Curl:

```bash
curl -X POST http://localhost:3000/api/certification-scores/import \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "examId=11111111-0000-4000-8000-000000000001" \
  -F "file=@scores.xlsx;type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
# → 202 {importId, totalRows, warnings}

# CSV also
curl -F "examId=..." -F "file=@scores.csv;type=text/csv" ...

# Missing NIM
# → 400 {error:"NIM column is required"}

# While active for same examId
# → 409 {error:"Import already in progress for this exam"}
```

**Storage**: `multer` writes to `uploads/tmp/import-<ts>-<rand>.xlsx` (created if missing), `ScoreImportService` keeps path for worker, worker `finally` unlinks after processing or on failure. `.gitignore` already ignores `uploads/`.

### 4.3 Worker Processing (`scoreImportWorker.ts:80` `processScoreImport`)

For `examId` it fetches `examSections` + `additionalConfigs` once, builds `sectionMapLower` (`(title ?? id).toLowerCase() → {id,title}`) and `additionalMapLower`, then reads workbook (`exceljs` or `csv-parse`), finds `nimIndex` (case-insensitive `nim`), classifies columns as above, then per row (`rowNum = r+2`):

1. `NIM` raw `String(nimRaw).trim()` — if empty → `failed++` `Student not found`.
2. `findByStudentId(nim)` (trim, case-insensitive) → `userId`. If not found → `failed` `Student not found for NIM ...`.
3. `findByUserAndExam(userId, examId)` → sort `startedAt desc` (tie `submittedAt`) → `latest` (newest). If none → `failed` `No exam submission for NIM ...`.
4. `findByExamSubmissionId(latest.id)` → `cert` (`certification_score`). If none → `failed` `Certification score not found ...` (exam not finished, no idempotent `createForSubmission` auto-create — row error, not batch abort).
5. Build per-row `newAdditional` (copy `cert.additionalScore || {}`) and `newOverride` (copy `cert.examScoreOverride || {}`), iterate columns:
   - `isEmptyCell` (`null`/`""` trimmed) → **skip** (preserve existing key).
   - `isExplicitClear("NULL" case-insensitive, "-", "0" string, number 0)` → **column-wise delete** that key case-insensitively from `newAdditional`/`newOverride` (e.g. `Reading: NULL` removes only `Reading` from override, not whole column; if after delete `newOverride` empty → `null` for `updateExamScoreOverride`, similarly `newAdditional` empty → `{}` per repo).
   - Else parse `Number(String(raw).trim().replace(',', '.'))`, validate `0..100` (Zod `z.number().min(0).max(100)`) — if invalid → `rowWarnings` + skip that cell.
   - Else for `section` type: `existingKey = Object.keys(newOverride).find(k=>k.toLowerCase()===headerLower)` → delete `existingKey` then `newOverride[headerOriginal]=num` (preserve header casing as sent), `hasOverrideChange=true`; for `additional` similarly with `additionalMapLower` canonical.
6. Validate merged maps case-insensitively vs `validAdditionalLower` / `validSectionLower` (same as `PATCH`), if invalid → `failed` per row.
7. DB updates (same rules as `PATCH`): if `hasAdditionalChange` → `updateAdditionalScore(cert.id, newAdditional)` (empty → `{}`), if `hasOverrideChange` → `updateExamScoreOverride(cert.id, Object.keys(newOverride).length ? newOverride : null)`. Uses `Drizzle*Repository` directly, two separate `UPDATE`s (not transactional, mirrors `PATCH`).
8. `success++` else `failed++`, collect `rowWarnings` into global `warnings`, `errors: RowResult[]` (last 5 shown in progress). After each row: `await job.updateProgress({percent:Math.round((r+1)/total*100), processed:r+1, total, success, failed, warnings, errors: errors.slice(-5)})` → triggers `QueueEvents` `progress`.

Completion: `unlink(filePath)`, `redis.del('import:lock:<examId>')`, `queueLogger.info`, return `{total, success, failed, warnings, errors}` as `job.returnvalue`. `failed` handler also `del` lock + `unlink`.

**Case-insensitive display**: All lookups `toLowerCase()`, but stored keys preserve `headerOriginal` casing as sent (e.g. Excel header `"reading"` stored as `"reading"`).

### 4.4 Progress Endpoints

```http
GET /api/certification-scores/import/:importId/progress
Authorization: Bearer <JWT> # ROLE_ADMIN
→ 200 {importId, state: "active"|"waiting"|"completed"|"failed"|"delayed", progress:{percent,processed,total,success,failed,warnings,errors}, returnvalue:{total,success,failed,warnings,errors}, failedReason}
→ 404 {error:"Import job not found"} if jobId unknown

GET /api/certification-scores/import/:importId/stream
Authorization: Bearer <JWT> # ROLE_ADMIN
Accept: text/event-stream
→ 200 text/event-stream
data: {"event":"init","importId","state","progress":...}

data: {"event":"progress","importId","data":{percent,...}}

data: {"event":"completed","importId","returnvalue":{total,success,failed,warnings,errors}}

data: {"event":"failed","importId","failedReason":...}
```

*Controller* `ScoreImportController.ts:32` `streamProgress` verifies `getScoreImportJob(importId)` → `404` if missing, else `writeHead 200 text/event-stream`, sends `init`, subscribes `scoreImportQueueEvents.on('progress'|'completed'|'failed')` for that `importId`, plus 2s poll fallback (`getJob` → `getState`/`progress`), cleans up on `req.on('close')`.

`QueueEvents` (`scoreImportQueueEvents` in `scoreImportQueue.ts`) shares same `ioredis` connection (`maxRetriesPerRequest:null`).

**End-of-upload summary**: Both `GET /progress` after `completed` and final `SSE` `completed` event return `returnvalue.total / success / failed` as requested — `total rows successfully updated` (`success`) and `total rows failed` (`failed` = NIM mismatch, no submission, no cert, validation errors). Per-row `continue` ensures one bad `NIM` doesn’t abort batch.

Frontend polling fallback:

```ts
// Upload
const form=new FormData(); form.append('examId', examId); form.append('file', file);
const {importId, warnings} = await fetch('/api/certification-scores/import',{method:'POST', headers:{Authorization:`Bearer ${t}`}, body:form}).then(r=>r.json());
// Poll
const poll= setInterval(async()=>{
  const {state, progress, returnvalue}= await fetch(`/api/certification-scores/import/${importId}/progress`,{headers:{Authorization:`Bearer ${t}`}}).then(r=>r.json());
  updateProgress(progress);
  if(state==='completed') {clearInterval(poll); showResult(returnvalue); } // {total,success,failed,warnings,errors}
}, 1000);
// Or SSE
const es=new EventSource(`/api/certification-scores/import/${importId}/stream`, {headers:{Authorization:`Bearer ${t}`}}); // use fetch SSE with Authorization header via manual EventSource polyfill or fetch + ReadableStream
es.onmessage=e=>{ const {event, progress, returnvalue}=JSON.parse(e.data); if(event==='completed') es.close(); };
```

**Concurrency**: Second `POST /import` with same `examId` while `active`/`waiting`/`delayed` → `409`. Different `examId` allowed concurrently.

---

## 5) Types (strict camelCase for all new)

```ts
// Request POST /import (multipart)
type ScoreImportRequest = { examId: string; file: File }; // file field "file"

// 202
type ScoreImportQueued = { message:"Import queued"; importId:string; totalRows:number; warnings:string[] };

// Job progress (SSE and polling)
type ScoreImportProgress = {
  percent:number; processed:number; total:number;
  success:number; failed:number;
  warnings:string[]; errors:{row:number; nim:string|null; success:boolean; error?:string; warnings?:string[]}[];
  state?: "active"|"completed"|"failed"|"waiting";
  returnvalue?: {total:number; success:number; failed:number; warnings:string[]; errors: any[]};
};

// Certification (already camelCase)
type CertificationScoreEnriched = {
  id:string; userId:number; examSubmissionId:string;
  additionalScore: Record<string,number>|null;
  examScoreOverride: Record<string,number>|null; // keys = Section Name, case-insensitive
  groupNumber:string|null; degreeProgram:string|null;
  originalExamScore?:number; totalScore?:number;
};
```

---

## 6) Migration / Deploy

- No new table — certification scores reused. `yarn db:migrate` already covers `group_number`. `uploads/tmp` auto-created by `scoreImportUploadMiddleware`.
- Env no change (reuses `REDIS_HOST/PORT/PASSWORD`). Worker `src/worker/main.ts` now runs both `emailWorker` + `scoreImportWorker` and closes both `scoreImportQueueEvents` + `scoreImportQueue` on `SIGTERM`/`SIGINT`.
- Install `yarn add exceljs csv-parse` already done. `yarn build` (`tsc`) and `yarn worker:build` now include `scoreImportWorker`.
- Mount: `src/infrastructure/web/server.ts:13` `app.use('/api/certification-scores', scoreImportRoutes)` **before** `certificationScoreRoutes` to avoid `/:id` shadowing `/import`.

---

## 7) Changelog (all breaking since groupName)

* `schema.ts:76` — `exam_submissions.group_number varchar(50) nullable` + `IStudentRepository.findByStudentId` (case-insensitive)
* `worker/scoreImportQueue.ts` + `worker/scoreImportWorker.ts` + `worker/index.ts` + `worker/main.ts` — `Queue('score-import')`/`Worker('score-import')` + `QueueEvents`, per-`examId` lock `import:lock:<examId>`
* `use-cases/certification/ScoreImportService.ts` — `validateAndEnqueue` (NIM required, header classification, `exceljs`/`csv-parse`, 5 MB, warnings)
* `use-cases/certification/certificateComputation.ts` — `SectionScoreInput.title?`, case-insensitive `overridesLower` + `additionalScore` lookup, legacy id fallback
* `interface-adapters/controllers/ScoreImportController.ts` + `infrastructure/web/routes/scoreImportRoutes.ts` + `middleware/scoreImportUploadMiddleware.ts` — `POST /import`, `GET /:importId/progress`, `GET /:importId/stream` SSE, strict camelCase, `409` per examId
* `interface-adapters/controllers/CertificationScoreController.ts` — `additionalScore`/`examScoreOverride`/`examSubmissionId` strict camelCase, `GET ?examId` (was `examSubmissionId`) with latest-per-user dedup, `findByExamId` added
* `interface-adapters/controllers/ExamSubmissionController.ts` — `start` requires `group_number`/`study_program`
* `infrastructure/web/middleware/errorHandler.ts` — `LIMIT_FILE_SIZE 413`, `Invalid file type`, `NIM column`, `Import already in progress 409`

---

## 8) QA Checklist

- [ ] Excel with `NIM,Reading,Listening,class_speaking_score,Unknown` (4 rows, one bad NIM) → `202` warnings `UnknownColumn`, progress `success 3 failed 1`, SSE emits `progress` then `completed`, DB `Reading:85` etc for valid NIMs, `NULL`/`-`/`0` clears single key, empty skip preserves.
- [ ] CSV with lower-case headers `nim,reading` → `202` (case-insensitive).
- [ ] Second upload same `examId` while active → `409`.
- [ ] `GET /certification-scores?examId=<uuid>` returns one row per user (latest), `GET` without filter deduped across all exams, legacy `?exam_submission_id` → `400`.
- [ ] `PATCH` with `examScoreOverride:{"reading":77}` → `200` case-insensitive, stored as `"reading"`.
