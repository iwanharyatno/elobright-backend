# Frontend Implementation Guide — Breaking Changes: `startExam` + Enriched `certification-scores`

> **Version**: `2026-08-27` · Backend `elobright-backend` · Migrations `0018_keen_cannonball.sql`

This guide covers **frontend-required changes** for three backend updates:
1. `POST /api/exam-sessions/start` now **requires** `group_number` + `study_program`
2. `GET /api/certification-scores` now **enriched** with `group_number` / `degree_program`
3. `PATCH /api/certification-scores/:id` `exam_score_override` now **keyed by Section Name** (like `additional_score`), not `sectionId` uuid — and both admin use-cases now share the single `computeCertificateScore` with consistent inputs.

`docs/assessment-flow.md` / `docs/collection.json` still show the old `start` payload — do not use them until regenerated.

---

## 0) TL;DR

| Endpoint | Before | After | Action |
|---|---|---|---|
| `POST /api/exam-sessions/start` | `{userId, examId, timezone?}` | `{userId, examId, group_number, study_program, timezone?}` | Add 2 required inputs. Old calls → `400`. |
| `GET /api/certification-scores` | `CertificationScoreWithUser` without group/program, filter `?examSubmissionId` | `+ groupNumber + degreeProgram` (`string \| null`, camelCase only), filter now `?examId` and returns **latest per user per exam** (deduplicated) | Render 2 new columns + update filter param. `?examSubmissionId` → `400`. |
| `PATCH /api/certification-scores/:id` `exam_score_override` | `Record<sectionId uuid, 0..100>` | `Record<sectionTitle string, 0..100>` (case-insensitive, `title ?? id` fallback, key displayed as sent) + strict camelCase payload `additionalScore`/`examScoreOverride`/`examSubmissionId` | Send **titles**, not uuids. Invalid title → `400 Unknown section name`. |

Deploy: `yarn db:migrate` (adds `exam_submissions.group_number varchar(50) nullable`) → backend → frontend.

---

## 1) `POST /api/exam-sessions/start`

### 1.1 Contract

```http
POST /api/exam-sessions/start
Authorization: Bearer <JWT>  # ROLE_USER
Content-Type: application/json
{
  "userId": 334,
  "examId": "11111111-0000-4000-8000-000000000001",
  "timezone": "Asia/Jakarta",          // optional
  "group_number": "A1",                // required, trim min1 max50
  "study_program": "Computer Science" // required, trim min1 max255
}
```

*DB*: `exam_submissions.group_number varchar(50) nullable` (`schema.ts:76`). API: `z.string().trim().min(1)` in `ExamSubmissionController.ts:12` — required at API, nullable in DB for legacy rows.

### 1.2 Persistence rules

- `group_number` → `exam_submissions.group_number` **on creation only**. `409 Ongoing session already exists` returns existing `session.groupNumber` and **does not overwrite** with the new value.
- `study_program` → `students.degree_program` (`schema.ts:25`) **only if `students` row exists** (`ManageExamSessions.ts:94` does `findByUserId` → `updateDegreeProgram`, else ignored). `type: "student"` users have a row, `type: "user"` do not — value is silently dropped. Also not refreshed on `409`.

### 1.3 Status

| Code | When | Body |
|---|---|---|
| `201` | Created | `{message:"Exam started", session:{id, groupNumber:"A1", currentSectionSession:{endTimeLimit,endTimeLocale}}}` |
| `400` | Missing/empty `group_number`/`study_program` | `{error:"Validation Error", details:[{path:["group_number"]}]}` via `errorHandler.ts` |
| `401` | No/invalid token | `{error:"Unauthorized"}` |
| `403` | `isOnce=true` already attempted | `{message:"Exam can only be taken once"}` |
| `404` | exam not found | `{message:"Exam not found"}` |
| `409` | Ongoing exists | `{message:"Ongoing session already exists", session, checkpoint}` — rehydrate, don’t retry with different group/study |

### 1.4 Frontend snippet

```ts
export type StartExamPayload = {
  userId:number; examId:string;
  group_number:string; study_program:string; timezone?:string;
};
export async function startExam(p:StartExamPayload, token:string){
  const r=await fetch('/api/exam-sessions/start',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(p)});
  if(r.status===400){ const {details}=await r.json(); throw new ValidationError(details); }
  if(r.status===409){ const {session}=await r.json(); return {resumed:true, session}; }
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}
```

Zod + React Hook Form: `group_number: z.string().trim().min(1).max(50)`, `study_program: z.string().trim().min(1).max(255)`.

