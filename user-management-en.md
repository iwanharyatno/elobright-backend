# Frontend Brief — User Management (Temporary)

> **Version**: `2026-08-28` · Backend `elobright-backend` · **Temporary** — delete after FE implementation. All new `user` routes are **strict** `authMiddleware(ROLE_ADMIN)` and **strict camelCase** for new payloads (like `certification-scores`).

Base `http://localhost:3000` · Mount `app.use("/api/users", userRoutes)` (`src/infrastructure/web/server.ts:13`).

---

## 0) Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/users` | `ROLE_ADMIN` | List users with `student` relation, `search` (name/email) + register-date filter (`createdAt`) + `isVerified` filter + pagination (`page`/`limit`) |
| `PATCH` | `/api/users/:id/password` | `ROLE_ADMIN` | Manually set new password (bypasses reset flow, hashes with `bcrypt`) |
| `POST` | `/api/users/:id/reset-password` | `ROLE_ADMIN` | Manually trigger reset-password email (generates token, `updateResetPasswordToken`, `sendPasswordResetEmail`) |
| `PATCH` | `/api/users/:id/verify` | `ROLE_ADMIN` | Manually verify/unverify (`isVerified`) |

All return `401 {error:"Unauthorized"}` if no `Bearer`, `403 {error:"Forbidden"}` if role not `admin|superadmin`.

---

## 1) `GET /api/users`

### Query

```http
GET /api/users?search=john&startDate=2026-08-01&endDate=2026-08-28&isVerified=true&page=1&limit=10
GET /api/users?search=john@test.com&createdAtFrom=2026-08-01&createdAtTo=2026-08-28&isVerified=false&page=2&limit=20
Authorization: Bearer <ADMIN_JWT>
```

*Controller* `UserController.ts: getAll` parses `getAllQuerySchema` (`z.object({search, startDate, endDate, createdAtFrom, createdAtTo, isVerified: enum['true','false'] -> boolean, verified: alias, page: coerce number min1 default1, limit: coerce number min1 max100 default10})`). Logic:
```ts
search = (query.search?.trim() || undefined)
rawStart = query.startDate || query.createdAtFrom
rawEnd   = query.endDate   || query.createdAtTo
if(rawStart) startDate = new Date(rawStart); throw 400 "Invalid startDate" if NaN
if(rawEnd)   endDate = new Date(rawEnd); endDate.setHours(23,59,59,999); // inclusive
isVerified = query.isVerified ?? query.verified // 'true'->true, 'false'->false, undefined->all
page = query.page ?? 1; limit = query.limit ?? 10; // clamp 1..100
```

*Use-case* `ManageUsers.ts: getAll({search, startDate, endDate, isVerified, page, limit})` → `DrizzleUserRepository.findAllWithFilters`:
```ts
where: and(
  or(ilike(email, `%search%`), ilike(fullName, `%search%`)) // if search
  gte(createdAt, startDate) // if startDate
  lte(createdAt, endDate)   // if endDate
  eq(isVerified, isVerified) // if isVerified !== undefined
)
orderBy: desc(createdAt)
limit: limit, offset: (page-1)*limit
// + count query: select count(*) with same where → total
```
Then `studentRepository.findAll()` → `Map<userId,Student>` → `UserWithStudent[]` (`student` or `null`), returns `{data, pagination:{total, page, limit, totalPages}}`.

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

- `passwordHash`, `verificationCode`, `resetPasswordToken` **omitted**.
- `student: null` when no `students` row.
- `pagination.total` is total filtered rows, `totalPages = ceil(total/limit)`.

**Errors**:

| Status | When |
|---|---|
| `400` | `Invalid startDate`/`Invalid endDate` or `isVerified` not `true`/`false` or `page`/`limit` invalid (Zod) |
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
// Table + pagination controls
// <td>{u.email}</td> ... <td>{u.isVerified ? 'Verified' : 'Unverified'}</td>
// pagination.totalPages for <Pagination />
```

---

## 2) `PATCH /api/users/:id/password`

Manually set password (admin, no old password, no email).

```http
PATCH /api/users/347/password
Authorization: Bearer <ADMIN_JWT>
Content-Type: application/json
{
  "newPassword": "NewPass123!",
  "confirmPassword": "NewPass123!" // optional, if present must match
}
```

*Controller* `UserController.ts: updatePassword` → `z.object({newPassword:z.string().min(6), confirmPassword:z.string().min(6).optional()}).refine(...)`.
*Use-case* `ManageUsers.ts: updatePassword` → `findById` → `throw 404 User not found` if missing, `400 Password must be at least 6 characters`/`Passwords do not match` → `bcrypt.genSalt(10)` + `hash` → `updatePassword(userId, hash)` (clears `resetPasswordToken`).

**Response** `200`:

```json
{ "message":"Password updated successfully", "user":{ "id":347, "email":"...", "isVerified":false } }
```

Errors: `400 Invalid user id` (NaN), `404 User not found`, `400 Password must be at least 6 characters` / `Passwords do not match`, `400 Validation Error` (Zod).

```bash
curl -X PATCH http://localhost:3000/api/users/347/password \
 -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
 -d '{"newPassword":"NewPass123!","confirmPassword":"NewPass123!"}'
