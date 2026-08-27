# Panduan Implementasi Frontend — Semua Breaking Changes + Import Nilai (Disposable)

> **Versi**: `2026-08-28` · Backend `elobright-backend` · Migrasi `0018_keen_cannonball.sql`.

Panduan tunggal yang menggabungkan **semua breaking change** sejak penambahan `groupName` dan fitur **Import Nilai Excel/CSV** baru.

---

## 0) Ringkasan — Wajib Ubah Sebelum Deploy

| Area | Sebelum | Sesudah | Aksi FE |
|---|---|---|---|
| `POST /api/exam-sessions/start` | `{userId, examId, timezone?}` | `{userId, examId, group_number, study_program, timezone?}` (`group_number` `varchar(50)` trim min1, `study_program` trim min1 max255) | Tambah 2 input wajib. Call lama → `400`. |
| `GET /api/certification-scores` | `?examSubmissionId` mengembalikan semua baris, tanpa group/program | `?examId` mengembalikan **latest per user per exam** (dedup `startedAt` desc), response `+ groupNumber + degreeProgram` (camelCase saja, `string\|null`) | Ganti param filter, tampilkan 2 kolom baru. `?examSubmissionId` lama → `400 Use examId`. |
| `PATCH /api/certification-scores/:id` | `examScoreOverride: Record<uuid,0..100>` (`additional_score` snake) | `examScoreOverride: Record<sectionTitle,0..100>` case-insensitive, `additionalScore` (keduanya strict camelCase), `null` untuk clear | Kirim **judul** bukan uuid, pakai camelCase. |
| `POST /api/certification-scores/blast-email` | `{exam_submission_id}` snake | `{examSubmissionId}` camelCase strict | Ganti field. |
| **BARU** `POST /api/certification-scores/import` | — | `multipart/form-data` `examId` + `file` (xlsx/xls/csv, 5 MB, kolom `NIM` wajib) → `202 {importId,totalRows,warnings}` atau `400/409` | Buat UI admin import, validasi sebelum queue. |
| **BARU** `GET /api/certification-scores/import/:importId/progress` | — | polling `{state,progress:{percent,processed,total,success,failed,warnings,errors},returnvalue}` | Fallback polling. |
| **BARU** `GET /api/certification-scores/import/:importId/stream` | — | `SSE` `text/event-stream` `data: {event, progress}` via `QueueEvents` | Real-time progress. |
| `exam_submissions` DB | tanpa group | `group_number varchar(50) nullable` | `yarn db:migrate` dulu. |

**Aturan strict camelCase** — semua field *baru* `certification-scores` (`additionalScore`, `examScoreOverride`, `examSubmissionId`, `examId`, `groupNumber`, `degreeProgram`) **strict camelCase** (`z.object(...).strict()` → unknown key `400 {code:"unrecognized_keys"}`). Controller lain (`exam-sessions/start` tetap `group_number`/`study_program` snake) **tidak** diubah.

Deploy: `yarn db:migrate` → `yarn build` + `yarn worker:build` → deploy `api` + `worker` (`scoreImportWorker` bersama `emailWorker`, shared `redis:7`) → frontend.

---

## 1) `POST /api/exam-sessions/start` — Wajib `group_number` + `study_program`

```http
POST /api/exam-sessions/start
Authorization: Bearer <JWT> # ROLE_USER
Content-Type: application/json
{
  "userId": 334,
  "examId": "11111111-0000-4000-8000-000000000001",
  "timezone": "Asia/Jakarta",
  "group_number": "A1",                // wajib trim min1 max50
  "study_program": "Informatika"       // wajib trim min1 max255
}
```

*DB* `exam_submissions.group_number varchar(50) nullable` (`schema.ts:76`).  
*Persistence*: `group_number` hanya saat buat sesi baru (`409` tidak menimpa); `study_program` → `students.degree_program` hanya jika `students` ada, else diabaikan, juga tidak di-refresh pada `409`.

