# Sertifikasi & Cetak Sertifikat — Ringkasan Implementasi

Ringkasan sementara yang berisi semua endpoint, skema data, payload (isi permintaan), dan
alur UI/UX untuk fitur **skor sertifikasi → cetak sertifikat** yang dibuat di sesi ini
(termasuk alur verifikasi email yang jadi syaratnya).

Base URL: `http://localhost:3000` (diatur lewat env `BASE_URL`, dipakai untuk membuat link unduhan).
Auth: `Authorization: Bearer <token>` (JWT). Role: `superadmin`, `admin`, `reviewer`, `moderator`, `user`.

---

## 1. Model Data (Struktur Tabel)

### `certification_additional_scores` (definisi skor tambahan dari guru)
| kolom | tipe | keterangan |
|---|---|---|
| `id` | uuid | kunci utama |
| `score_name` | varchar | contoh: `class_speaking_score` |
| `weight` | double precision | 0–1, bagian dari total skor sertifikat |

Bentuk data:
```json
{ "id": "uuid", "scoreName": "class_speaking_score", "weight": 0.3 }
```

### `certification_score` (satu baris per pengiriman ujian yang sudah selesai)
| kolom | tipe | keterangan |
|---|---|---|
| `id` | uuid | kunci utama |
| `user_id` | int | relasi ke tabel users |
| `exam_submission_id` | uuid | unik — satu baris sertifikat per pengiriman |
| `additional_score` | jsonb | `{ "<nama skor>": <nilai> }` atau `null` |
| `exam_score_override` | double precision | 0–100 atau `null` (null = pakai skor ujian hasil hitung otomatis) |

Bentuk data:
```json
{
  "id": "uuid",
  "userId": 1,
  "examSubmissionId": "uuid",
  "additionalScore": { "class_speaking_score": 95 } | null,
  "examScoreOverride": 88 | null
}
```

### Dibuat otomatis
Saat ujian selesai (`POST /api/exam-sessions/:id/finish`), sistem **otomatis membuat**
baris `certification_score` (isi `additional_score` = null, `exam_score_override` = null).
Bersifat idempoten (`ON CONFLICT DO NOTHING` pada `exam_submission_id`), jadi aman dipanggil
berulang. Setelahnya admin tinggal mengisi skor lewat `PATCH`.

---

## 2. Cara Menghitung Skor Sertifikat

Dihitung otomatis di server saat unduh/email
(file `src/use-cases/certification/certificateComputation.ts`):

- **Skor ujian** = pakai `exam_score_override` kalau ada, kalau tidak:
  `(total skor semua bagian yang dikerjakan / total poin semua soal di ujian) × 100`
- **Bobot ujian** = `1 − jumlah semua bobot skor tambahan` (dibatasi minimal 0)
- **Skor akhir** = `skorUjian × bobotUjian + jumlah(nilaiTambahan × bobot)`, dibulatkan 1 angka desimal

Contoh: override 88, bobot 0.3 + 0.2 → `final = 88 × 0.5 + 95 × 0.3 + 80 × 0.2 = 88.5`.

---

## 3. Endpoint Auth (syarat sebelum pakai fitur)

| Metode | Path | Auth | Isi Permintaan (body) | Berhasil | Error |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | — | `{ email, password (≥6), full_name, phone_number, type: "user"\|"student", student_id? (wajib kalau student), degree_program? }` | 201 `{ message, user }`; kirim email berisi kode 6 digit | 409 `Email already in use` |
| POST | `/api/auth/verify-email` | — | `{ email, code (6 digit) }` | 200 `{ message, user }` | 404 `User not found`; 400 kode salah/kadaluarsa |
| POST | `/api/auth/resend-verification` | — | `{ email }` | 200 `{ message }` | 404 `User not found` |
| POST | `/api/auth/login` | — | `{ email, password }` | 200 `{ message, token, user: { id, email, fullName, phoneNumber, role, isVerified } }` | 401 `Invalid email or password`; **403 `Email not verified`** |

**UI/UX:** daftar → tampilkan layar "cek email Anda" → pengguna memasukkan kode 6 digit →
terverifikasi → login. Pengguna yang belum verifikasi akan ditolak saat login (403) dengan
tawaran untuk kirim ulang kode.

---

## 4. Skor Tambahan Sertifikasi (definisi skor)

Awalan path: `/api/certification-additional-scores` (ubah = admin, baca = semua yang login).

