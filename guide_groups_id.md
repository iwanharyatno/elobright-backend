# Panduan Implementasi Frontend — Breaking Changes: `startExam` + Enrichment `certification-scores`

> **Versi**: `2026-08-27` · Backend `elobright-backend` · Migrasi `0018_keen_cannonball.sql`

Panduan ini untuk **frontend wajib ubah** terkait:
1. `POST /api/exam-sessions/start` kini **wajib** `group_number` + `study_program`
2. `GET /api/certification-scores` kini **diperkaya** dengan `group_number` / `degree_program`
3. `PATCH /api/certification-scores/:id` `exam_score_override` kini **key = Section Name** (seperti `additional_score`), bukan `sectionId` uuid — dan kedua use-case admin kini pakai satu `computeCertificateScore` yang konsisten.

`docs/assessment-flow.md` / `docs/collection.json` masih pakai payload lama — jangan jadi acuan sampai diregenerate.

---

## 0) Ringkasan

| Endpoint | Sebelum | Sesudah | Aksi |
|---|---|---|---|
| `POST /api/exam-sessions/start` | `{userId, examId, timezone?}` | `{userId, examId, group_number, study_program, timezone?}` | Tambah 2 input wajib. Call lama → `400`. |
| `GET /api/certification-scores` | tanpa group/program, filter `?examSubmissionId` | `+ groupNumber + degreeProgram` (`string\|null`, camelCase saja), filter kini `?examId` dan **latest per user per exam** (deduplikasi) | Tampilkan 2 kolom baru + update filter. `?examSubmissionId` → `400`. |
| `PATCH /api/certification-scores/:id` `exam_score_override` | `Record<sectionId uuid, 0..100>` | `Record<sectionTitle string, 0..100>` (case-insensitive, `title ?? id` fallback, key tampil apa adanya) + strict camelCase `additionalScore`/`examScoreOverride`/`examSubmissionId` | Kirim **nama section**, bukan uuid. Nama tidak ada → `400 Unknown section name`. |

Urutan deploy: `yarn db:migrate` → backend → frontend.

---

## 1) `POST /api/exam-sessions/start`

### 1.1 Kontrak

```http
POST /api/exam-sessions/start
Authorization: Bearer <JWT>  # ROLE_USER
Content-Type: application/json
{
  "userId": 334,
  "examId": "11111111-0000-4000-8000-000000000001",
  "timezone": "Asia/Jakarta",
  "group_number": "A1",                // wajib trim min1 max50
  "study_program": "Informatika"       // wajib trim min1 max255
}
```

*DB*: `exam_submissions.group_number varchar(50) nullable` (`schema.ts:76`). API: `z.string().trim().min(1)` di `ExamSubmissionController.ts:12`.

### 1.2 Aturan simpan

- `group_number` → `exam_submissions.group_number` **hanya saat buat sesi baru**. `409 Ongoing session already exists` mengembalikan `groupNumber` lama dan **tidak menimpa**.
- `study_program` → `students.degree_program` **hanya jika baris `students` ada** (`ManageExamSessions.ts:94` `findByUserId` → `updateDegreeProgram`, else diabaikan). User `type:"student"` punya baris, `type:"user"` tidak — diabaikan. Juga tidak di-refresh pada `409`.

### 1.3 Status

| Kode | Kapan | Body |
|---|---|---|
| `201` | Sukses | `{message:"Exam started", session:{groupNumber:"A1"}}` |
| `400` | Kosong/hilang `group_number`/`study_program` | `{error:"Validation Error", details:[{path:["group_number"]}]}` |
| `401` | Tanpa token | `{error:"Unauthorized"}` |
| `403` | `isOnce=true` sudah pernah | `{message:"Exam can only be taken once"}` |
| `404` | exam tidak ada | `{message:"Exam not found"}` |
| `409` | Sudah ongoing | `{message:"Ongoing session already exists", session}` — rehydrate saja |

### 1.4 Snippet