Status sama seperti guide sebelumnya: `201` sukses, `400` validasi, `409` ongoing → rehydrate.

---

## 2) `GET /api/certification-scores` — `examId` + Latest per User

```http
GET /api/certification-scores
GET /api/certification-scores?examId=<uuid>
Authorization: Bearer <JWT> # ROLE_ADMIN (certificationScoreRoutes.ts)
```

*Controller* `CertificationScoreController.ts:22` kini: `?examId` (`z.string().uuid()`), menolak legacy `?exam_submission_id`/`?examSubmissionId` dengan `400 {error:"Use examId (camelCase) query param"}`.  
*Use-case* `ManageCertificationScores.ts:90` `getAll(examId?)`:
- **dengan `examId`**: `findByExamId(examId)` → group by `userId` pilih `max(startedAt)` (tie `submittedAt`) → `findByExamSubmissionId` untuk `latestIds` → deduplicated.
- **tanpa**: `findAll()` → `findById` untuk tiap `examSubmissionId` → group by `${userId}-${examId}` pilih latest, `no-sub-<id>` untuk submission hilang.

```ts
{
  id, userId, examSubmissionId, additionalScore, examScoreOverride,
  user, exam, student, scores, overrides, originalExamScore, totalScore,
  groupNumber: string|null, // dari latest exam_submissions untuk examId
  degreeProgram: string|null
}
```

```ts
// Semua, dedup
fetch(`/api/certification-scores`, {headers:{Authorization:`Bearer ${t}`}})
// Filter, latest per user untuk exam itu
fetch(`/api/certification-scores?examId=${examId}`, {headers:{Authorization:`Bearer ${t}`}})
```

---

## 3) `PATCH /api/certification-scores/:id` — By Section Name

```http
PATCH /api/certification-scores/:id
Authorization: Bearer <JWT> # ROLE_ADMIN
Content-Type: application/json
{
  "additionalScore": { "class_speaking_score": 95 },
  "examScoreOverride": { "Reading": 85 } // nullable untuk clear
}
```

Validasi case-insensitive (`toLowerCase()`), `title ?? id` fallback, `strict()` menolak snake_case lama. Komputasi `certificateComputation.ts` case-insensitive, display preserve casing asli.

---

## 4) **BARU** Import Nilai — Excel/CSV via Queue + SSE

### 4.1 Gambaran

Queue/worker baru `scoreImportQueue` (`Queue('score-import')`) + `scoreImportWorker` (`Worker('score-import', concurrency:1)`) di `src/worker/scoreImportQueue.ts`/`scoreImportWorker.ts`, shared `ioredis`, `QueueEvents('score-import')`, Redis lock `import:lock:<examId>` per-`examId` (sesuai konfirmasi), `src/worker/main.ts` menjalankan keduanya, `docker-compose.yml` `worker` sudah cover.

### 4.2 Endpoint `POST /api/certification-scores/import`

```http
POST /api/certification-scores/import
Authorization: Bearer <JWT> # ROLE_ADMIN (scoreImportRoutes.ts)
Content-Type: multipart/form-data
Fields:
  examId: string (uuid, required)
  file: File (required, single('file'), xlsx|xls|csv, 5MB, 1 file)
Middleware: authMiddleware(ROLE_ADMIN) → scoreImportUploadMiddleware (multer diskStorage ke uploads/tmp, fileFilter mime/ext, limits) → ScoreImportController.importScores → ScoreImportService.validateAndEnqueue
```

