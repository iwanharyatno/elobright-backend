# Panduan Frontend — Update Certification Score (PATCH /:id) (Sementara)

> **Versi**: `2026-09-01` · Backend `elobright-backend` · **Sementara** — hapus setelah FE selesai. Strict `authMiddleware(ROLE_ADMIN)` + **strict camelCase**.

Base `http://localhost:3000` · Mount `app.use("/api/certification-scores", certificationScoreRoutes)` (`src/infrastructure/web/routes/certificationScoreRoutes.ts:55`).

---

## 0) Endpoint

| Method | Path | Auth | Tujuan |
|---|---|---|---|
| `PATCH` | `/api/certification-scores/:id` | `ROLE_ADMIN` | Update **additionalScore** dan/atau **examScoreOverride** untuk satu certification score; mendukung per-key `null` untuk menghapus entri tertentu (case-insensitive) |

Controller `CertificationScoreController.ts: update` dan use-case `ManageCertificationScores.ts: update`.

---

## 1) Kontrak

```http
PATCH /api/certification-scores/12b5e730-7dfb-467d-8200-ea238d4ea6ef
Authorization: Bearer <ADMIN_JWT>
Content-Type: application/json
{
  "additionalScore": {
    "class_speaking_score": 90,
    "class_individual_task_score": null
  },
  "examScoreOverride": {
    "Reading": 85,
    "Listening": null
  }
}
```

Atau clear seluruh `examScoreOverride`:

```http
{
  "examScoreOverride": null
}
```

*Controller* `CertificationScoreController.ts:7` (`updateSchema`):
```ts
z.object({
  additionalScore: z.record(z.string(), z.union([z.number().min(0).max(100), z.null()])).optional(),
  examScoreOverride: z.record(z.string().min(1), z.union([z.number().min(0).max(100), z.null()])).nullable().optional(),
}).strict() // unknown top-level key → 400
```

*Use-case* `ManageCertificationScores.ts: update`:

**Validasi** (case-insensitive, preserve casing asli di pesan error):

- `additionalScore` keys vs `certification_additional_scores.scoreName` (`validNamesLower = Set(scoreName.toLowerCase())`). Tidak cocok → `400 {error:"Unknown additional score name: <key>"}`.
- `examScoreOverride` non-`null` keys vs `exam_sections.title ?? id` untuk exam yang bersangkutan (`validSectionNamesLower = Set((title ?? id).toLowerCase())`). Tidak cocok → `400 {error:"Unknown section name: <key>"}`. Jika `examScoreOverride === null` (keseluruhan), tidak ada validasi key.

Keduanya `key.toLowerCase()` vs `validLower` — mis. `"Class_Speaking_Score"` cocok `"class_speaking_score"`, `"reading"` cocok `"Reading"`.

**Merging (per-key `null` menghapus, case-insensitive, preserve casing payload):**

- `existingAdditional = existing.additionalScore ?? {}` → `merged = {...existingAdditional}`
  Untuk tiap `[rawKey, rawValue]` di `data.additionalScore`:
  - `targetKey = Object.keys(merged).find(k => k.toLowerCase() === rawKey.toLowerCase())`
  - jika `rawValue === null` → `delete merged[targetKey]` jika ada (hapus satu entri, bukan whole column)
  - else → jika `targetKey && targetKey !== rawKey` hapus old casing, lalu `merged[rawKey] = value` (casing baru sebagai dikirim)

  Contoh:
  ```ts
  existing = {"class_speaking_score":90, "other":80}
  payload = {"Class_Speaking_Score": null, "NewScore":100}
  // → merged = {"other":80, "NewScore":100}
  ```
  Lalu `updateAdditionalScore(id, merged)` (merged kosong → `{}`).

- `existingOverride` serupa; jika `data.examScoreOverride === null` → `updateExamScoreOverride(id, null)` (hapus semua). Else per-key merge seperti di atas, lalu `toSave = Object.keys(merged).length ? merged : null` → `updateExamScoreOverride(id, toSave)`. Kosong setelah hapus → `null`.

Key lama dengan casing berbeda **diganti** dengan casing baru sebagai dikirim (tampilkan apa adanya).

---

## 2) Response

**Sukses** `200`:

```json
{
  "message": "Certification score updated",
  "score": {
    "id": "12b5e730-...",
    "userId": 326,
    "examSubmissionId": "f703cb02-...",
    "additionalScore": { "class_individual_task_score": 80 },
    "examScoreOverride": { "Listening": 90 }
  }
}
```

