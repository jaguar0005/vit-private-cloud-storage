# Implementation Task Tracker (TASKS.md)
## Private Cloud Storage System (Cloud Computing Course Project)

> **What this document is and how to use it:**  
> This task tracker itemizes the end-to-end engineering roadmap across all 8 development phases (Phases 0 through 7). Each task possesses a unique ID, dependencies, status (`TODO`, `IN PROGRESS`, `DONE`, `BLOCKED`), and a record of touched files. As engineering progresses, statuses and phase summaries are updated continuously.

---

## Phase 0: Planning & Project Foundations

- [x] **TASK-001**: Author comprehensive Product Requirements Document ([`PRD.md`](file:///c:/Users/gaurj/OneDrive/SEM-5/Cloud_CP/docs/PRD.md)) covering multi-tenancy, quotas, upload pipeline, and cloud computing concept mappings.
  - *Dependencies:* None
  - *Status:* `DONE`
  - *Files Touched:* `docs/PRD.md`

- [x] **TASK-002**: Author System Architecture Document ([`ARCHITECTURE.md`](file:///c:/Users/gaurj/OneDrive/SEM-5/Cloud_CP/docs/ARCHITECTURE.md)) with Mermaid diagrams, 9-stage upload pipeline, cryptographic envelope specs, database schema, and concurrency design.
  - *Dependencies:* TASK-001
  - *Status:* `DONE`
  - *Files Touched:* `docs/ARCHITECTURE.md`

- [x] **TASK-003**: Author Engineering Rules & Security Guardrails ([`RULES.md`](file:///c:/Users/gaurj/OneDrive/SEM-5/Cloud_CP/docs/RULES.md)) defining TypeScript strictness, forbidden patterns, testing criteria, and Definition of Done.
  - *Dependencies:* TASK-002
  - *Status:* `DONE`
  - *Files Touched:* `docs/RULES.md`

- [x] **TASK-004**: Author UI/UX Design System & Wireframes ([`DESIGN.md`](file:///c:/Users/gaurj/OneDrive/SEM-5/Cloud_CP/docs/DESIGN.md)) with dark/light color tokens, ASCII layout wireframes, typography scales, and responsive guidelines.
  - *Dependencies:* TASK-001
  - *Status:* `DONE`
  - *Files Touched:* `docs/DESIGN.md`

- [x] **TASK-005**: Author initial Task Tracker ([`TASKS.md`](file:///c:/Users/gaurj/OneDrive/SEM-5/Cloud_CP/docs/TASKS.md)) itemizing all tasks and phase criteria.
  - *Dependencies:* None
  - *Status:* `DONE`
  - *Files Touched:* `docs/TASKS.md`

- [x] **TASK-006**: Author initial Running Context & Memory ([`MEMORY.md`](file:///c:/Users/gaurj/OneDrive/SEM-5/Cloud_CP/docs/MEMORY.md)) containing environment details, assumptions, decisions, and project glossary.
  - *Dependencies:* None
  - *Status:* `DONE`
  - *Files Touched:* `docs/MEMORY.md`

- [x] **TASK-007**: Initialize Monorepo Structure (`/server`, `/client`, `/docs`, `/storage`) with root configuration and scripts.
  - *Dependencies:* TASK-001 through TASK-006
  - *Status:* `DONE`
  - *Files Touched:* `package.json`, `.gitignore`, `server/package.json`, `client/package.json`, `server/tsconfig.json`, `client/tsconfig.json`

- [x] **TASK-008**: Author Docker Compose orchestration (`docker-compose.yml`), container definitions, and canonical environment configuration (`.env.example`).
  - *Dependencies:* TASK-007
  - *Status:* `DONE`
  - *Files Touched:* `docker-compose.yml`, `.env.example`, `.env`, `Dockerfile`

- [x] **TASK-009**: Implement Server Base Configuration module (`server/src/config/index.ts`) with Zod validation for storage limits, timeouts, disk guard thresholds, and OTP lifetimes.
  - *Dependencies:* TASK-007
  - *Status:* `DONE`
  - *Files Touched:* `server/src/config/index.ts`, `server/src/app.ts`, `server/src/index.ts`

### Phase 0 Summary
- **Built:** Initial drafts of all six living documents (`PRD.md`, `ARCHITECTURE.md`, `RULES.md`, `DESIGN.md`, `TASKS.md`, `MEMORY.md`), monorepo orchestration (`package.json`, workspaces for `server` and `client`), Docker Compose orchestration (`docker-compose.yml`), container file (`Dockerfile`), `.env.example` and local `.env` with 256-bit AES master key, validated configuration module (`server/src/config/index.ts`), Express app shell with Helmet and CORS, and Vite React 18 client shell with Tailwind CSS.
- **Tested:** Toolchain discovery (Node v22.19.0, npm 10.9.3, git 2.51.0), storage directory initialization, and configuration schema validation.
- **Remaining in Phase 0:** Complete. Ready for Phase 1 (Auth & Roles).

---

## Phase 1: Authentication, RBAC & Security Middleware

- [x] **TASK-101**: Define Prisma Schema (`prisma/schema.prisma`) for User, OTP, RefreshSession, and AuditLog with migrations.
  - *Dependencies:* TASK-007
  - *Status:* `DONE`
  - *Files Touched:* `server/prisma/schema.prisma`

- [x] **TASK-102**: Implement OTP Service (`server/src/services/auth.service.ts`) with `@vit.edu` domain validation, Argon2id hashing, and console dev-mode emitter.
  - *Dependencies:* TASK-101
  - *Status:* `DONE`
  - *Files Touched:* `server/src/services/auth.service.ts`, `server/src/utils/mailer.ts`

- [x] **TASK-103**: Implement JWT cookie management with Refresh Token Rotation and revocation families.
  - *Dependencies:* TASK-102
  - *Status:* `DONE`
  - *Files Touched:* `server/src/services/token.service.ts`

- [x] **TASK-104**: Implement Security Middleware: Helmet, strict CORS, express-rate-limit, and brute-force lockout.
  - *Dependencies:* TASK-103
  - *Status:* `DONE`
  - *Files Touched:* `server/src/middleware/rateLimit.middleware.ts`, `server/src/middleware/auth.middleware.ts`, `server/src/middleware/rbac.middleware.ts`

- [x] **TASK-105**: Build React Client Authentication UI: Login page with `@vit.edu` validator, OTP inputs, countdown timer, and AuthContext.
  - *Dependencies:* TASK-103
  - *Status:* `DONE`
  - *Files Touched:* `client/src/pages/Login.tsx`, `client/src/context/AuthContext.tsx`, `client/src/App.tsx`

- [x] **TASK-106**: Write automated tests for Auth (domain rejection, invalid OTP, rate-limit lockout, token rotation).
  - *Dependencies:* TASK-104, TASK-105
  - *Status:* `DONE`
  - *Files Touched:* `server/tests/auth.test.ts`

### Phase 1 Summary
- **Built:** Complete PostgreSQL schema with Prisma ORM; `@vit.edu` domain validation regex; Argon2id OTP hasher with dev console emitter; RFC 6819 Refresh Token Rotation in `httpOnly`, `Secure`, `SameSite=Strict` cookies; brute-force attempt lockout; RBAC roles (`STUDENT`, `ADMIN`); rate-limiting middleware; React 18 Login UI with 6-digit PIN input, countdown timer, and `AuthContext`; embedded native PostgreSQL engine (`EmbeddedPostgres`) for Windows standalone execution.
- **Tested:** Automated test suite (`server/tests/auth.test.ts`) executed with Vitest & Supertest: 7/7 tests passing (SEC-01 non-`@vit.edu` rejection, valid OTP dispatch, invalid OTP tracking, 3-attempt lockout, student 200 MB provisioning, admin role grant, unauthenticated route protection). Client production bundle built with Vite with zero errors.
- **Remaining:** Phase 2 (Core Storage: Folders, chunked streaming uploads, downloads, row-locking quota enforcement, and File Browser UI).

---

## Phase 2: Core Storage & File/Folder Management

- [x] **TASK-201**: Implement Prisma models for Folders, Files, and FileVersions.
  - *Dependencies:* TASK-101
  - *Status:* `DONE`
  - *Files Touched:* `server/prisma/schema.prisma`

- [x] **TASK-202**: Implement Atomic Quota Manager (`quota.service.ts`) using PostgreSQL row locks (`SELECT ... FOR UPDATE`).
  - *Dependencies:* TASK-201
  - *Status:* `DONE`
  - *Files Touched:* `server/src/services/quota.service.ts`

- [x] **TASK-203**: Implement Hierarchical Folder Controller (create, rename, move with circular check, delete).
  - *Dependencies:* TASK-201
  - *Status:* `DONE`
  - *Files Touched:* `server/src/services/folder.service.ts`, `server/src/controllers/folder.controller.ts`, `server/src/routes/folder.routes.ts`

- [x] **TASK-204**: Implement Resumable Chunked Streaming Upload and Assembly Engine (`chunk.service.ts`).
  - *Dependencies:* TASK-202
  - *Status:* `DONE`
  - *Files Touched:* `server/src/services/chunk.service.ts`, `server/src/controllers/upload.controller.ts`, `server/src/routes/file.routes.ts`

- [x] **TASK-205**: Build React File Browser UI (nested folders, breadcrumb navigation, drag-and-drop upload zone, multi-file upload progress).
  - *Dependencies:* TASK-203, TASK-204
  - *Status:* `DONE`
  - *Files Touched:* `client/src/components/files/FileBrowser.tsx`, `client/src/App.tsx`

- [x] **TASK-206**: Write automated tests for folder hierarchy and quota reservation under concurrency.
  - *Dependencies:* TASK-202, TASK-203
  - *Status:* `DONE`
  - *Files Touched:* `server/tests/quota.test.ts`, `server/tests/folder.test.ts`

### Phase 2 Summary
- **Built:** Atomic Quota Service with PostgreSQL `SELECT ... FOR UPDATE` row-level locking; Hierarchical Folder Service with circular dependency checks, breadcrumb trail generator, and recursive soft-deletion; Resumable chunked streaming upload engine with Busboy; Download streaming with security headers (`nosniff`, `attachment`); React 18 File Browser with interactive breadcrumbs, drag-and-drop file ingestion, progress indicator, grid/table views, and folder creation/renaming modals.
- **Tested:** All 9 automated tests passing across `tests/quota.test.ts` and `tests/folder.test.ts`: SEC-02 quota rejection (>200 MB), SEC-03 concurrency race condition prevention (concurrent 120 MB uploads strictly capped at 200 MB), quota release/refunds, folder nesting, breadcrumb trail fidelity, circular loop blocking, and cascading deletions. Client production bundle compiled with zero errors in 9.4s.
- **Remaining:** Phase 3 (Security Layer: AES-256-GCM envelope encryption, 9-stage upload defense pipeline, safe ZIP central directory inspection, ClamAV/EICAR antivirus engine, disk guard).

---

## Phase 3: 9-Stage Upload Defense Pipeline & Cryptography

- [x] **TASK-301**: Implement Cryptography Service (`crypto.service.ts`) with AES-256-GCM envelope encryption, key wrapping, and IV generation.
  - *Dependencies:* TASK-201
  - *Status:* `DONE`
  - *Files Touched:* `server/src/services/crypto.service.ts`

- [x] **TASK-302**: Implement Safe Archive Central Directory Inspector (`archive.service.ts`) detecting zip bombs, zip slips, and deep nesting without extracting.
  - *Dependencies:* None
  - *Status:* `DONE`
  - *Files Touched:* `server/src/services/archive.service.ts`

- [x] **TASK-303**: Implement Antivirus Scanner Service (`scanner.service.ts`) with ClamAV daemon socket client and EICAR signature fallback.
  - *Dependencies:* None
  - *Status:* `DONE`
  - *Files Touched:* `server/src/services/scanner.service.ts`

- [x] **TASK-304**: Assemble full 9-stage Pipeline Engine (`pipeline.service.ts`) with quarantine directory staging, magic-bytes checks, rollback on error, and quarantine logging.
  - *Dependencies:* TASK-301, TASK-302, TASK-303
  - *Status:* `DONE`
  - *Files Touched:* `server/src/services/pipeline.service.ts`

- [x] **TASK-305**: Implement Disk Guard middleware monitoring physical laptop pool capacity (< 1 GB free).
  - *Dependencies:* TASK-304
  - *Status:* `DONE`
  - *Files Touched:* `server/src/middleware/diskGuard.ts`

- [x] **TASK-306**: Write automated security test suite (EICAR, zip bomb, zip slip, renamed executable magic byte mismatch, envelope ciphertext check).
  - *Dependencies:* TASK-304
  - *Status:* `DONE`
  - *Files Touched:* `server/tests/pipeline.test.ts`, `server/tests/crypto.test.ts`

### Phase 3 Summary
- **Built:** AES-256-GCM envelope encryption system (`crypto.service.ts`) generating unique 256-bit DEKs per file wrapped by master key; Safe archive central directory inspector (`archive.service.ts`) evaluating uncompressed size ($\le 500$ MB), compression ratio ($\le 100:1$), entry count ($\le 1,000$), folder depth ($\le 3$), zip-slip traversals (`../`), and encryption detection without decompressing; Antivirus scanner (`scanner.service.ts`) supporting ClamAV TCP daemon with built-in EICAR standard test signature fallback; 9-Stage upload defense pipeline (`pipeline.service.ts`) orchestrating Stage 1 auth/quota to Stage 8 encrypted commit and Stage 9 rollback with quarantine logging; Disk guard middleware (`diskGuard.ts`) protecting laptop storage pool.
- **Tested:** All 8 security tests passing across `tests/crypto.test.ts` (SEC-10 ciphertext randomness check, AES-GCM tag tampering detection) and `tests/pipeline.test.ts` (SEC-04 EICAR malware rejection & quarantine logging, SEC-05 Zip bomb compression ratio block, SEC-06 Zip slip traversal block, SEC-07 magic byte executable mismatch rejection, forbidden extension block, valid file 9-stage vault admission).
- **Remaining:** Phase 4 (Sharing, Versioning & Recycle Bin Lifecycle), Phase 5 (Visibility, Search & Admin Console), Phase 6 (Polish & Hardening), Phase 7 (Delivery & Viva Prep).

---

## Phase 4: Sharing, Versioning & Recycle Bin Lifecycle

- [x] **TASK-401**: Implement Share Link Service (`share.service.ts`) with expiring cryptographic tokens, bcrypt passwords, download limits, and permissions.
  - *Dependencies:* TASK-201
  - *Status:* `DONE`
  - *Files Touched:* `server/src/services/share.service.ts`, `server/src/controllers/share.controller.ts`, `server/src/routes/share.routes.ts`

- [x] **TASK-402**: Implement File Versioning Service (retaining up to 5 historical versions per file).
  - *Dependencies:* TASK-304
  - *Status:* `DONE`
  - *Files Touched:* `server/src/services/version.service.ts`, `server/src/controllers/version.controller.ts`, `server/src/routes/file.routes.ts`

- [x] **TASK-403**: Implement Recycle Bin soft-delete, restore with collision handling, and permanent purge.
  - *Dependencies:* TASK-201
  - *Status:* `DONE`
  - *Files Touched:* `server/src/services/trash.service.ts`, `server/src/controllers/trash.controller.ts`, `server/src/routes/trash.routes.ts`

- [x] **TASK-404**: Configure `node-cron` scheduled jobs (30-day trash auto-purge, orphan chunk cleanup, expired share deactivation).
  - *Dependencies:* TASK-401, TASK-403
  - *Status:* `DONE`
  - *Files Touched:* `server/src/jobs/cleanup.job.ts`, `server/src/index.ts`

- [x] **TASK-405**: Build Frontend UI for Share Modal, Version History Drawer, and Recycle Bin page.
  - *Dependencies:* TASK-401, TASK-402, TASK-403
  - *Status:* `DONE`
  - *Files Touched:* `client/src/components/files/ShareModal.tsx`, `client/src/components/files/VersionHistoryModal.tsx`, `client/src/components/files/RecycleBin.tsx`, `client/src/pages/PublicShare.tsx`, `client/src/components/files/FileBrowser.tsx`, `client/src/App.tsx`

- [x] **TASK-406**: Write automated tests for share limits/passwords, version retention, and trash restoration hash matching.
  - *Dependencies:* TASK-401, TASK-403
  - *Status:* `DONE`
  - *Files Touched:* `server/tests/share.test.ts`, `server/tests/trash.test.ts`, `server/tests/version.test.ts`

### Phase 4 Summary
- **Built:** Cryptographic sharing engine (`share.service.ts`, `share.controller.ts`) supporting URL-safe tokens, bcrypt passcode hashing, time-bound expirations, download limit caps, and segmented VIEW_ONLY / DOWNLOAD permissions; Multi-version file history engine (`version.service.ts`, `version.controller.ts`) retaining up to 5 historical versions per file with atomic row-level quota locking during version revert and automatic pruning; Recycle Bin lifecycle engine (`trash.service.ts`, `trash.controller.ts`) featuring soft-deletes, collision-resistant restorations, permanent ciphertext purging, and user quota refunds; Background scheduled tasks (`cleanup.job.ts`) for 30-day auto-purges, orphan upload chunk cleaning, and expired link deactivation; React 18 frontend interfaces: `ShareModal.tsx`, `VersionHistoryModal.tsx`, `RecycleBin.tsx`, and public access portal `PublicShare.tsx`.
- **Tested:** All 20 automated tests passing across `tests/share.test.ts` (8/8: SEC-08 expiration enforcement, SEC-09 download limits, passcode verification, view-only checks, link revocation), `tests/trash.test.ts` (8/8: soft deletion, ~30-day countdowns, collision resolution, folder cascading, permanent purge, empty trash, 30-day auto-purge job), and `tests/version.test.ts` (4/4: sequential overwriting, downloading historical versions, reverting to previous versions, 5-version retention limit pruning). Full backend test suite passing with 44/44 tests green. Client production bundle compiled cleanly in 10.13s.
- **Remaining:** Phase 5 (Visibility, Search & Admin Console), Phase 6 (Polish & Hardening), Phase 7 (Delivery & Viva Prep).

---

## Phase 5: Visibility, Search & Administrative Console

- [x] **TASK-501**: Implement PostgreSQL Full-Text Search and Trigram similarity (`search.service.ts`, `search.controller.ts`, `search.routes.ts`) with category, size, and date filters.
  - *Dependencies:* TASK-201
  - *Status:* `DONE`
  - *Files Touched:* `server/src/services/search.service.ts`, `server/src/controllers/search.controller.ts`, `server/src/routes/search.routes.ts`, `server/src/app.ts`, `server/tests/search.test.ts`

- [x] **TASK-502**: Implement Storage Analytics Service providing personal user quota breakdown and global 20 GB pool health metrics.
  - *Dependencies:* TASK-201
  - *Status:* `DONE`
  - *Files Touched:* `server/src/services/analytics.service.ts`, `server/src/controllers/analytics.controller.ts`, `server/src/routes/analytics.routes.ts`, `server/src/app.ts`

- [x] **TASK-503**: Implement Admin Console Controller (user management, quota overrides, quarantine queue resolution, CSV audit export).
  - *Dependencies:* TASK-104, TASK-304
  - *Status:* `DONE`
  - *Files Touched:* `server/src/services/admin.service.ts`, `server/src/controllers/admin.controller.ts`, `server/src/routes/admin.routes.ts`, `server/src/app.ts`, `server/tests/admin.test.ts`

- [x] **TASK-504**: Implement In-Browser Decrypted Preview Controllers (Images, PDFs, Text/Code, Audio, Video).
  - *Dependencies:* TASK-301
  - *Status:* `DONE`
  - *Files Touched:* `client/src/components/files/FilePreviewModal.tsx`, `server/src/controllers/download.controller.ts`

- [x] **TASK-505**: Build Frontend Analytics Dashboard (Recharts), Universal Search bar, Admin Panel, and Preview Modal.
  - *Dependencies:* TASK-501, TASK-502, TASK-503, TASK-504
  - *Status:* `DONE`
  - *Files Touched:* `client/src/components/analytics/StorageAnalyticsModal.tsx`, `client/src/pages/AdminDashboard.tsx`, `client/src/components/files/FileBrowser.tsx`, `client/src/App.tsx`

### Phase 5 Summary
- **Built:** Substring case-insensitive full-text and trigram search engine with category filters (Documents, Images, Media, Archives, Code); Personal storage analytics service with category donut chart and 14-day velocity timeline; Global 20 GB host storage pool telemetry service; Institutional administrative console (`admin.controller.ts`, `AdminDashboard.tsx`) with student quota adjusters (thesis grants / custom MB), quarantine threat resolution, and audit log CSV export streaming; In-browser decrypted file preview modal supporting PDF, images, text, and audio/video streaming.
- **Tested:** `server/tests/search.test.ts` (4/4 passing) and `server/tests/admin.test.ts` (7/7 passing). Client production bundle cleanly compiled.

---

## Phase 6: Polish, Hardening & Security Audit

- [x] **TASK-601**: Implement Dark Mode / Light Mode theming engine and persistence.
  - *Dependencies:* TASK-004
  - *Status:* `DONE`
  - *Files Touched:* `client/src/context/ThemeContext.tsx`, `client/src/App.tsx`, `client/src/pages/AdminDashboard.tsx`

- [x] **TASK-602**: Execute Mobile Viewport optimization pass (responsive grid/table toggles, touch-friendly dialogs, responsive cards).
  - *Dependencies:* TASK-205, TASK-505
  - *Status:* `DONE`
  - *Files Touched:* `client/src/components/files/FileBrowser.tsx`, `client/src/App.tsx`, `client/src/pages/AdminDashboard.tsx`

- [x] **TASK-603**: Implement Filter Pills and Universal Search Toolbar with dynamic category switching.
  - *Dependencies:* TASK-205, TASK-501
  - *Status:* `DONE`
  - *Files Touched:* `client/src/components/files/FileBrowser.tsx`

- [x] **TASK-604**: Execute Security Self-Attack Penetration Suite (Domain breach, IDOR tenant isolation, vertical RBAC escalation, EICAR malware staging, Zip-Slip traversal, password bypass, 200 MB quota breach, envelope decryption integrity).
  - *Dependencies:* All previous
  - *Status:* `DONE`
  - *Files Touched:* `server/tests/securitySelfAttack.test.ts`

### Phase 6 Summary
- **Built:** Persistent ThemeContext for dynamic Dark/Light mode switching; Mobile responsive optimizations across file browser, admin dashboard, and modals; Category filter pills and instant search toolbar; Comprehensive Security Self-Attack penetration suite validating 8 major threat vectors.
- **Tested:** `server/tests/securitySelfAttack.test.ts` (8/8 passing). Total backend test suite now at 11 test files and 63/63 passing tests.

---

## Phase 7: Delivery, Presentation & Viva Preparation

- [x] **TASK-701**: Author Interactive Presentation Script ([`DEMO.md`](file:///c:/Users/gaurj/OneDrive/SEM-5/Cloud_CP/docs/DEMO.md)) with exact click-through steps and live attack demonstration.
  - *Dependencies:* All phases complete
  - *Status:* `DONE`
  - *Files Touched:* `docs/DEMO.md`

- [x] **TASK-702**: Author Viva Examination Defense Guide ([`VIVA.md`](file:///c:/Users/gaurj/OneDrive/SEM-5/Cloud_CP/docs/VIVA.md)) with 25 challenging questions and answers.
  - *Dependencies:* All phases complete
  - *Status:* `DONE`
  - *Files Touched:* `docs/VIVA.md`

- [x] **TASK-703**: Author Comprehensive Top-Level Documentation ([`README.md`](file:///c:/Users/gaurj/OneDrive/SEM-5/Cloud_CP/README.md)) with quickstart guide, architecture diagrams, and security matrix.
  - *Dependencies:* All phases complete
  - *Status:* `DONE`
  - *Files Touched:* `README.md`

- [x] **TASK-704**: Author Database and Storage Backup Script (`scripts/backup.ps1`) with PostgreSQL dump, encrypted vault snapshot, and SHA-256 manifest.
  - *Dependencies:* None
  - *Status:* `DONE`
  - *Files Touched:* `scripts/backup.ps1`

- [x] **TASK-705**: Run full end-to-end verification and compile Final Project Delivery Status across all 6 living docs.
  - *Dependencies:* All tasks
  - *Status:* `DONE`
  - *Files Touched:* `docs/TASKS.md`, `docs/MEMORY.md`, `docs/ARCHITECTURE.md`, `docs/PRD.md`

### Phase 7 Summary
- **Built:** `docs/DEMO.md` presentation script, `docs/VIVA.md` 25-question examination guide, top-level `README.md` capstone guide, PowerShell disaster recovery backup script `scripts/backup.ps1`, and completed updates across all living docs.
- **Verification:** 11 Vitest test suites, 63/63 passing tests; Client builds cleanly (`tsc && vite build`); Embedded PostgreSQL engine running on 5432; Backend active on 5000; Frontend active on 5173. Project is 100% complete and defense-ready!