**Validasi sebelum enqueue** (`ScoreImportService.ts`):
1. `examId` ada (`examRepository.findById`) else `404 Exam not found` + unlink.
2. Guard per-`examId`: `isImportActiveForExam(examId)` (`getActive`+`getWaiting`+`getDelayed` cek `examId`) atau `redis SET import:lock:<examId> NX EX 3600` → jika aktif → `409 {error:"Import already in progress for this exam"}` + unlink.
3. Baca header via `exceljs` (`workbook.xlsx.readFile`) atau `csv-parse/sync` (`parse(content, skip_empty_lines, trim)`), ambil `headers: string[]` (trim) dan `totalRows`.
4. **Spec kolom** — hanya `NIM` wajib (case-insensitive `nim`), else `400 NIM column is required`:
   - Header lain case-insensitive diklasifikasi: `exam_sections.title ?? id` (untuk `examId` yang dikirim) → tipe `section` else `certification_additional_scores.scoreName` → `additional` else `unknown`.
   - `NIM` → `students.studentId` via baru `IStudentRepository.findByStudentId` (`lower(studentId)=lower(?)`).
   - Urutan: `section` → `additional` → `unknown`; unknown → `warnings: ["Unknown columns will be ignored: UnknownColumn"]`.
   - Jika tidak ada kolom data valid → warning `No known section...`.
   - Nilai sel: `isEmptyCell` (`null`/`""` trim) → **skip** (preserve existing), `isExplicitClear("NULL" case-insensitive, "-", "0" string, number 0)` → **clear column-wise** (hapus key itu saja dari `additionalScore`/`examScoreOverride`, bukan whole column; jika setelah hapus kosong → `examScoreOverride: null`, `additionalScore: {}`), else parse `Number(...replace(',','.'))` validasi `0..100` → jika invalid → `rowWarnings`.
5. Kembalikan `warnings` + enqueue `addScoreImportJob({importId:uuid, filePath, examId, uploadedBy, originalName})`, lock tetap sampai worker selesai.

**Response** `202`:

```json
{ "message":"Import queued", "importId":"c4a66185-...", "totalRows":4, "warnings":["Unknown columns will be ignored: UnknownColumn"] }
```

Error: `400 NIM column is required` / `Exam not found` / `Failed to read file` / `400 Invalid file type` / `413 File too large` / `409 Import already in progress`.

Curl:

```bash
curl -X POST http://localhost:3000/api/certification-scores/import \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "examId=11111111-0000-4000-8000-000000000001" \
  -F "file=@scores.xlsx;type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
# → 202 {importId, totalRows, warnings}

# Tanpa NIM
# → 400 {error:"NIM column is required"}

# Sementara aktif untuk examId sama
# → 409 {error:"Import already in progress for this exam"}
```

**Penyimpanan**: `multer` ke `uploads/tmp/import-<ts>-<rand>.xlsx` (dibuat jika belum ada), worker `finally` `unlink` setelah proses atau gagal. `.gitignore` sudah `uploads/`.

### 4.3 Worker Processing (`scoreImportWorker.ts:80`)

Untuk `examId` fetch `examSections` + `additionalConfigs` sekali, bangun `sectionMapLower` (`(title ?? id).toLowerCase()`) dan `additionalMapLower`, baca workbook, cari `nimIndex` case-insensitive `nim`, klasifikasi kolom, lalu per baris `rowNum = r+2`:

1. `NIM` trim — kosong → `failed` `NIM is empty`.
2. `findByStudentId(nim)` → `userId`, tidak ada → `failed Student not found`.
3. `findByUserAndExam(userId, examId)` → sort `startedAt desc` → `latest` terbaru. Tidak ada → `failed No exam submission`.
4. `findByExamSubmissionId(latest.id)` → `cert`, tidak ada → `failed Certification score not found`.
5. Bangun `newAdditional` (copy `cert.additionalScore || {}`) dan `newOverride` (copy `cert.examScoreOverride || {}`), iterasi kolom:
   - `isEmptyCell` → skip.
   - `isExplicitClear` → hapus key itu saja case-insensitive dari `newAdditional`/`newOverride` (mis. `Reading: NULL` hapus hanya `Reading`, bukan whole), `hasChange=true`.
   - Else parse `0..100` → jika invalid → `rowWarnings`.
   - Else untuk `section`: `existingKey = Object.keys(newOverride).find(k=>k.toLowerCase()===headerLower)` → `delete existingKey` lalu `newOverride[headerOriginal]=num` (preserve header case), untuk `additional` serupa dengan `additionalMapLower`.