- `additionalScore` / `examScoreOverride` mencerminkan **merged** setelah hapus/tambah. `examScoreOverride: null` jika kosong.
- Field ter-enrich (`originalExamScore`, `scores`, dll) **tidak** dikembalikan di sini; fetch lagi via `GET /api/certification-scores?examId=...` atau `GET /api/certification-scores` untuk melihat `scores`/`overrides`/`totalScore` terkomputasi.

**Error**:

| Status | Kapan | Body |
|---|---|---|
| `400` | Zod `Validation Error` (nilai bukan `0..100` atau bukan `number|null`, atau top-level snake `additional_score`) | `{error:"Validation Error", details:[{path:["additionalScore"], code:"invalid_type"}]}` |
| `400` | `Unknown additional score name: <key>` (case-insensitive, key tampil apa adanya) | `{error:"Unknown additional score name: <key>"}` |
| `400` | `Unknown section name: <key>` (case-insensitive vs `title ?? id`) | `{error:"Unknown section name: <key>"}` |
| `404` | `id` tidak ditemukan (`findById` null) | `{message:"Certification score not found"}` |
| `401` | tanpa `Bearer` | `{error:"Unauthorized"}` |
| `403` | role bukan `admin|superadmin` | `{error:"Forbidden"}` |

---

## 3) Contoh Curl

```bash
# Set/overwrite satu section + additional (strict camelCase, case-insensitive key)
curl -X PATCH http://localhost:3000/api/certification-scores/12b5e730-7dfb-467d-8200-ea238d4ea6ef \
 -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
 -d '{"additionalScore":{"class_speaking_score":90},"examScoreOverride":{"Reading":85}}'
# → 200 {additionalScore:{"class_speaking_score":90}, examScoreOverride:{"Reading":85}}

# Per-key null hapus (case-insensitive) — hanya hapus entri itu
curl -X PATCH ... -d '{"additionalScore":{"Class_Speaking_Score":null}}'
# Jika existing {"class_speaking_score":90,"other":80} → sesudah {"other":80}

curl -X PATCH ... -d '{"examScoreOverride":{"Reading":null}}'
# Jika existing {"Reading":85,"Listening":90} → sesudah {"Listening":90}

# Tambah dengan casing berbeda (ganti old casing)
curl -X PATCH ... -d '{"additionalScore":{"CLASS_INDIVIDUAL_TASK_SCORE":95}}'
# Jika existing {"class_individual_task_score":80} → sesudah {"CLASS_INDIVIDUAL_TASK_SCORE":95}

# Clear seluruh examScoreOverride
curl -X PATCH ... -d '{"examScoreOverride":null}'
# → examScoreOverride: null

# Section tidak valid
curl -X PATCH ... -d '{"examScoreOverride":{"INVALID":90}}'
# → 400 {error:"Unknown section name: INVALID"}

# Additional tidak valid
curl -X PATCH ... -d '{"additionalScore":{"not_configured":90}}'
# → 400 {error:"Unknown additional score name: not_configured"}

# Legacy snake top-level → 400 unrecognized_keys
curl -X PATCH ... -d '{"additional_score":{"class_speaking_score":90}}'
# → 400 {error:"Validation Error", details:[{code:"unrecognized_keys", keys:["additional_score"]}]}

# Nilai di luar range (per-key)
curl -X PATCH ... -d '{"examScoreOverride":{"Reading":150}}'
# → 400 Validation Error (max 100), tapi Reading: null diperbolehkan

# Per-key null diperbolehkan, tapi whole additionalScore null tidak (hanya examScoreOverride nullable)
curl -X PATCH ... -d '{"additionalScore":null}'
# → 400 Validation Error (additionalScore expects record, not null)
```

---

## 4) Snippet Frontend

```ts
export type UpdateCertPayload = {
  additionalScore?: Record<string, number | null>;
  examScoreOverride?: Record<string, number | null> | null;
};

export async function patchCertScore(
  token: string,
  certId: string,
  payload: UpdateCertPayload
) {
  const r = await fetch(`/api/certification-scores/${certId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const err = await r.json();
    throw new Error(err.error || err.message || await r.text());
  }
  return r.json() as Promise<{ message: string; score: any }>;
}

// Contoh

// Set
await patchCertScore(token, certId, {
  additionalScore: { class_speaking_score: 90 },
  examScoreOverride: { Reading: 85 },
});

// Hapus satu entri (per-key null)
await patchCertScore(token, certId, {
  additionalScore: { class_speaking_score: null },
  examScoreOverride: { Reading: null },
});

