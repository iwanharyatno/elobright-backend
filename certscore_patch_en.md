# Frontend Brief — Certification Score Update (PATCH /:id) (Temporary)

> **Version**: `2026-09-01` · Backend `elobright-backend` · **Temporary** — delete after FE implementation. Strict `authMiddleware(ROLE_ADMIN)` + **strict camelCase**.

Base `http://localhost:3000` · Mount `app.use("/api/certification-scores", certificationScoreRoutes)` (`src/infrastructure/web/routes/certificationScoreRoutes.ts:55`).

---

## 0) Endpoint

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `PATCH` | `/api/certification-scores/:id` | `ROLE_ADMIN` | Update **additionalScore** and/or **examScoreOverride** for a single certification score; supports per-key `null` to delete an existing entry (case-insensitive) |

Controller `CertificationScoreController.ts: update` (`PATCH /:id`) and use-case `ManageCertificationScores.ts: update`.

---

## 1) Contract

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

Or clear whole `examScoreOverride`:

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
}).strict() // unknown top-level keys → 400
```

*Use-case* `ManageCertificationScores.ts:188` (`update`):

**Validation** (case-insensitive, preserves original casing in error message):

- `additionalScore` keys vs `certification_additional_scores.scoreName` (`validNamesLower = Set(scoreName.toLowerCase())`). Unknown → `400 {error:"Unknown additional score name: <key>"}`.
- `examScoreOverride` non-`null` keys vs `exam_sections.title ?? id` for the exam that the certification belongs to (`validSectionNamesLower = Set((title ?? id).toLowerCase())`). Unknown → `400 {error:"Unknown section name: <key>"}`. If `examScoreOverride === null` (whole), no key validation.

Both checks are `key.toLowerCase()` vs `validLower` — e.g. `"Class_Speaking_Score"` matches `"class_speaking_score"`, `"reading"` matches `"Reading"`.

**Merging (per-key `null` deletes, case-insensitive, preserves payload casing):**

- `existingAdditional = existing.additionalScore ?? {}` → `merged = {...existingAdditional}`
  For each `[rawKey, rawValue]` in `data.additionalScore`:
  - `targetKey = Object.keys(merged).find(k => k.toLowerCase() === rawKey.toLowerCase())`
  - if `rawValue === null` → `delete merged[targetKey]` if exists (single entry delete, not whole column)
  - else → if `targetKey && targetKey !== rawKey` delete old casing, then `merged[rawKey] = value` (new casing as sent)

  Example:
  ```ts
  existing = {"class_speaking_score":90, "other":80}
  payload = {"Class_Speaking_Score": null, "NewScore":100}
  // → merged = {"other":80, "NewScore":100}  (deleted case-insensitively, added with new casing)
  ```
  Then `updateAdditionalScore(id, merged)` (empty merged → `{}`).

- `existingOverride` similarly; if `data.examScoreOverride === null` → `updateExamScoreOverride(id, null)` (clear all). Else per-key merge as above, then `toSave = Object.keys(merged).length ? merged : null` → `updateExamScoreOverride(id, toSave)`. Empty after deletes → `null`.

Original keys with different casing are **replaced** with the new casing as sent (display as payload).

---

## 2) Response

**Success** `200`:

```json
{
  "message": "Certification score updated",
  "score": {
    "id": "12b5e730-...",
    "userId": 326,
    "examSubmissionId": "f703cb02-...",
    "additionalScore": { "class_individual_task_score": 80 },
    "examScoreOverride": { "Listening": 90 },
    "userId": 326,
    "examSubmissionId": "f703cb02-..."
  }
}
```

- `additionalScore` / `examScoreOverride` reflect **merged** state after deletes/sets. `examScoreOverride: null` when empty.
- Enriched fields (`originalExamScore`, `scores`, etc.) are **not** returned here; fetch again via `GET /api/certification-scores?examId=...` or `GET /api/certification-scores` to see computed `scores`/`overrides`/`totalScore`.

**Errors**:

| Status | When | Body |
|---|---|---|
| `400` | Zod `Validation Error` (value not `0..100` or not `number|null`, or unknown top-level key `additional_score` snake_case) | `{error:"Validation Error", details:[{path:["additionalScore"], code:"invalid_type"}]}` |
| `400` | `Unknown additional score name: <key>` (case-insensitive, key displayed as sent) | `{error:"Unknown additional score name: <key>"}` |
| `400` | `Unknown section name: <key>` (case-insensitive vs `title ?? id`) | `{error:"Unknown section name: <key>"}` |
| `404` | `id` not found (`findById` null) | `{message:"Certification score not found"}` |
| `401` | no `Bearer` | `{error:"Unauthorized"}` |
| `403` | role not `admin|superadmin` | `{error:"Forbidden"}` |

---

## 3) Curl Examples

```bash
# Set/overwrite single section + additional (strict camelCase, case-insensitive keys)
curl -X PATCH http://localhost:3000/api/certification-scores/12b5e730-7dfb-467d-8200-ea238d4ea6ef \
 -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
 -d '{"additionalScore":{"class_speaking_score":90},"examScoreOverride":{"Reading":85}}'
