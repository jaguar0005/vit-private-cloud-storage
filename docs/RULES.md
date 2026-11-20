# Engineering Rules & Guidelines
## Private Cloud Storage System (Cloud Computing Course Project)

> **What this document is and how to use it:**  
> This rulebook establishes the non-negotiable coding standards, security guardrails, architectural constraints, and quality requirements for this codebase. Any code added or modified—by an AI pair programmer or human collaborator—must comply with every rule outlined herein.

---

## 1. General Principles

1. **Working Code First:** Never commit code with placeholder functions, empty stubs, or `TODO: implement later` comments in production pathways. Every feature must be functional, tested, and verifiable.
2. **Pedagogical Clarity:** Write expressive, self-documenting code. In complex security-critical sections (encryption, quota locks, zip inspection), include brief comments explaining *why* a particular defense mechanism was chosen.
3. **Defense-in-Depth:** Never rely on client-side validation alone. The client UI exists for user feedback; the server API must strictly enforce all security and business rules.

---

## 2. Coding Standards & TypeScript Discipline

### 2.1 TypeScript Strictness
- `strict: true` is enabled in all `tsconfig.json` configurations.
- **Never use `any`:** Use `unknown` with type narrowing, Discriminated Unions, or Zod schemas to parse untrusted input.
- Avoid non-null assertion operators (`!`) unless immediately preceded by an explicit verification check.
- All asynchronous functions must specify their return types as `Promise<T>`.

### 2.2 Backend Code Standards (Node.js 20 + Express)
- Async handlers must be wrapped in an error-handling utility or use Express 5 style async propagation to prevent unhandled promise rejections.
- Use explicit dependency injection or modular service singletons to allow easy mocking during unit testing.
- Secrets, credentials, and environment configurations must be loaded and parsed through a validated Zod schema in `src/config/index.ts` at startup. If any required variable is missing, the application must fail fast and abort.

### 2.3 Frontend Code Standards (React 18 + Tailwind CSS)
- Functional components with React Hooks exclusively; no class components.
- Use **TanStack Query (React Query)** for server-state management. Do not duplicate server data in local React component state.
- Keep components focused and modular: UI primitives (buttons, modals, inputs) live in `src/components/ui/`, feature components live in their respective subdirectories.
- Styling must use Tailwind CSS utility classes adhering to the project design system in `DESIGN.md`. Arbitrary hardcoded inline CSS is disallowed.

---

## 3. Naming Conventions

| Entity | Convention | Example |
|---|---|---|
| **TypeScript Files (General)** | kebab-case | `quota.service.ts`, `auth.controller.ts` |
| **React Component Files** | PascalCase | `FileBrowser.tsx`, `StorageGauge.tsx` |
| **Interfaces & Types** | PascalCase | `UserRecord`, `UploadSession`, `ShareOptions` |
| **Variables & Functions** | camelCase | `calculateRemainingQuota`, `handleFileDrop` |
| **Constants & Enums** | UPPER_SNAKE_CASE | `MAX_FILE_SIZE_BYTES`, `STORAGE_POOLS` |
| **Database Models (Prisma)** | PascalCase | `User`, `File`, `FileVersion`, `ShareLink` |
| **Database Columns** | snake_case | `used_bytes`, `sha256_hash`, `deleted_at` |
| **API Endpoints** | kebab-case, plural nouns | `/api/v1/files`, `/api/v1/share-links` |
| **CSS Classes (Custom)** | kebab-case | `.glass-panel`, `.upload-active` |

---

## 4. Security Rules & Guardrails (Non-Negotiable)

1. **Email Domain Enforcement:** Every signup and login request must be verified against the regex `^[a-zA-Z0-9._%+-]+@vit\.edu$` at the controller layer. Non-`@vit.edu` emails must be rejected with HTTP 400 immediately.
2. **Atomic Quota Reservation:** Quota must never be validated by a simple read followed by an uncoordinated write. Always wrap quota verification and reservation inside a database transaction utilizing PostgreSQL row-level locking (`SELECT ... FOR UPDATE`).
3. **No Plaintext File Names on Disk:** Raw physical files must be saved under unguessable UUIDs (`<uuid>.enc`) in `/storage/vault/`. Real filenames exist exclusively in the database.
4. **Mandatory Envelope Encryption:** Plaintext files must never be written to permanent disk storage. All permanent payloads must be encrypted with AES-256-GCM.
5. **No Blind Decompression:** Archive files (.zip) must never be extracted onto the host filesystem. Inspect only the Central Directory headers using stream parsers to evaluate ratios, file counts, and paths.
6. **Strict Download Headers:** File download endpoints must set:
   ```http
   Content-Disposition: attachment; filename="<sanitized_name>"
   X-Content-Type-Options: nosniff
   Cache-Control: private, no-transform
   ```
7. **Cross-Tenant IDOR Prevention:** Every file or folder query must include `WHERE id = :id AND user_id = :current_user_id` unless accessing a verified active share link.
8. **Cookie Security:** JWT access and refresh tokens must be stored solely in `httpOnly`, `Secure`, `SameSite=Strict` cookies. Never store tokens in `localStorage` or `sessionStorage`.

---

## 5. Error Handling & Structured Logging

### 5.1 Error Responses
All API error responses must adhere to a standardized JSON schema:
```json
{
  "success": false,
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "Upload exceeds your remaining quota of 42.5 MB.",
    "details": {
      "remainingBytes": 44564480,
      "attemptedBytes": 52428800
    }
  }
}
```