Curl:

```bash
curl -X POST http://localhost:3000/api/exam-sessions/start \
 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
 -d '{"userId":334,"examId":"11111111-0000-4000-8000-000000000001","group_number":"A1","study_program":"Computer Science"}'
```

---

## 2) `GET /api/certification-scores` — Filter by `examId`, Latest per User

```http
GET /api/certification-scores
GET /api/certification-scores?examId=<uuid>
Authorization: Bearer <JWT> # ROLE_ADMIN
```

Returns `CertificationScoreWithUser[]` (`entities/CertificationScore.ts:27`). Now **enriched** in `ManageCertificationScores.ts:95` — **camelCase only** and **deduplicated to latest *finished* submission per user per exam**:

* **Without query**: returns latest `certification_score` per `(userId, examId)` across all exams, **only for submissions with `status` in `('submitted','finished','finished-late')`** (ignores `ongoing`). If a user has 3 submissions for same exam, only the one with max `startedAt` among finished is returned. Missing `exam_submissions` rows are kept as-is (`no-sub-<id>` / `ongoing-<id>` keys).
* **With `?examId=<uuid>`**: filters via `findByExamId` (now `WHERE examId=? AND status IN ('submitted','finished','finished-late')`) then per `userId` picks the submission with max `startedAt` (tie `submittedAt`), then fetches its `certification_score`. If no finished submissions for that `examId` → `[]`. Legacy `?examSubmissionId` / `?exam_submission_id` now returns `400 {error:"Use examId (camelCase) query param"}`.

```ts
{
  id, userId, examSubmissionId, additionalScore, examScoreOverride,
  user:{id,email,fullName,role,phoneNumber},
  exam:{id,title,type,isOnce},
  student?:{id,studentId,degreeProgram},
  scores:[{sectionId,sectionName,correctPoints,fullPoints,scaledScore}],
  overrides:[{sectionId,sectionName,overriddenScore}],
  originalExamScore, totalScore,
  groupNumber: string|null, // from latest exam_submissions via examId
  degreeProgram: string|null // from students via userId
}
```

- `groupNumber` `null` for legacy rows or missing submission.
- `degreeProgram` `null` for non-student users (no `students` row).

```ts
<td>{row.groupNumber ?? '-'}</td>
<td>{row.degreeProgram ?? row.student?.degreeProgram ?? '-'}</td>
```

Filter examples:

```ts
// All exams, latest per user per exam
fetch(`/api/certification-scores`, {headers:{Authorization:`Bearer ${t}`}})
// Single exam, latest per user for that exam
fetch(`/api/certification-scores?examId=${examId}`, {headers:{Authorization:`Bearer ${t}`}})
```

---

## 3) `PATCH /api/certification-scores/:id` — `exam_score_override` Now by Section Name

### 3.1 Why changed?

Previously overrides were `Record<sectionId uuid, score>`. Frontend had to map section ids, which are opaque. `additional_score` already uses human `scoreName` as key (`class_speaking_score`). For consistency and UX, overrides now use **Section Name** (`exam_sections.title`) as key, just like `additional_score`. Both admin flows (`ManageCertificate` PDF generation and `ManageCertificationScores` listing) now call the **single** `computeCertificateScore` in `certificateComputation.ts` with **identical** inputs: `sections` (with `title`), `weights`, `overrides` (by name), `additionalScore`, `additionalConfigs` (from `DrizzleCertificationAdditionalScoreRepository.findAll()`). Previously `ManageCertificationScores` passed `additionalConfigs: []` — now fixed to fetch real configs, so `finalScore` is consistent between PDF and table.

### 3.2 Contract — **Strict camelCase** (per second revision)

```http
PATCH /api/certification-scores/:id
Authorization: Bearer <JWT> # ROLE_ADMIN
Content-Type: application/json
{
  "additionalScore": { "class_speaking_score": 95 }, // optional, keys are scoreName values (case-insensitive lookup, displayed as sent)
  "examScoreOverride": { "Reading": 85, "Listening": 90 } // optional, nullable to clear, keys = Section Name (title) NOT uuid, case-insensitive, displayed as sent
}
```