```ts
export async function startExam(p:{userId:number;examId:string;group_number:string;study_program:string;timezone?:string}, token:string){
  const r=await fetch('/api/exam-sessions/start',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(p)});
  if(r.status===400){ const {details}=await r.json(); throw new ValidationError(details); }
  if(r.status===409){ const {session}=await r.json(); return {resumed:true,session}; }
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}
```

Zod: `group_number: z.string().trim().min(1).max(50)`, `study_program: z.string().trim().min(1).max(255)`.

---

## 2) `GET /api/certification-scores` — Filter `examId`, Latest per User

```http
GET /api/certification-scores
GET /api/certification-scores?examId=<uuid>
Authorization: Bearer <JWT> # ROLE_ADMIN
```

Kini `ManageCertificationScores.ts:95` mengembalikan — **camelCase saja** dan **did Eduplikasi ke submission terbaru per user per exam yang sudah selesai**:

* **Tanpa query**: kembalikan latest `certification_score` per `(userId, examId)` di semua exam, **hanya untuk submission dengan `status` di `('submitted','finished','finished-late')`** (abaikan `ongoing`). Jika user punya 3 submission untuk exam sama, hanya yang `startedAt` terbaru di antara yang finished yang dikembalikan. `exam_submissions` hilang tetap via `no-sub-<id>` / `ongoing-<id>`.
* **Dengan `?examId=<uuid>`**: filter via `findByExamId` (kini `WHERE examId=? AND status IN ('submitted','finished','finished-late')`) lalu per `userId` pilih `startedAt` terbaru, lalu ambil `certification_score`. Jika tidak ada submission finished untuk `examId` → `[]`. Legacy `?examSubmissionId` kini → `400`.

```ts
{
  ...score, user, exam, student, scores, overrides, originalExamScore, totalScore,
  groupNumber: string|null, // via latest exam_submissions untuk examId
  degreeProgram: string|null // via students untuk userId
}
```

- `groupNumber` `null` untuk baris lama/hilang.
- `degreeProgram` `null` untuk user non-student.

```tsx
<td>{row.groupNumber ?? '-'}</td>
<td>{row.degreeProgram ?? row.student?.degreeProgram ?? '-'}</td>
```

Contoh filter:

```ts
// Semua exam, latest per user per exam
fetch(`/api/certification-scores`, {headers:{Authorization:`Bearer ${t}`}})
// Satu exam, latest per user untuk exam itu
fetch(`/api/certification-scores?examId=${examId}`, {headers:{Authorization:`Bearer ${t}`}})
```

---

## 3) `PATCH /api/certification-scores/:id` — `exam_score_override` Kini Pakai Nama Section

### 3.1 Kenapa diubah?

Sebelumnya key = `sectionId` uuid yang tidak ramah UI. `additional_score` sudah pakai `scoreName` yang human-readable. Agar konsisten dan UX lebih baik, `exam_score_override` kini pakai **Nama Section** (`exam_sections.title`) sebagai key, sama seperti `additional_score`. Kedua flow admin (`ManageCertificate` untuk PDF dan `ManageCertificationScores` untuk list) kini memanggil **satu** `computeCertificateScore` di `certificateComputation.ts` dengan input **identik**: `sections` (dengan `title`), `weights`, `overrides` (by name), `additionalScore`, `additionalConfigs` (dari `DrizzleCertificationAdditionalScoreRepository.findAll()`). Sebelumnya `ManageCertificationScores` mengirim `additionalConfigs: []` — kini diperbaiki agar `finalScore` konsisten antara PDF dan tabel.

### 3.2 Kontrak — **Strict camelCase**

```http
PATCH /api/certification-scores/:id
Authorization: Bearer <JWT> # ROLE_ADMIN
Content-Type: application/json
{
  "additionalScore": { "class_speaking_score": 95 },
  "examScoreOverride": { "Reading": 85, "Listening": 90 } // key = Section Name (title) BUKAN uuid, case-insensitive, tampil apa adanya, null untuk clear
}
```