```

FE: after success, show toast, user can `POST /api/auth/login` with new password (still requires `isVerified=true`).

---

## 3) `POST /api/users/:id/reset-password`

Manually trigger reset flow (admin impersonates `RequestPasswordReset` for that user, even if `isVerified=false`? Current `ManageUsers.triggerResetPassword` does **not** check `isVerified` — it will send even for `isVerified=false`, unlike `POST /api/auth/forgot-password` which returns generic message for unverified. This is intentional for admin manual trigger.

```http
POST /api/users/347/reset-password
Authorization: Bearer <ADMIN_JWT>
Content-Type: application/json
{} // no body
```

*Flow*: `findById` → `404` if missing → `generateResetPasswordToken()` (64 hex, `crypto.randomBytes(32)`), `hashResetPasswordToken` (`sha256`), `getPasswordResetTokenExpiry()` (60m), `updateResetPasswordToken(userId, hash, expiresAt)` → `sendPasswordResetEmail(email, fullName, resetUrl)` where `resetUrl = ${FRONTEND_URL}/reset-password?token=${token}` (`FRONTEND_URL` from `.env`, default `http://localhost:5173`).

**Response** `200`:

```json
{ "message":"Password reset email sent" }
```

Errors: `400 Invalid user id`, `404 User not found`, `503 SMTP is not configured` (if `SMTP_HOST` empty, `NodemailerEmailService` throws).

```bash
curl -X POST http://localhost:3000/api/users/347/reset-password \
 -H "Authorization: Bearer $ADMIN_TOKEN"
```

FE: button “Send reset link” → toast `Password reset email sent`, no need to show token (check DB `users.reset_password_token` for QA).

---

## 4) `PATCH /api/users/:id/verify`

Manually verify/unverify (replaces requested `is_active`; clarified to use `isVerified` per product).

```http
PATCH /api/users/347/verify
Authorization: Bearer <JWT> # ROLE_ADMIN
Content-Type: application/json
{ "isVerified": true }   // or false to unverify
// Empty body {} defaults to true (verify) for convenience
```

*Controller* `UserController.ts: verifyUser` → `Number(id)` → `400 Invalid user id` if NaN → parse `verifySchema` (`z.object({isVerified:z.boolean()})`) if body non-empty else `true` → `ManageUsers.setVerified(userId, isVerified)` → `userRepository.setVerified(userId, bool)` (`update isVerified, clear verificationCode`, `DrizzleUserRepository.ts: setVerified`).

*Use-case*: `findById` → `404` if missing → `setVerified` → returns `User` (sanitized).

**Response** `200`:

```json
{ "message":"User verified successfully", "user":{ "id":347, "isVerified":true, "email":"...", "fullName":"..." } }
// or
{ "message":"User unverified successfully", "user":{ "id":347, "isVerified":false } }
```

After `isVerified:false`, `POST /api/auth/login` with that user → `403 {error:"Email not verified"}` (from `LoginUser.ts:21`).

```bash
# Verify
curl -X PATCH http://localhost:3000/api/users/347/verify \
 -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
 -d '{"isVerified":true}'
# Unverify
curl -X PATCH http://localhost:3000/api/users/347/verify \
 -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
 -d '{"isVerified":false}'
# Default (no body) → verify
curl -X PATCH http://localhost:3000/api/users/347/verify \
 -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
 -d '{}'
```

FE: toggle switch → `PATCH .../verify` → update table `isVerified` badge.

---

## 5) Types & Wiring

```ts
// Request GET /api/users
type GetUsersQuery = { search?:string; startDate?:string; endDate?:string; createdAtFrom?:string; createdAtTo?:string; isVerified?:boolean; page?:number; limit?:number };

// Response paginated
type PaginatedUsers = { data: (User & {student: Student|null})[]; pagination: { total:number; page:number; limit:number; totalPages:number } };
type UserWithStudent = User & { student: Student|null };

// PATCH /:id/password
type UpdatePasswordBody = { newPassword:string; confirmPassword?:string };

// POST /:id/reset-password — no body

// PATCH /:id/verify
type VerifyBody = { isVerified:boolean }; // optional, defaults true
```

Wiring `src/infrastructure/web/routes/userRoutes.ts` (manual DI, like other routes):
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
Mounted in `server.ts:13` as `app.use("/api/users", userRoutes)` (after `apiRateLimiter`, before `errorHandler`).

---

## 6) QA Checklist

- [ ] `GET /api/users` as `user` role → `403 Forbidden`; without token → `401`.
- [ ] `GET /api/users?search=Test` returns ilike `email` OR `fullName` (try `test@test.com` exact and `Test` case-insensitive).
- [ ] `GET /api/users?startDate=2026-08-01&endDate=2026-08-02` returns only users with `createdAt` in range (inclusive, `endDate` set to `23:59:59.999`); invalid date → `400 Invalid startDate`.
- [ ] `GET /api/users?isVerified=true` returns only verified, `?isVerified=false` only unverified, no param returns all.
- [ ] `GET /api/users?page=1&limit=10` returns `pagination: {total, page, limit, totalPages}` and `data` length `<=limit`; `page=2` returns next slice; `limit` clamped `1..100`, default `10`.
- [ ] Response includes `student` when `students.userId` exists, else `student:null`, never `passwordHash`, and is paginated `{data, pagination}`.
- [ ] `PATCH /:id/password` with `newPassword` <6 → `400`; missing `confirmPassword` mismatch → `400`; success → login with new password works (after `isVerified=true`).
- [ ] `POST /:id/reset-password` → `200` and DB `reset_password_token` set, email in `mailpit`/`mailhog` contains `FRONTEND_URL/reset-password?token=...`.
- [ ] `PATCH /:id/verify {isVerified:true}` → `isVerified:true`, login now `200`; `{isVerified:false}` → login `403 Email not verified`.
- [ ] `PATCH /:id/verify` with empty body → defaults verify `true`.

Delete this file after FE done.
