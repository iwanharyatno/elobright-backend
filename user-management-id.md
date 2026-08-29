# Panduan Frontend — User Management (Sementara)

> **Versi**: `2026-08-28` · Backend `elobright-backend` · **Sementara** — hapus setelah FE selesai. Semua route baru `strict` `authMiddleware(ROLE_ADMIN)` dan **strict camelCase**.

Base `http://localhost:3000` · Mount `app.use("/api/users", userRoutes)` (`src/infrastructure/web/server.ts:13`).

---

## 0) Endpoint

| Method | Path | Auth | Tujuan |
|---|---|---|---|
| `GET` | `/api/users` | `ROLE_ADMIN` | List user dengan relasi `student`, filter `search` (nama/email) + tanggal daftar (`createdAt`) + `isVerified` + pagination (`page`/`limit`) |
| `PATCH` | `/api/users/:id/password` | `ROLE_ADMIN` | Manual set password baru (bypass reset flow, hash `bcrypt`) |
| `POST` | `/api/users/:id/reset-password` | `ROLE_ADMIN` | Manual trigger email reset-password (generate token, `updateResetPasswordToken`, `sendPasswordResetEmail`) |
| `PATCH` | `/api/users/:id/verify` | `ROLE_ADMIN` | Manual verifikasi/unverifikasi (`isVerified`) — klarifikasi: bukan `is_active`, tapi `isVerified` |

Semua mengembalikan `401` tanpa `Bearer`, `403` jika role bukan `admin|superadmin`.

---

## 1) `GET /api/users`

### Query

```http
GET /api/users?search=john&startDate=2026-08-01&endDate=2026-08-28&isVerified=true&page=1&limit=10
GET /api/users?search=john@test.com&createdAtFrom=2026-08-01&createdAtTo=2026-08-28&isVerified=false&page=2&limit=20
Authorization: Bearer <ADMIN_JWT>
```

*Controller* `UserController.ts: getAll` parse `getAllQuerySchema` (`z.object({search, startDate, endDate, createdAtFrom, createdAtTo, isVerified: enum['true','false']->boolean, verified: alias, page: coerce number min1 default1, limit: coerce number min1 max100 default10})`). Logic:
```ts
search = (query.search?.trim() || undefined)
rawStart = query.startDate || query.createdAtFrom
rawEnd   = query.endDate   || query.createdAtTo
if(rawStart) startDate = new Date(rawStart); throw 400 "Invalid startDate" jika NaN
if(rawEnd)   endDate = new Date(rawEnd); endDate.setHours(23,59,59,999); // inklusif
isVerified = query.isVerified ?? query.verified // 'true'->true, 'false'->false
page = query.page ?? 1; limit = query.limit ?? 10; // clamp 1..100
```

*Use-case* `ManageUsers.ts: getAll({search, startDate, endDate, isVerified, page, limit})` → `DrizzleUserRepository.findAllWithFilters`:
```ts
where: and(
  or(ilike(email, `%search%`), ilike(fullName, `%search%`)) // jika search
  gte(createdAt, startDate)
  lte(createdAt, endDate)
  eq(isVerified, isVerified) // jika isVerified !== undefined
)
orderBy: desc(createdAt)
limit: limit, offset: (page-1)*limit
// + count query: select count(*) dengan where sama → total
```
Lalu `studentRepository.findAll()` → `Map<userId,Student>` → `UserWithStudent[]`, return `{data, pagination:{total, page, limit, totalPages}}`.

**Response** `200` (paginated):

```json
{
  "data": [
    {
      "id": 347,
      "email": "user_test_...@example.com",
      "fullName": "Test User",
      "role": "user",
      "phoneNumber": "08123456789",
      "isVerified": false,
      "createdAt": "2026-08-28T04:01:11.832Z",
      "updatedAt": "...",
      "student": {
        "id": "7ffa8fe7-...",
        "studentId": "NIM671755",
        "userId": 347,
        "degreeProgram": "CS"
      }
    },
    {
      "id": 324,
      "email": "e2e@test.com",
      "fullName": "E2E Test User",
      "isVerified": false,
      "student": null
    }
  ],
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
}
```

- `passwordHash`, `verificationCode`, `resetPasswordToken` **tidak** dikembalikan.
- `student: null` jika tidak ada baris `students`.
- `pagination.total` adalah total baris terfilter, `totalPages = ceil(total/limit)`.

**Error**:

| Status | Kapan |
|---|---|
| `400` | `Invalid startDate`/`Invalid endDate` atau `isVerified` bukan `true`/`false` atau `page`/`limit` invalid (Zod) |
| `401`/`403` | auth |

**Curl**:

```bash
curl "http://localhost:3000/api/users?search=john&isVerified=true&page=1&limit=10&startDate=2026-08-01&endDate=2026-08-28" \
 -H "Authorization: Bearer $ADMIN_TOKEN"
curl "http://localhost:3000/api/users?isVerified=false&page=2&limit=20" \
 -H "Authorization: Bearer $ADMIN_TOKEN"
```

**FE**:

```ts
export type UserWithStudent = {
  id:number; email:string; fullName:string|null; role:string; isVerified:boolean;
  createdAt:string; updatedAt:string;
  student: {id:string; studentId:string; degreeProgram:string|null}|null;
};
export type PaginatedUsers = { data: UserWithStudent[]; pagination: { total:number; page:number; limit:number; totalPages:number } };
export async function fetchUsers(token:string, params?:{search?:string; startDate?:string; endDate?:string; isVerified?:boolean; page?:number; limit?:number}){
  const qs=new URLSearchParams();
  if(params?.search) qs.set('search', params.search);
  if(params?.isVerified!==undefined) qs.set('isVerified', String(params.isVerified));
  if(params?.startDate) qs.set('startDate', params.startDate);
  if(params?.endDate) qs.set('endDate', params.endDate);
  if(params?.page) qs.set('page', String(params.page));
  if(params?.limit) qs.set('limit', String(params.limit));
  const r=await fetch(`/api/users${qs.toString()?`?${qs}`:''}`,{headers:{Authorization:`Bearer ${token}`}});
  if(!r.ok) throw new Error(await r.text());
  return r.json() as Promise<PaginatedUsers>;
}
// Table + pagination
// <td>{u.isVerified ? 'Verified' : 'Unverified'}</td>
// pagination.totalPages untuk <Pagination />
```

---

## 2) `PATCH /api/users/:id/password`

Manual set password (admin, tanpa old password, tanpa email).

```http
PATCH /api/users/347/password
Authorization: Bearer <ADMIN_JWT>
Content-Type: application/json
{
  "newPassword": "NewPass123!",
  "confirmPassword": "NewPass123!" // opsional, jika ada harus sama
}
```

*Controller* `UserController.ts: updatePassword` → `z.object({newPassword:z.string().min(6), confirmPassword:z.string().min(6).optional()}).refine(...)`.
*Use-case* `ManageUsers.ts: updatePassword` → `findById` → `404 User not found` jika tidak ada, `400 Password must be at least 6 characters`/`Passwords do not match` → `bcrypt.genSalt(10)` + `hash` → `updatePassword(userId, hash)` (hapus `resetPasswordToken`).

**Response** `200`:

```json
{ "message":"Password updated successfully", "user":{ "id":347, "email":"...", "isVerified":false } }
```

Error: `400 Invalid user id` (NaN), `404 User not found`, `400` validasi, `400 Validation Error` (Zod).

```bash
curl -X PATCH http://localhost:3000/api/users/347/password \
 -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
 -d '{"newPassword":"NewPass123!","confirmPassword":"NewPass123!"}'
```

FE: setelah sukses, user bisa `POST /api/auth/login` dengan password baru (tetap butuh `isVerified=true`).

---

## 3) `POST /api/users/:id/reset-password`

Manual trigger reset flow (admin, bahkan jika `isVerified=false` — beda dengan `POST /api/auth/forgot-password` yang generic).

```http
POST /api/users/347/reset-password
Authorization: Bearer <ADMIN_JWT>
Content-Type: application/json
{} // tanpa body
```

*Flow*: `findById` → `404` jika tidak ada → `generateResetPasswordToken()` (64 hex, `crypto.randomBytes(32)`), `hashResetPasswordToken` (`sha256`), `getPasswordResetTokenExpiry()` (60m), `updateResetPasswordToken(userId, hash, expiresAt)` → `sendPasswordResetEmail(email, fullName, resetUrl)` dimana `resetUrl = ${FRONTEND_URL}/reset-password?token=${token}` (`FRONTEND_URL` dari `.env`, default `http://localhost:5173`).

**Response** `200`:

```json
{ "message":"Password reset email sent" }
```

Error: `400 Invalid user id`, `404 User not found`, `503 SMTP is not configured`.

```bash
curl -X POST http://localhost:3000/api/users/347/reset-password \
 -H "Authorization: Bearer $ADMIN_TOKEN"
```

FE: tombol “Kirim link reset” → toast, cek DB `users.reset_password_token` untuk QA.

---

## 4) `PATCH /api/users/:id/verify`

Manual verifikasi/unverifikasi (menggantikan permintaan `is_active`; klarifikasi: pakai `isVerified`).

```http
PATCH /api/users/347/verify
Authorization: Bearer <JWT> # ROLE_ADMIN
Content-Type: application/json
{ "isVerified": true }   // atau false untuk unverifikasi
// Body kosong {} default ke true (verifikasi) untuk kemudahan
```