6. Validasi merged map case-insensitive vs `validAdditionalLower`/`validSectionLower`, jika invalid → `failed`.
7. Update DB (sama seperti `PATCH`): jika `hasAdditionalChange` → `updateAdditionalScore(cert.id, newAdditional)` (kosong → `{}`), jika `hasOverrideChange` → `updateExamScoreOverride(cert.id, Object.keys(newOverride).length ? newOverride : null)`.
8. `success++` else `failed++`, kumpulkan `rowWarnings` ke global `warnings`, `errors: RowResult[]` (5 terakhir). Tiap baris `await job.updateProgress({percent:Math.round((r+1)/total*100), processed:r+1, total, success, failed, warnings, errors: errors.slice(-5)})`.

Selesai: `unlink(filePath)`, `redis.del('import:lock:<examId>')`, return `{total,success,failed,warnings,errors}` sebagai `job.returnvalue`.

**Case-insensitive display**: Semua lookup `toLowerCase()`, tapi key disimpan preserve `headerOriginal` casing.

### 4.4 Endpoint Progress

```http
GET /api/certification-scores/import/:importId/progress
Authorization: Bearer <JWT> # ROLE_ADMIN
→ 200 {importId, state:"active"|"waiting"|"completed"|"failed", progress:{percent,processed,total,success,failed,warnings,errors}, returnvalue:{total,success,failed,warnings,errors}, failedReason}
→ 404 {error:"Import job not found"}

GET /api/certification-scores/import/:importId/stream
Authorization: Bearer <JWT> # ROLE_ADMIN
Accept: text/event-stream
→ 200 text/event-stream
data: {"event":"init","importId","state","progress":...}
data: {"event":"progress","importId","data":{percent,...}}
data: {"event":"completed","importId","returnvalue":{total,success,failed,warnings,errors}}
data: {"event":"failed","importId","failedReason":...}
```

*Controller* `ScoreImportController.ts:32` `streamProgress` verifies `getScoreImportJob(importId)` → `404` jika tidak ada, else `writeHead 200 text/event-stream`, kirim `init`, subscribe `scoreImportQueueEvents.on('progress'|'completed'|'failed')` untuk `importId` itu, plus polling fallback tiap 2s (`getJob` → `getState`/`progress`), cleanup `req.on('close')`.

`QueueEvents` berbagi koneksi `ioredis` sama (`maxRetriesPerRequest:null`).

**Akhir upload**: `returnvalue.total / success / failed` sesuai permintaan — `success` = baris berhasil update, `failed` = NIM mismatch, tidak ada submission, tidak ada cert, validasi. `continue` per baris, satu `NIM` buruk tidak abort batch.

Frontend polling fallback:

```ts
const {importId,warnings}=await fetch('/api/certification-scores/import',{method:'POST', headers:{Authorization:`Bearer ${t}`}, body:form}).then(r=>r.json());
const poll=setInterval(async()=>{
  const {state, progress, returnvalue}=await fetch(`/api/certification-scores/import/${importId}/progress`,{headers:{Authorization:`Bearer ${t}`}}).then(r=>r.json());
  updateProgress(progress);
  if(state==='completed'){clearInterval(poll); showResult(returnvalue);} // {total,success,failed}
},1000);
// Atau SSE
const es=new EventSource(`/api/certification-scores/import/${importId}/stream`, {headers:{Authorization:`Bearer ${t}`}}); // pakai fetch SSE polyfill karena EventSource tidak support header
```

**Concurrency**: Upload kedua dengan `examId` sama saat `active`/`waiting` → `409`. `examId` berbeda boleh konkuren.

---

## 5) Tipe Strict camelCase Baru