# → 200 {additionalScore:{"class_speaking_score":90}, examScoreOverride:{"Reading":85}}

# Per-key null delete (case-insensitive) — deletes only that entry
curl -X PATCH ... -d '{"additionalScore":{"Class_Speaking_Score":null}}'
# If existing was {"class_speaking_score":90,"other":80} → after {"other":80}

curl -X PATCH ... -d '{"examScoreOverride":{"Reading":null}}'
# If existing {"Reading":85,"Listening":90} → after {"Listening":90}

# Add with different casing (replaces old casing)
curl -X PATCH ... -d '{"additionalScore":{"CLASS_INDIVIDUAL_TASK_SCORE":95}}'
# If existing {"class_individual_task_score":80} → after {"CLASS_INDIVIDUAL_TASK_SCORE":95}

# Clear whole examScoreOverride
curl -X PATCH ... -d '{"examScoreOverride":null}'
# → examScoreOverride: null

# Invalid section name
curl -X PATCH ... -d '{"examScoreOverride":{"INVALID":90}}'
# → 400 {error:"Unknown section name: INVALID"}

# Invalid additional score name
curl -X PATCH ... -d '{"additionalScore":{"not_configured":90}}'
# → 400 {error:"Unknown additional score name: not_configured"}

# Legacy snake_case top-level → 400 unrecognized_keys
curl -X PATCH ... -d '{"additional_score":{"class_speaking_score":90}}'
# → 400 {error:"Validation Error", details:[{code:"unrecognized_keys", keys:["additional_score"]}]}

# Value out of range (per-key)
curl -X PATCH ... -d '{"examScoreOverride":{"Reading":150}}'
# → 400 Validation Error (number must be <=100)

# Per-key null is allowed, but whole additionalScore null is not (only examScoreOverride nullable)
curl -X PATCH ... -d '{"additionalScore":null}'
# → 400 Validation Error (additionalScore expects record, not null)
```

---

## 4) Frontend Snippet

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

// Examples

// Set
await patchCertScore(token, certId, {
  additionalScore: { class_speaking_score: 90 },
  examScoreOverride: { Reading: 85 },
});

// Delete single entry (per-key null)
await patchCertScore(token, certId, {
  additionalScore: { class_speaking_score: null },
  examScoreOverride: { Reading: null },
});

// Clear whole exam overrides
await patchCertScore(token, certId, { examScoreOverride: null });

// After patch, re-fetch to see computed scores
// GET /api/certification-scores?examId=...
const updated = await fetch(`/api/certification-scores?examId=${examId}`, {
  headers: { Authorization: `Bearer ${token}` },
}).then(r => r.json());
// updated[0].examScoreOverride, updated[0].additionalScore, updated[0].scores, updated[0].overrides

// Before PATCH, validate locally (optional, mirrors backend):
// additionalScore keys must be in allowedAdditionalNames (from GET /api/certification-additional-scores)
// examScoreOverride keys must be in sections.map(s => s.title ?? s.id) (case-insensitive)
```