// Clear seluruh exam overrides
await patchCertScore(token, certId, { examScoreOverride: null });

// Setelah patch, re-fetch untuk melihat terkomputasi
// GET /api/certification-scores?examId=...
const updated = await fetch(`/api/certification-scores?examId=${examId}`, {
  headers: { Authorization: `Bearer ${token}` },
}).then(r => r.json());
// updated[0].examScoreOverride, updated[0].additionalScore, updated[0].scores, updated[0].overrides

// Validasi lokal opsional (mirror backend):
// additionalScore keys harus di allowedAdditionalNames (dari GET /api/certification-additional-scores)
// examScoreOverride keys harus di sections.map(s => s.title ?? s.id) (case-insensitive)
```

**Catatan UI:**

- Dua input number per section + per additional score. Untuk hapus, kirim `null` untuk key itu (mis. `onDelete: patch({examScoreOverride:{[title]: null}})`), bukan `0` atau `""`.
- Jika ingin hapus `Listening` tapi pertahankan `Reading`, kirim **hanya** `{"Listening": null}` — backend merge dengan existing, tidak replace whole map.
- Untuk menambah skor baru dengan casing berbeda, backend akan hapus casing lama dan sisipkan baru (`CLASS_...` ganti `class_...`).
- Setelah `PATCH`, selalu `GET` lagi untuk refresh `originalExamScore`/`totalScore`/`scores`/`overrides` (response `PATCH` hanya raw `score` dengan `additionalScore`/`examScoreOverride`, bukan breakdown terkomputasi).

---

## 5) Referensi Wiring

*Route* `src/infrastructure/web/routes/certificationScoreRoutes.ts:55`:
```ts
router.patch('/:id', authMiddleware(ROLE_ADMIN), controller.update);
```

*Controller* `CertificationScoreController.ts: update` — `strict()` `zod`, `manageCertificationScores.update(id, {additionalScore, examScoreOverride})`, map `Unknown...` → `400`, `Certification score not found` → `404`.

*Use-case* `ManageCertificationScores.ts: update` — `findById`, case-insensitive validasi `Set(...toLowerCase())`, merge per-key `null` handling, `updateAdditionalScore` / `updateExamScoreOverride` (`empty override → null`).

*Repo* `DrizzleCertificationScoreRepository.ts: updateAdditionalScore` (`set {additionalScore}`) / `updateExamScoreOverride` (`set {examScoreOverride}`) — `certification_score` tabel `jsonb`.

---

## 6) Checklist QA

- [ ] `PATCH` tanpa token → `401`; sebagai `user` → `403`; sebagai `admin` → `200`.
- [ ] `PATCH {additionalScore:{class_speaking_score:90}}` lalu `GET` → `additionalScore` berisi key tersebut (case sebagai dikirim).
- [ ] `PATCH {additionalScore:{Class_Speaking_Score: null}}` (beda case) → hapus existing (case-insensitive), `GET` tidak lagi berisi.
- [ ] `PATCH {examScoreOverride:{Reading:85}}` lalu `PATCH {examScoreOverride:{Reading:null}}` → `examScoreOverride` menjadi `null` (kosong → `null`) atau tersisa key lain.
- [ ] `PATCH {examScoreOverride:{"reading":85}}` (lower) → `200` (case-insensitive), simpan sebagai `"reading"` (tampil apa adanya), `GET` `overrides` dengan `sectionName:"Reading"` tetap.
- [ ] `PATCH {examScoreOverride:{INVALID:90}}` → `400 Unknown section name: INVALID`.
- [ ] `PATCH {additionalScore:{not_configured:90}}` → `400 Unknown additional score name`.
- [ ] `PATCH {examScoreOverride: null}` → clear semua → `examScoreOverride: null` dan `GET` `overrides:[]`.
- [ ] `PATCH {additionalScore:{class_speaking_score:null}}` saat hanya key itu ada → `additionalScore` jadi `{}` (empty) via `updateAdditionalScore(id, {})`.
- [ ] `PATCH {additional_score:{...}}` (snake) → `400 Validation Error unrecognized_keys`.
- [ ] `PATCH {examScoreOverride:{Reading:150}}` → `400 Validation Error` (max 100), tapi `Reading: null` diperbolehkan.
- [ ] Setelah `PATCH`, `GET /api/certification-scores?examId=...` menampilkan `examScoreOverride` terupdate dan `scores`/`overrides`/`totalScore` terkomputasi ulang.

Hapus setelah FE selesai.