- `additionalScore`: `Record<string, 0..100>` — validated **case-insensitively** against `certification_additional_scores.score_name` (e.g. `"Class_Speaking_Score"` matches `"class_speaking_score"`). Unknown key → `400 {error:"Unknown additional score name: <key>"}`.
- `examScoreOverride`: `Record<string, 0..100> | null` — validated **case-insensitively** in `CertificationScoreController.ts:8` as `z.record(z.string().min(1), z.number().min(0).max(100)).nullable()` and in `ManageCertificationScores.ts:141` against **titles of the exam that the certification belongs to**: `validLower = Set(examSections.map(s => (s.title ?? s.id).toLowerCase()))`. Lookup is case-insensitive, display preserves original casing (e.g. `"reading"` matches `"Reading"`). If `title` is `null`, fallback `id` is valid. Unknown title → `400 {error:"Unknown section name: <key>"}`.
- To **clear** overrides: `{ "examScoreOverride": null }`.

Stored JSON in `certification_score.exam_score_override` is now name-keyed, e.g. `{"Reading":85}` (case preserved as sent). **All future payload/response fields are strict camelCase** — older `additional_score`/`exam_score_override`/`exam_submission_id` snake_case is no longer accepted for this controller (other controllers keep their existing snake_case).

### 3.3 Computation (`certificateComputation.ts`)

- `SectionScoreInput` now `{ examSectionId, title?: string|null, totalScore, maxPoints }`.
- `computeCertificateScore` derives `overrideKey = section.title ?? section.examSectionId` and uses **case-insensitive** lookup (`Map` of lower-cased keys, display preserves original). It checks **both** legacy id and new name (title precedence) and preserves original casing:
  ```ts
  overridesLower = Map(lower(overrides keys) → value)
  hasTitleOverride = overridesLower.has(lower(overrideKey))
  hasIdOverride = overridesLower.has(lower(id))
  ```
  Additional score lookup is also case-insensitive (`config.scoreName.toLowerCase() === key.toLowerCase()`). Keys are stored/displayed as sent.

- Effective weights logic unchanged (`allocateEffectiveWeights`).

- Both `ManageCertificate.ts:79` (now includes `title: s.title ?? null` in `sections`) and `ManageCertificationScores.ts:49` (same) plus `additionalConfigs` from `additionalScoreRepository.findAll()` now call `computeCertificateScore` identically — PDF and list show same `originalExamScore`/`totalScore`/`overrides`.

### 3.4 Examples — **camelCase payload**

```bash
# Success — override Reading to 85 (Listening stays computed)
curl -X PATCH http://localhost:3000/api/certification-scores/12b5e730-7dfb-467d-8200-ea238d4ea6ef \
 -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
 -d '{"examScoreOverride":{"Reading":85}}'
# → 200 {message:"Certification score updated", score:{examScoreOverride:{"Reading":85}}}

# With additionalScore (also camelCase field, inner keys are scoreName values)
curl -X PATCH ... -d '{"additionalScore":{"class_speaking_score":95},"examScoreOverride":{"Reading":85}}'

# Legacy uuid key now fails when title exists
curl -X PATCH ... -d '{"examScoreOverride":{"22222222-0000-4000-8000-000000000001":90}}'
# → 400 {error:"Unknown section name: 22222222-0000-4000-8000-000000000001"}

# Invalid section name
curl -X PATCH ... -d '{"examScoreOverride":{"INVALID":90}}'
# → 400 {error:"Unknown section name: INVALID"}

# Clear
curl -X PATCH ... -d '{"examScoreOverride":null}'

# Verify — note query param now examId (latest per user for that exam)
curl "http://localhost:3000/api/certification-scores?examId=11111111-0000-4000-8000-000000000001" \
 -H "Authorization: Bearer $ADMIN_TOKEN"
# → [{ originalExamScore:25.5, scores:[...], overrides:[{sectionName:"Reading",overriddenScore:85}], groupNumber:"A1" }, ...] // one per user, latest submission

# Blast email — also camelCase now (still by examSubmissionId, not examId)
curl -X POST http://localhost:3000/api/certification-scores/blast-email \
 -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
 -d '{"examSubmissionId":"f703cb02-f704-4384-80df-5618df17b615"}'
```

Frontend:

```ts
// Fetch sections for the exam to get titles
const sections = await fetchSections(examId); // [{id,title}]
const sectionTitles = sections.map(s=>s.title ?? s.id);

// Build override payload from form keyed by title — strict camelCase field
const examScoreOverride: Record<string,number> = {};
for(const [title, score] of Object.entries(formOverrides)){
  if(score!=null) examScoreOverride[title]=score;
}
await fetch(`/api/certification-scores/${certId}`,{
  method:'PATCH',
  headers:{'Content-Type':'application/json',Authorization:`Bearer ${adminToken}`},
  body:JSON.stringify({ examScoreOverride }) // or { additionalScore, examScoreOverride }
});

// Filtered fetch — camelCase examId, returns latest per user for that exam
fetch(`/api/certification-scores?examId=${examId}`, {headers:{Authorization:`Bearer ${t}`}})
```