- `additionalScore`: `Record<string, 0..100>` — divalidasi **case-insensitive** terhadap `certification_additional_scores.score_name` (mis. `"Class_Speaking_Score"` cocok `"class_speaking_score"`). Unknown → `400 {error:"Unknown additional score name: <key>"}`.
- `examScoreOverride`: `Record<string, 0..100> | null` — divalidasi **case-insensitive** di `CertificationScoreController.ts:8` dan `ManageCertificationScores.ts:141` terhadap **judul exam terkait**: `validLower = Set(examSections.map(s => (s.title ?? s.id).toLowerCase()))`. Pencarian case-insensitive, tampil preserve casing asli (mis. `"reading"` cocok `"Reading"`). Jika `title` `null`, fallback `id` valid. Unknown → `400 {error:"Unknown section name: <key>"}`.
- Untuk **clear**: `{ "examScoreOverride": null }`.

Di DB `certification_score.exam_score_override` kini name-keyed, mis. `{"Reading":85}` (case preserved). **Semua payload/response untuk controller ini strict camelCase** — `additional_score`/`exam_score_override` snake_case lama tidak lagi diterima (controller lain tetap snake_case seperti `group_number`).

### 3.3 Komputasi (`certificateComputation.ts`)

- `SectionScoreInput` kini `{ examSectionId, title?: string|null, totalScore, maxPoints }`.
- `computeCertificateScore` pakai `overrideKey = section.title ?? section.examSectionId` dan **case-insensitive** (`Map` lower-cased, tampil preserve asli):
  ```ts
  overridesLower = Map(lower(overrides keys) → value)
  hasTitleOverride = overridesLower.has(lower(overrideKey))
  hasIdOverride = overridesLower.has(lower(id))
  ```
  Pencarian `additionalScore` juga case-insensitive (`scoreName.toLowerCase() === key.toLowerCase()`). Key disimpan/tampil apa adanya.

- Kedua `ManageCertificate.ts:79` (tambah `title: s.title ?? null`) dan `ManageCertificationScores.ts:49` (sama) plus `additionalConfigs` dari repo kini memanggil `computeCertificateScore` identik — PDF dan list `originalExamScore`/`totalScore` sama.

### 3.4 Contoh — **camelCase payload**

```bash
# Sukses — override Reading jadi 85
curl -X PATCH http://localhost:3000/api/certification-scores/12b5e730-... \
 -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
 -d '{"examScoreOverride":{"Reading":85}}'
# → 200 {message:"Certification score updated", score:{examScoreOverride:{"Reading":85}}}

# Dengan additionalScore (field juga camelCase, inner keys nilai scoreName)
curl -X PATCH ... -d '{"additionalScore":{"class_speaking_score":95},"examScoreOverride":{"Reading":85}}'

# Uuid lama kini gagal bila title ada
curl -X PATCH ... -d '{"examScoreOverride":{"22222222-0000-4000-8000-000000000001":90}}'
# → 400 {error:"Unknown section name: 22222222-0000-4000-8000-000000000001"}

# Nama salah
curl -X PATCH ... -d '{"examScoreOverride":{"INVALID":90}}'
# → 400 {error:"Unknown section name: INVALID"}

# Clear
curl -X PATCH ... -d '{"examScoreOverride":null}'

# Verifikasi — query kini examId (latest per user untuk exam itu)
curl "http://localhost:3000/api/certification-scores?examId=11111111-0000-4000-8000-000000000001" \
 -H "Authorization: Bearer $ADMIN_TOKEN"
# → [{ originalExamScore:25.5, overrides:[{sectionName:"Reading",overriddenScore:85}], groupNumber:"A1" }, ...] // satu per user, latest

# Blast email — masih pakai examSubmissionId (bukan examId), juga camelCase
curl -X POST http://localhost:3000/api/certification-scores/blast-email \
 -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
 -d '{"examSubmissionId":"f703cb02-f704-4384-80df-5618df17b615"}'
```

Frontend:

```ts
const sections = await fetchSections(examId); // [{id,title}]
const sectionTitles = sections.map(s=>s.title ?? s.id);
const examScoreOverride: Record<string,number> = {};
for(const [title, score] of Object.entries(formOverrides)){
  if(score!=null) examScoreOverride[title]=score;
}
await fetch(`/api/certification-scores/${certId}`,{
  method:'PATCH',
  headers:{'Content-Type':'application/json',Authorization:`Bearer ${adminToken}`},
  body:JSON.stringify({ examScoreOverride }) // atau { additionalScore, examScoreOverride }
});

// Filter — camelCase examId, latest per user
fetch(`/api/certification-scores?examId=${examId}`, {headers:{Authorization:`Bearer ${t}`}})
```

**Jangan** kirim uuid — kirim `exam_sections.title` persis (trim, case-insensitive lookup tapi preserve casing). Jika `title: null` (legacy), kirim `id` sebagai key — valid set adalah `title ?? id` (case-insensitive).

### 3.5 Checklist Frontend

- [ ] Form admin “Edit Certification Score” populate input override **by title**, bukan id. Fetch `GET /api/exam-sections/exam/:examId` untuk titles.
- [ ] Validasi sebelum PATCH: setiap key di `examScoreOverride` harus ada di `sections.map(s=>s.title ?? s.id)` (case-insensitive).
- [ ] Setelah PATCH, re-fetch `GET /api/certification-scores?examId=${examId}` (atau tanpa query untuk semua) untuk refresh `originalExamScore`/`overrides` — kini dedup latest per user.
- [ ] PDF (`GET /:id/download`) kini konsisten dengan tabel — QA bandingkan.

---

## 4) Tipe

```ts
// Response sudah strict camelCase; request juga strict camelCase untuk controller ini
export type CertificationScoreEnriched = {
  id:string; userId:number; examSubmissionId:string;
  additionalScore: Record<string,number>|null; // keys = scoreName, case-insensitive, tampil apa adanya
  examScoreOverride: Record<string,number>|null; // keys = Section Name (title), case-insensitive, tampil apa adanya
  groupNumber:string|null;
  degreeProgram:string|null;
};
// PATCH payload: { additionalScore?: Record<string,number>, examScoreOverride?: Record<string,number>|null }
// GET query: ?examId=<uuid> (latest per user per exam) | no query = latest per user per exam across all
// POST blast-email: { examSubmissionId: string } // blast still by submission, not examId
```

---

## 5) Migrasi / Deploy

- DB: `0018_keen_cannonball.sql` (`exam_submissions.group_number`). Tidak ada migrasi untuk `exam_score_override` — JSON key akan migrasi malas pada PATCH berikutnya (uuid lama tetap terbaca via fallback tapi tulis baru name-based). Opsional `UPDATE certification_score SET exam_score_override = ...` untuk konversi manual.
- Backend: `yarn build` lolos (`tsc --noEmit` ok), `jest --runInBand` 15 suites 92 tests pass.

---

## 6) Changelog

* `schema.ts:76` — `exam_submissions.group_number`
* `entities/CertificationScore.ts:27` — `group_number`/`degree_program` enrichment
* `certificateComputation.ts:6` — `SectionScoreInput.title`, override by `title ?? id` + legacy fallback, `additionalConfigs` konsisten
* `ManageCertificate.ts:79` + `ManageCertificationScores.ts:49` — kirim `title` + fetch `additionalConfigs` real
* `controllers/CertificationScoreController.ts:8,22` — `additionalScore`/`examScoreOverride`/`examSubmissionId` strict camelCase, `GET ?examId` strict camelCase (was `examSubmissionId`), validates `uuid`, rejects legacy `exam_submission_id`/`examSubmissionId` with `400 Use examId`, `400 Unknown section name` (case-insensitive)
* `repositories/IExamSubmissionRepository.ts:9` + `DrizzleExamSubmissionRepository.ts:30` — tambah `findByExamId(examId)` dengan filter `status IN ('submitted','finished','finished-late')`
* `use-cases/certification/ManageCertificationScores.ts:90` — `getAll(examId?)` filter by `examId` dan dedup **latest finished per user per exam** (`status` finished → `startedAt` desc, tie `submittedAt`), tanpa filter juga dedup dengan filter status