### 5.2 HTTP Status Code Usage
- `200 OK`: Request succeeded.
- `201 Created`: Resource created successfully (upload complete, folder created).
- `400 Bad Request`: Validation failure or malformed payload.
- `401 Unauthorized`: Missing or invalid session authentication.
- `403 Forbidden`: Authenticated user lacks permission for the resource.
- `404 Not Found`: Target resource does not exist or does not belong to the user.
- `409 Conflict`: Name collision (e.g., folder with identical name in directory).
- `410 Gone`: Expired share link or exhausted download limit.
- `422 Unprocessable Entity`: Security pipeline violation (malware detected, zip bomb, bad magic bytes).
- `429 Too Many Requests`: Rate limit or brute-force threshold exceeded.
- `507 Insufficient Storage`: Laptop storage pool free space fell below disk guard limit.

### 5.3 Logging Rules
- Logs must be structured in JSON format in production and colorized in development.
- Include a unique correlation ID (`X-Request-ID`) on every log entry for request tracing.
- **Never log sensitive data:** Passwords, OTP codes, master keys, JWT tokens, and user cookies must be redacted from log outputs.

---

## 6. Database Migrations & Prisma Guidelines

1. **Declarative Schema:** All database changes must originate in `prisma/schema.prisma`.
2. **Versioned Migrations:** Generate migrations using `npx prisma migrate dev --name <descriptive_name>`. Never manually alter the database schema without a corresponding migration script.
3. **Transaction Safety:** For multi-entity mutations (e.g., file upload + quota increment + audit log), wrap operations in `prisma.$transaction()`.
4. **Seed Script:** Maintain an idempotent `prisma/seed.ts` script providing default test accounts (`student@vit.edu`, `admin@vit.edu`) and baseline folders for evaluation.

---

## 7. Git Commit Message Conventions

Follow the **Conventional Commits** specification:
```
<type>(<scope>): <short description in present tense>

[optional body explaining motivation and context]

[optional footer with issue reference or breaking changes]
```

**Permitted Types:**
- `feat`: A new feature or user-facing capability.
- `fix`: A bug fix or patch.
- `docs`: Documentation updates or additions in `/docs`.
- `style`: Code style formatting (Prettier, linting) with no logic changes.
- `refactor`: Code refactoring with no behavior change.
- `test`: Adding or updating test suites.
- `chore`: Build scripts, dependencies, or configuration changes.

*Examples:*
- `feat(pipeline): implement safe zip central directory inspection`
- `fix(quota): resolve race condition in atomic row-locking query`
- `docs(prd): expand cloud computing concept mapping table`

---

## 8. Testing Requirements

A task or feature cannot be marked as `DONE` in `TASKS.md` until its corresponding automated tests are written and passing.

| Layer | Framework | Minimum Required Coverage |
|---|---|---|
| **Unit Tests** | Vitest | 100% of cryptographic routines, zip inspectors, and validation schemas |
| **Integration Tests** | Supertest + Vitest | All API endpoints, 9-stage pipeline edge cases, concurrency tests |
| **End-to-End (E2E)** | Playwright | Login flow, file upload, share creation, trash restore |

### Mandatory Test Checklist for Completion:
- [ ] Non-`@vit.edu` email rejected with 400.
- [ ] File upload exceeding 200 MB quota rejected with 400.
- [ ] Concurrent uploads cannot overshoot 200 MB user quota.
- [ ] EICAR test string blocked and quarantined with 422.
- [ ] Zip bomb (ratio > 100:1) blocked without extraction.
- [ ] Zip archive containing path-traversal entries blocked.
- [ ] Renamed executable (wrong magic bytes) blocked.
- [ ] Cross-tenant IDOR attack returns 403 or 404.
- [ ] Share links enforce expiration, passwords, and download counters.
- [ ] Restored files from Recycle Bin match their original SHA-256 hash.
- [ ] Physical files in `/storage/vault/` are confirmed to be encrypted ciphertext.

---

## 9. "Never Do This" List

1. **NEVER** store plain OTPs or plaintext passwords in the database.
2. **NEVER** commit secrets, private keys, or `.env` files to git.
3. **NEVER** trust client-supplied filenames or MIME types without server validation.
4. **NEVER** extract unknown archive files (.zip, .tar, .gz) onto the server disk.
5. **NEVER** expose database ports (5432) or ClamAV daemon ports (3310) to the public internet.
6. **NEVER** check user quota using non-atomic operations (`SELECT` then `UPDATE` without locks).
7. **NEVER** serve uploaded files directly through static Express middleware (`express.static`). All downloads must pass through authenticated streaming controllers.
8. **NEVER** leave orphaned temporary files in `/storage/quarantine` upon upload errors.

---

## 10. Definition of Done (DoD)

A task or phase is considered complete if and only if:
1. All functional requirements for that phase are implemented with clean, complete code.
2. Corresponding automated tests pass locally and in CI.
3. Code strictly complies with TypeScript `strict` mode and linting checks.
4. All 6 living documents in `/docs` (`PRD.md`, `ARCHITECTURE.md`, `RULES.md`, `DESIGN.md`, `TASKS.md`, `MEMORY.md`) are updated to reflect the current state.
5. A working demonstration step is verified and documented.