*Controller* `UserController.ts: verifyUser` → `Number(id)` → `400 Invalid user id` jika NaN → parse `verifySchema` (`z.object({isVerified:z.boolean()})`) jika body tidak kosong else `true` → `ManageUsers.setVerified(userId, isVerified)` → `userRepository.setVerified(userId, bool)` (`update isVerified, clear verificationCode`, `DrizzleUserRepository.ts: setVerified`).

**Response** `200`:

```json
{ "message":"User verified successfully", "user":{ "id":347, "isVerified":true, "email":"...", "fullName":"..." } }
// atau
{ "message":"User unverified successfully", "user":{ "id":347, "isVerified":false } }
```

Setelah `isVerified:false`, `POST /api/auth/login` → `403 {error:"Email not verified"}` (`LoginUser.ts:21`).

```bash
# Verifikasi
curl -X PATCH http://localhost:3000/api/users/347/verify \
 -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
 -d '{"isVerified":true}'
# Unverifikasi
curl -X PATCH http://localhost:3000/api/users/347/verify \
 -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
 -d '{"isVerified":false}'
# Default (tanpa body) → verifikasi
curl -X PATCH http://localhost:3000/api/users/347/verify \
 -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
 -d '{}'
```

FE: toggle switch → `PATCH .../verify` → update badge `isVerified`.

---

## 5) Tipe & Wiring

```ts
// Request GET /api/users
type GetUsersQuery = { search?:string; startDate?:string; endDate?:string; createdAtFrom?:string; createdAtTo?:string; isVerified?:boolean; page?:number; limit?:number };

// Response paginated
type PaginatedUsers = { data: (User & {student: Student|null})[]; pagination: { total:number; page:number; limit:number; totalPages:number } };
type UserWithStudent = User & { student: Student|null };

// PATCH /:id/password
type UpdatePasswordBody = { newPassword:string; confirmPassword?:string };

// POST /:id/reset-password — tanpa body

// PATCH /:id/verify
type VerifyBody = { isVerified:boolean }; // opsional, default true
```

Wiring `src/infrastructure/web/routes/userRoutes.ts` (manual DI):
```ts
const userRepository = new DrizzleUserRepository();
const studentRepository = new DrizzleStudentRepository();
const emailService = new NodemailerEmailService();
const manageUsers = new ManageUsers(userRepository, studentRepository, emailService);
const controller = new UserController(manageUsers);
router.get('/', authMiddleware(ROLE_ADMIN), controller.getAll);
router.patch('/:id/password', authMiddleware(ROLE_ADMIN), controller.updatePassword);
router.post('/:id/reset-password', authMiddleware(ROLE_ADMIN), controller.triggerResetPassword);
router.patch('/:id/verify', authMiddleware(ROLE_ADMIN), controller.verifyUser);
export {router as userRoutes};
```
Mount di `server.ts:13` sebagai `app.use("/api/users", userRoutes)`.

---

## 6) Checklist QA

- [ ] `GET /api/users` sebagai `user` → `403`; tanpa token → `401`.
- [ ] `GET /api/users?search=Test` mengembalikan `ilike` `email` ATAU `fullName` (coba `test@test.com` dan `Test` case-insensitive).
- [ ] `GET /api/users?startDate=2026-08-01&endDate=2026-08-02` hanya user dengan `createdAt` di range (inklusif, `endDate` di-set `23:59:59.999`); tanggal invalid → `400 Invalid startDate`.
- [ ] `GET /api/users?isVerified=true` hanya terverifikasi, `?isVerified=false` hanya belum, tanpa param semua.
- [ ] `GET /api/users?page=1&limit=10` mengembalikan `pagination: {total, page, limit, totalPages}` dan `data` `<=limit`; `page=2` slice berikutnya; `limit` clamp `1..100`, default `10`.
- [ ] Response selalu `student` jika `students.userId` ada, else `student:null`, tidak pernah `passwordHash`, dan paginated `{data, pagination}`.
- [ ] `PATCH /:id/password` dengan `newPassword` <6 → `400`; tanpa `confirmPassword` mismatch → `400`; sukses → login dengan password baru berhasil (setelah `isVerified=true`).
- [ ] `POST /:id/reset-password` → `200` dan DB `reset_password_token` terisi, email di `mailpit` berisi `FRONTEND_URL/reset-password?token=...`.
- [ ] `PATCH /:id/verify {isVerified:true}` → `isVerified:true`, login `200`; `{isVerified:false}` → login `403 Email not verified`.
- [ ] `PATCH /:id/verify` dengan body kosong → default verifikasi `true`.

Hapus file ini setelah FE selesai.