| Metode | Path | Auth | Isi Permintaan (body) | Berhasil | Error |
|---|---|---|---|---|---|
| POST | `/` | admin | `{ scoreName: string, weight: number (0–1) }` | 201 `{ message, score }` | 400 (zod) |
| GET | `/` | user | — | 200 array | — |
| GET | `/:id` | user | — | 200 | 404 |
| PATCH | `/:id` | admin | `{ scoreName?, weight? }` (boleh sebagian) | 200 `{ message, score }` | 404 |
| DELETE | `/:id` | admin | — | 200 `{ message }` | 404 |

**UI/UX (admin):** halaman "definisi skor" tempat guru mengatur skor mana saja yang ada dan
bobotnya. Nama skor ini menjadi kunci yang boleh dipakai di `additional_score`. Tips: usahakan
total bobot ≤ 1 (kelebihan akan dipotong otomatis oleh perhitungan).

---

## 5. Skor Sertifikasi (editing per pengiriman oleh admin)

Awalan path: `/api/certification-scores` (semua admin kecuali unduh, yang bersifat publik).

### `GET /api/certification-scores`
Melihat daftar semua baris sertifikasi. Ada filter opsional:
```
GET /api/certification-scores?exam_submission_id=<uuid>
```
→ 200 berupa array `CertificationScore` (kalau difilter jadi 1 elemen, atau `[]` kalau tidak ada).
**Auth:** admin. **401** tanpa token; **403** untuk non-admin.

**UI/UX (admin):** tabel baris sertifikat pengguna (user, pengiriman ujian, skor tambahan,
override, skor akhir). Cari/filter berdasarkan id pengiriman ujian (misal pilih dari daftar
ujian yang selesai, atau ketik id-nya).

### `PATCH /api/certification-scores/:id`
```json
{
  "additional_score": { "class_speaking_score": 95, "class_individual_task_score": 80 },
  "exam_score_override": 88
}
```
Kedua field opsional. `exam_score_override: null` berarti **menghapus override** → kembali
memakai skor ujian hasil hitung otomatis. Kunci di `additional_score` harus cocok dengan
`score_name` yang sudah dikonfigurasi.
→ 200 `{ message, score }` (data terbaru).
Error: 400 `Unknown additional score name: <kunci>` (zod juga 400 kalau nilai di luar batas);
404 `Certification score not found`; 401/403.

**UI/UX (admin):** panel edit per baris — input untuk tiap skor guru yang dikonfigurasi dan
satu field "override skor ujian". Sediakan tombol "hapus override / pakai hasil hitung" yang
mengirim `null`. Tampilkan pratinjau skor akhir secara langsung
(skorUjian × bobot + jumlah(skor tambahan × bobot)).

### `GET /api/certification-scores/:id/download`
**Publik — tanpa JWT.** Merender sertifikat PDF.
→ 200 `application/pdf`, `Content-Disposition: attachment; filename="certificate-<nama-fullName-sudah-dibersihkan>.pdf"`.
Error: 404 `Certification score not found` / `User not found`.

**UI/UX (user):** tombol "Unduh Sertifikat". Kalau dibuka di tab baru, PDF langsung terunduh.
(Frontend juga bisa `fetch` + blob kalau mau dipicu dari JavaScript.)

### `POST /api/certification-scores/blast-email`
```json
{ "exam_submission_id": "<uuid>" }
```
→ 200 `{ message, to, fullName, downloadUrl }`; mengirim email ke pengguna pengiriman tersebut
berisi identitas + link unduhan
(`${BASE_URL}/api/certification-scores/<id>/download`).
Error: 400 (body bukan uuid, zod); 404 `Certification score not found` / `User not found`;
503 `SMTP is not configured`.

**UI/UX (admin):** tombol "kirim email sertifikat" per baris (atau per pengiriman). Tampilkan
dialog konfirmasi sebelum kirim. Kalau berhasil, tampilkan `to` / `fullName` / `downloadUrl`.

---

## 6. Alur Sesi Ujian (pemicu + sumber data skor ujian)

Awalan path: `/api/exam-sessions`.

| Metode | Path | Auth | Isi Permintaan (body) | Berhasil | Catatan |
|---|---|---|---|---|---|
| POST | `/start` | user | `{ userId: int, examId: uuid, timezone? }` | 201 `{ message, session }` | 409 `Ongoing session already exists` (mengembalikan sesi aktif + checkpoint) |
| POST | `/:id/answers` | user | **multipart/form-data** — field `questionId`, `selectedOptionId?` / `textResponse?`, file `audio?` | 201 `{ message, answer }` | **`:id` = id pengiriman bagian (section submission), BUKAN id pengiriman ujian** (catatan penting — lihat bagian 9) |
| POST | `/:id/finish` | user | `{ timezone? }` | 200 `{ message, submission, sectionSubmissions }` | **otomatis membuat baris `certification_score`** |
| POST | `/sections/:id/finish` | user | `{ timezone? }` | 200 | lanjut ke bagian berikutnya |
| GET | `/history` | user | — | 200 array | riwayat pengiriman user |
| GET | `/report` | admin | — | 200 `{ data }` | laporan semua user |

