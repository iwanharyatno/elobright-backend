# Elobright Active Assessment Flow 

This document breaks down the standard assessment lifecycle dynamically mapped out from the frontend's perspective. It details how the frontend should securely initiate exam bounds, fetch user-safe questions natively without cheating, and record multi-modal inputs spanning multiple-choice, writing templates, and recorded audio safely.

---

## 1. Fetching Options (Without Cheating Hazards)

Before users attempt any specific Multiple Choice Questions (MCQ), the frontend needs to load the options conditionally. You **must not** rely on generic admin endpoints, as they expose the `isCorrect` toggles directly back inside JSON slices.

**Endpoint:** `GET /api/question-options/question/:questionId/attempt`  
**Authorization:** `Bearer Token` *(Role: `user`)*

This endpoint functions exactly like the administrative structure but utilizes object destructuring inside the controller to forcefully drop the `isCorrect` attribute, ensuring clients can render the A, B, C, D choices flawlessly without any local payload exploitation vulnerabilities!

---

## 2. Starting an Assessment

When a user legitimately clicks "Start Exam", your app must instantiate an ongoing tracking session. This establishes bounds, initializes scores natively at `0`, and records the localized limits.

**Endpoint:** `POST /api/exam-submissions/start`  
**Authorization:** `Bearer Token` *(Role: `user`)*  
**JSON Payload:**
```json
{
  "userId": 1,
  "examId": "exam_uuid-here",
  "timezone": "Asia/Jakarta" // recommended for exact localized dates
}
```

### Response Mechanics
- **Success (`201 OK`)**: Returns the `session` object. If `timezone` is provided, it securely computes the exact `endTimeLocale` formatted mathematically strictly adjusting standard configurations seamlessly (e.g. `"2026-04-01T20:30:20.965+07:00"`).
- **Graceful Resuming (`400 Bad Request`)**: If the user drops their wi-fi, exits randomly, and clicks "start" again while already engaging an active exam, the backend actively shoots back HTTP 400. However, instead of just an error string, **it returns the full exact existing session context** so your frontend can instantly parse, hydrate state, and seamlessly funnel the user securely right back exactly into their live exam bounds.

---

## 3. Submitting Individual Answers (The Upsert Loop)

Instead of stacking final questions in bulk, the system acts responsively using granular submission nodes guaranteeing no work is destroyed.

**Endpoint:** `POST /api/exam-submissions/:submissionId/answers`  
**Authorization:** `Bearer Token` *(Role: `user`)*  
**Encoding Format:** `multipart/form-data` *(Do not use `application/json`)*

### Dynamically Supported Modes
The endpoint natively tracks all components and applies active "Upsert" processing checking physical backend history allowing total rewrite capability!

1. **Multiple Choice Context (`selectedOptionId`)**  
   If an answer already exists for that user and question, it will physically replace the node safely. It intelligently calculates the delta scores automatically: 
   - Moving from a wrong option 👉 correct option = Score `+1`
   - Moving from a correct option 👉 wrong option = Score `-1`
   - Moving between parallel wrong options = Score `0`
   
2. **Writing Context (`textResponse`)**  
   Accepts standard Unicode/UTF texts from standard inputs cleanly overriding existing essays natively.

3. **Speaking Context (`audio`)**  
   Because Multer parses binary structures natively, you can seamlessly assign file payloads (like `.webm`, `.mp3` or `.m4a` output arrays dynamically pulled from Web Audio interfaces natively through mobile modules). Append it physically down standard File Form Data bindings mapped to the `"audio"` boundary keys!

---

## 4. Concluding the Exam

Once the user hits the ultimate completion threshold or finishes forcefully tracking inside your interface, you cap out tracking bounds mathematically securely!

**Endpoint:** `POST /api/exam-submissions/:submissionId/finish`  
**Authorization:** `Bearer Token` *(Role: `user`)*  
**JSON Payload:**
```json
{
  "timezone": "Asia/Jakarta" // Optional fallback context updates
}
```

### Safety and Time-Out Protocols (`400 Time Window Exceeded`)
Both the `recordAnswer` endpoint and the `finish` endpoint proactively fetch native timing matrices calculating bounds locally server side against the original initialized limits safely. If `new Date()` fires post the actual `endTimeLimit` matrix, it triggers a rigid `400 Bad Request` Exception guaranteeing zero post-deadline cheating bypasses safely lock down all responses rendering scores completely final!