// Render breakdown: scores keeps computed, overrides shows replaced
// certificateComputation returns examSections with overridden flag
```

**Do not** send uuids — send `exam_sections.title` exactly (trimmed, case-insensitive lookup but preserve casing as sent). If a section has `title: null` (legacy), send its `id` as key — valid set is `title ?? id` (case-insensitive).

### 3.5 Frontend Checklist

- [ ] Update admin “Edit Certification Score” form: populate override inputs **by section title**, not id. Fetch `GET /api/exam-sections/exam/:examId` to get titles, then map.
  - [ ] Validation: before PATCH, ensure every key in `examScoreOverride` exists in `sections.map(s=>s.title ?? s.id)` (case-insensitive), else show inline error.
  - [ ] After PATCH, re-fetch `GET /api/certification-scores?examId=${examId}` (or unfiltered) to refresh `originalExamScore`/`overrides`/`scores` — now deduplicated to latest per user.
- [ ] PDF (`GET /:id/download`) now reflects same weighted score as table — no extra FE change, but QA should compare.

---

## 4) Types

```ts
export type CertificationScoreEnriched = {
  id:string; userId:number; examSubmissionId:string;
  additionalScore: Record<string,number>|null; // keys case-insensitive, displayed as sent
  examScoreOverride: Record<string,number>|null; // keys = Section Name (title), case-insensitive, displayed as sent
  groupNumber:string|null;
  degreeProgram:string|null;
  originalExamScore?:number; totalScore?:number;
  user?:{id:number;email:string;fullName:string;role:string};
  exam?:{id:string;title:string};
  student?:{degreeProgram:string|null};
  scores?:{sectionId:string;sectionName:string|null;correctPoints:number;fullPoints:number;scaledScore:number}[];
  overrides?:{sectionId:string;sectionName:string|null;overriddenScore:number}[];
};
```

---

## 5) Migration / Deploy

- DB: `0018_keen_cannonball.sql` (`exam_submissions.group_number`). No migration for `exam_score_override` — JSON keys will be migrated lazily on next PATCH (old uuid keys remain readable via fallback but new writes are name-keyed). Optionally run manual `UPDATE certification_score SET exam_score_override = ...` to convert legacy uuid → title if needed.
- Backend: `yarn build` passes (`tsc --noEmit` ok), `jest --runInBand` 15 suites 92 tests pass.
- Frontend: update `docs/collection.json` `Update Certification Score` example to use titles.

---

## 6) Changelog

* `schema.ts:76` — `exam_submissions.group_number`
* `entities/ExamSubmission.ts:8` — `groupNumber?`
* `repositories/IStudentRepository.ts:6` — `updateDegreeProgram`
* `use-cases/exam/ManageExamSessions.ts:94` — writes `group_number` + conditional `students.degree_program`
* `controllers/ExamSubmissionController.ts:12` — `startSchema` requires both
* `entities/CertificationScore.ts:27` + `use-cases/certification/ManageCertificationScores.ts:95` — `group_number`/`degree_program` enrichment
* `use-cases/certification/certificateComputation.ts:6` — `SectionScoreInput.title`, override by `title ?? id` with legacy fallback, `additionalConfigs` supplied
* `use-cases/certification/ManageCertificate.ts:79` + `ManageCertificationScores.ts:49` — include `title` in sections, fetch real `additionalConfigs`
* `controllers/CertificationScoreController.ts:8` — `additionalScore`/`examScoreOverride`/`examSubmissionId` strict camelCase (`z.record(z.string().min(1), ...).nullable()`), `400 Unknown section name` (case-insensitive)
* `controllers/CertificationScoreController.ts:22` — `GET /api/certification-scores?examId` (was `examSubmissionId`), strict camelCase, validates `uuid`, rejects legacy `exam_submission_id`/`examSubmissionId` with `400 Use examId`
* `repositories/IExamSubmissionRepository.ts:9` + `DrizzleExamSubmissionRepository.ts:30` — added `findByExamId(examId)` with `WHERE status IN ('submitted','finished','finished-late')`
* `use-cases/certification/ManageCertificationScores.ts:90` — `getAll(examId?)` now filters by `examId` and deduplicates to **latest finished per user per exam** (`status` filtered → `startedAt` desc), no-filter also deduped with status check; `groupNumber`/`degreeProgram` retained