**UI/UX (user):** Mulai → tampilan soal per bagian (MCQ / esai / rekam audio) → jawaban
tersimpan otomatis → selesai → pengiriman tercatat. Bagian back-office yang menangani skor
sertifikasi (admin melihat baris baru muncul otomatis setelah ujian selesai).

---

## 7. Rendering PDF Sertifikat

- Dirender dengan `pdfkit` (A4 landscape) di file `src/infrastructure/pdf/certificatePdf.ts`.
- Gambar latar: `assets/certificate-background.png` di **root repo**, dicari lewat
  `process.cwd()`. Kalau file tidak ada → PDF polos putih. Ganti file PNG untuk ubah tampilan.
- Baris teks (semua rata tengah secara matematis — kotak teks dicenter, otomatis membungkus
  kalau terlalu panjang):
  1. `CERTIFICATE OF ACHIEVEMENT`
  2. `This is to certify that`
  3. `{fullName}`
  4. `has successfully completed the {examTitle} assessment.`
  5. `Total Score: {final}`
  6. `Exam Score: {exam}` (+ rincian ` {name}: {value}` kalau ada skor tambahan)
  7. `Issued to {email}`

**UI/UX:** sertifikat berupa halaman A4-landscape yang bisa dicetak — cocok memakai CSS print
atau unduh langsung.

---

## 8. Error / Kode Status

Handler pusat di file `src/infrastructure/web/middleware/errorHandler.ts`:
- Validasi Zod gagal → **400** `Validation Error` + `details`
- `Email already in use` → **409**
- `Invalid email or password` → **401**
- `User not found` → **404**
- `Invalid verification code` / `Verification code has expired` → **400**
- `Email not verified` → **403**
- `Unknown additional score name: <kunci>` → **400**
- `Certification score not found` / `User not found` (di route sertifikat) → **404**
- `SMTP is not configured` → **503**
- selain itu → **500**

Rate limiting (middleware in-memory buatan sendiri): global `/api` 120 req/menit; auth
20 / 15 menit; login 5 / 15 menit (per IP).

---

## 9. Catatan Penting untuk Pengembang

- **Parameter path jawaban:** `POST /api/exam-sessions/:id/answers` mengharapkan **id
  pengiriman bagian** (yaitu `currentSectionSession.id` yang dikembalikan `/start`), bukan id
  pengiriman ujian.
- **Isi jawaban multipart** (`form-data`), bukan JSON. Field unggahan namanya `audio`.
- **`BASE_URL`** (default `http://localhost:3000`) dipakai untuk membangun link unduhan di email.
- **Urutan migrasi:** skema ada di `src/infrastructure/database/schema.ts` → jalankan
  `yarn db:generate` + `yarn db:migrate` setelah mengubahnya. Folder `drizzle/` di-gitignore
  (migrasi hanya lokal).
- **Bagian yang di-seed punya `durationMinutes = 0`** → sesi yang baru dimulai langsung
  kedaluwarsa; naikkan durasi bagian lewat `PATCH /api/exam-sections/:id` dulu, atau UI akan
  kena `400 Time window exceeded`.
- Kredensial SMTP opsional: `NodemailerEmailService` hanya butuh `SMTP_HOST` untuk kirim
  (Mailhog/relay tanpa auth bisa dipakai dengan `SMTP_USER`/`SMTP_PASSWORD` kosong).

---

## 10. Ringkasan Alur (jalur utama)

1. Admin membuat definisi skor tambahan (bagian 4).
2. User daftar → verifikasi email → login (bagian 3).
3. User mulai ujian, menjawab soal, selesai → baris `certification_score` otomatis dibuat
   (bagian 6).
4. Admin melihat daftar skor sertifikasi (bisa difilter per pengiriman), mengisi skor guru +
   override skor ujian lewat `PATCH` (bagian 5).
5. Admin klik "kirim email sertifikat" untuk pengiriman itu → user menerima email berisi
   identitas + link unduhan.
6. User klik link → `GET /:id/download` (publik) → PDF sertifikat siap cetak.