**Notes for UI:**

- Two text/number inputs per section + per additional score. For delete, send `null` for that key (e.g., `onDelete: patch({examScoreOverride:{[title]: null}})`), not `0` or `""` (empty string is stripped by `multer`? No, here JSON `null` is explicit). Empty cell in import (`NULL`/`-`/`0`) is different flow — here use JSON `null`.
- If you want to delete `Listening` but keep `Reading`, send **only** `{"Listening": null}` — backend merges with existing, does not replace whole map.
- To add a new score with different casing, backend will delete old casing and insert new (`CLASS_...` replaces `class_...`).
- After `PATCH`, always `GET` again to refresh `originalExamScore`/`totalScore`/`scores`/`overrides` (the `PATCH` response only returns raw `score` with `additionalScore`/`examScoreOverride`, not computed breakdown).

---

## 5) Wiring Reference

*Route* `src/infrastructure/web/routes/certificationScoreRoutes.ts:55`:
```ts
router.patch('/:id', authMiddleware(ROLE_ADMIN), controller.update);
```

*Controller* `CertificationScoreController.ts: update` — `strict()` `zod`, `manageCertificationScores.update(id, {additionalScore, examScoreOverride})`, maps `Unknown...` → `400`, `Certification score not found` → `404`.

*Use-case* `ManageCertificationScores.ts: update` — `findById`, case-insensitive validation via `Set(...toLowerCase())`, merge with per-key `null` handling, `updateAdditionalScore` / `updateExamScoreOverride` (empty override → `null`).

*Repo* `DrizzleCertificationScoreRepository.ts: updateAdditionalScore` (`set {additionalScore}`) / `updateExamScoreOverride` (`set {examScoreOverride}`) — `certification_score` table `jsonb`.

---

## 6) QA Checklist

- [ ] `PATCH` without token → `401`; as `user` role → `403`; as `admin` → `200`.
- [ ] `PATCH {additionalScore:{class_speaking_score:90}}` then `GET` → `additionalScore` contains that key (case as sent).
- [ ] `PATCH {additionalScore:{Class_Speaking_Score: null}}` (different case) → deletes existing (case-insensitive), `GET` no longer contains it.
- [ ] `PATCH {examScoreOverride:{Reading:85}}` then `PATCH {examScoreOverride:{Reading:null}}` → `examScoreOverride` becomes `null` (empty → `null`) or removes only that key if multiple.
- [ ] `PATCH {examScoreOverride:{"reading":85}}` (lower case) → `200` (case-insensitive), stored as `"reading"` (display as sent), `GET` shows `overrides` with `sectionName:"Reading"` still.
- [ ] `PATCH {examScoreOverride:{INVALID:90}}` → `400 Unknown section name: INVALID`.
- [ ] `PATCH {additionalScore:{not_configured:90}}` → `400 Unknown additional score name`.
- [ ] `PATCH {examScoreOverride: null}` → clears all overrides → `examScoreOverride: null` and `GET` `overrides:[]`.
- [ ] `PATCH {additionalScore:{class_speaking_score:null}}` when only that key exists → `additionalScore` becomes `{}` (empty) via `updateAdditionalScore(id, {})`.
- [ ] `PATCH {additional_score:{...}}` (snake) → `400 Validation Error unrecognized_keys`.
- [ ] `PATCH {examScoreOverride:{Reading:150}}` → `400 Validation Error` (max 100), `Reading: null` is allowed.
- [ ] After `PATCH`, `GET /api/certification-scores?examId=...` shows updated `examScoreOverride` and recomputed `scores`/`overrides`/`totalScore`.

Delete after FE done.