```ts
// POST /import (multipart)
type ScoreImportRequest = { examId: string; file: File };
// 202
type ScoreImportQueued = { message:"Import queued"; importId:string; totalRows:number; warnings:string[] };
// Progress SSE/polling
type ScoreImportProgress = {
  percent:number; processed:number; total:number;
  success:number; failed:number;
  warnings:string[]; errors:{row:number; nim:string|null; success:boolean; error?:string; warnings?:string[]}[];
  state?: "active"|"completed"|"failed"|"waiting";
  returnvalue?: {total:number; success:number; failed:number; warnings:string[]; errors: any[]};
};
```

---

## 6) Migrasi / Deploy

- Tidak ada tabel baru — reuse `certification_score`. `yarn db:migrate` sudah cover `group_number`. `uploads/tmp` auto-dibuat oleh `scoreImportUploadMiddleware`.
- Env tetap `REDIS_HOST/PORT/PASSWORD`. Worker `src/worker/main.ts` kini menjalankan `emailWorker` + `scoreImportWorker` dan menutup keduanya `scoreImportQueueEvents` + `scoreImportQueue` pada `SIGTERM`.
- Install `yarn add exceljs csv-parse` sudah. `yarn build` (`tsc`) dan `yarn worker:build` sudah include `scoreImportWorker`.
- Mount: `src/infrastructure/web/server.ts:13` `app.use('/api/certification-scores', scoreImportRoutes)` **sebelum** `certificationScoreRoutes` agar `/import` tidak tertangkap `/:id`.

---

## 7) Changelog Sejak groupName

* `schema.ts:76` — `exam_submissions.group_number varchar(50) nullable` + `IStudentRepository.findByStudentId`
* `worker/scoreImportQueue.ts` + `worker/scoreImportWorker.ts` + `worker/index.ts` + `worker/main.ts` — `Queue('score-import')`/`Worker('score-import')` + `QueueEvents`, per-`examId` lock `import:lock:<examId>`
* `use-cases/certification/ScoreImportService.ts` — `validateAndEnqueue` (NIM wajib, klasifikasi header, `exceljs`/`csv-parse`, 5 MB, warnings)
* `use-cases/certification/certificateComputation.ts` — `SectionScoreInput.title?`, case-insensitive `overridesLower` + `additionalScore`
* `interface-adapters/controllers/ScoreImportController.ts` + `routes/scoreImportRoutes.ts` + `middleware/scoreImportUploadMiddleware.ts` — `POST /import`, `GET /:importId/progress`, `GET /:importId/stream` SSE, strict camelCase, `409` per examId
* `interface-adapters/controllers/CertificationScoreController.ts` — `additionalScore`/`examScoreOverride`/`examSubmissionId` strict camelCase, `GET ?examId` dengan latest-per-user
* `use-cases/certification/ManageCertificationScores.ts` — `getAll(examId?)` dedup latest, `findByExamId` baru
* `infrastructure/web/middleware/errorHandler.ts` — `LIMIT_FILE_SIZE 413`, `Invalid file type`, `NIM column`, `Import already in progress 409`

---

## 8) Checklist QA

- [ ] Excel `NIM,Reading,Listening,class_speaking_score,Unknown` (4 baris, satu NIM salah) → `202` warnings `UnknownColumn`, progress `success 3 failed 1`, SSE `progress` → `completed`, DB `Reading:85` untuk NIM valid, `NULL`/`-`/`0` menghapus key tunggal, empty skip preserve.
- [ ] CSV lower-case `nim,reading` → `202` (case-insensitive).
- [ ] Upload kedua `examId` sama saat aktif → `409`.
- [ ] `GET /certification-scores?examId=<uuid>` mengembalikan satu per user (latest), `?examSubmissionId` lama → `400`.
- [ ] `PATCH` `examScoreOverride:{"reading":77}` → `200` case-insensitive, simpan `"reading"`.
