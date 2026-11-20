# Project Memory & Session State (MEMORY.md)
## Private Cloud Storage System (Cloud Computing Course Project)

> **What this document is and how to use it:**  
> This living memory document maintains continuous operational context, architectural decisions, environment specifications, active commands, and dated session changelogs across engineering iterations. Any contributor or AI agent starting a new session must read the "START HERE" block first.

---

## ⚡ START HERE (Current Context & State)

- **Current Phase:** All Phases (Phase 0 through Phase 7) — **100% COMPLETE & DEFENSE-READY**
- **Test Suite Status:** 11/11 Vitest test suites green, **63/63 tests passing** (4.84s run time).
- **Client Build Status:** Production client bundle cleanly compiled (`tsc && vite build`) with zero lint or TypeScript errors.
- **Active Services:** Embedded/native PostgreSQL on port 5432, Express API on port 5000, Vite client on port 5173.
- **Defense Artifacts:** Complete presentation defense script ([`DEMO.md`](file:///c:/Users/gaurj/OneDrive/SEM-5/Cloud_CP/docs/DEMO.md)), 25 viva questions & answers ([`VIVA.md`](file:///c:/Users/gaurj/OneDrive/SEM-5/Cloud_CP/docs/VIVA.md)), top-level [`README.md`](file:///c:/Users/gaurj/OneDrive/SEM-5/Cloud_CP/README.md), and automated disaster recovery script ([`scripts/backup.ps1`](file:///c:/Users/gaurj/OneDrive/SEM-5/Cloud_CP/scripts/backup.ps1)).

---

## 1. Key Decisions & Rationale

1. **Email OTP Authentication restricted to `@vit.edu`:**
   - *Rationale:* Aligns with academic institutional constraints. No arbitrary public signups. Passwords are eliminated in favor of time-limited (10 min) Argon2-hashed 6-digit OTPs.
2. **Local Disk Pool Partitioning under UUIDs with AES-256-GCM Envelope Encryption:**
   - *Rationale:* Files on disk (`/storage/vault/<uuid>.enc`) contain zero plain text and no readable filenames. Per-file 256-bit DEKs wrapped by the Master Key ensure multi-tenant cryptographic privacy even if host disk blocks are inspected directly.
3. **9-Stage Upload Defense Pipeline:**
   - *Rationale:* Untrusted student uploads pose risks of malware, zip bombs, and shell scripts. Staging uploads in `/storage/quarantine` and parsing archive central directories without extraction prevents denial of service before permanent commitment.
4. **PostgreSQL Row-Level Locking (`SELECT ... FOR UPDATE`) for Quota:**
   - *Rationale:* Concurrent requests by the same student could otherwise race and breach the 200 MB quota. Atomic database row locks guarantee strict quota enforcement.
5. **Full-Text Metadata Search over File Body Extraction:**
   - *Rationale:* Decrypting and indexing complete document bodies into a database creates an unencrypted plaintext shadow copy, undermining zero-knowledge envelope encryption. Searching filenames, tags, and MIME categories with `pg_trgm` maintains cryptographic privacy while delivering fast search.

---

## 2. Assumptions Made

1. **Single Laptop Host Deployment:** The 20 GB private storage pool is allocated on the host machine's physical storage volume at `./storage/vault`.
2. **ClamAV Fallback:** When running without Docker Desktop on the host machine, the antivirus service seamlessly utilizes an embedded signature scanner (detecting standard EICAR signatures and known payload patterns) to enable full evaluation of the security pipeline.
3. **Console OTP Emitter:** In development mode (`DEV_OTP_CONSOLE=true`), OTPs are printed to the terminal console so testing and viva defense can proceed without requiring an external SMTP relay.

---

## 3. Environment & Toolchain Details

- **Host OS:** Windows 11 (NT 10.0.26100)
- **Node.js Runtime:** v22.19.0
- **Package Manager:** npm v10.9.3
- **Git Version:** 2.51.0
- **Docker Status:** Docker Desktop CLI not present in host path; Docker Compose configs provided for containerized environments.
- **Default Application Ports:**
  - Client UI: `http://localhost:5173` (Vite dev server)
  - Backend API: `http://localhost:5000` (Express server)
  - PostgreSQL (when containerized): `localhost:5432`
  - ClamAV Daemon (when containerized): `localhost:3310`

---

## 4. Useful Commands Reference

### Development Startup (Local Mode)
```powershell
# Install root, server, and client dependencies
npm install

# Start backend server in development mode
npm run dev:server

# Start frontend client in development mode
npm run dev:client
```

### Database Operations (Prisma)
```powershell
# Generate Prisma Client
npx prisma generate --schema=./server/prisma/schema.prisma

# Run database migrations
npx prisma migrate dev --schema=./server/prisma/schema.prisma

# Seed demo students and initial data
npx prisma db seed
```

### Containerized Deployment (Docker)
```bash
# Launch entire stack (App + Postgres + ClamAV)
docker compose up -d --build

# View container logs
docker compose logs -f app
```

### Automated Testing
```powershell
# Run backend test suite
npm run test:server

# Run security pipeline test suite
npm run test:security
```

---

## 5. Project-Specific Glossary

- **DEK (Data Encryption Key):** A cryptographically random 256-bit symmetric key generated individually for each uploaded file object.
- **KEK / Master Key (Key Encryption Key):** A master 256-bit key stored as an environment variable used to wrap (encrypt) and unwrap per-file DEKs.
- **Envelope Encryption:** A two-tier cryptographic pattern where data is encrypted with a unique data key, which is itself encrypted with a master key.
- **Quarantine Staging:** An isolated filesystem directory (`/storage/quarantine`) where incoming uploads reside during the 9-stage verification pipeline before admission into the vault.
- **Vault:** The permanent encrypted storage location (`/storage/vault`) holding AES-256-GCM ciphertext objects named with UUIDs.
- **Zip-Slip:** A path-traversal vulnerability in archive unpackers where filenames like `../../etc/passwd` escape target directories.
- **Zip-Bomb:** A maliciously crafted archive with extreme compression ratios (e.g., 1000:1) designed to exhaust disk or memory when decompressed.
- **Disk Guard:** An automated health check that monitors available physical bytes on the storage pool and refuses uploads if free space falls below 1 GB.

---

## 6. Engineering Session Log & Changelog

### 2026-10-06 (Session 1: Phase 0 Initialization)
- Verified host toolchain: Node.js v22.19.0, npm 10.9.3, git 2.51.0. Identified that Docker CLI is not in host PATH; planned embedded fallback for antivirus scanner to ensure seamless evaluation.
- Authored initial draft of `docs/PRD.md`: Full scope, 14 functional requirements, acceptance criteria, multi-tenancy, and cloud computing concept mappings.
- Authored initial draft of `docs/ARCHITECTURE.md`: Complete system architecture, Mermaid diagrams for all 5 core request flows, 9-stage upload defense pipeline specifications, database schema, envelope encryption specs, and security test matrix.
- Authored initial draft of `docs/RULES.md`: Coding standards, TypeScript strict mode, security guardrails, forbidden practices, and Definition of Done.
- Authored initial draft of `docs/DESIGN.md`: UI design tokens, light/dark palettes, typography, spacing, component catalog, ASCII wireframes for all 5 primary views, and responsive breakpoints.
- Authored initial draft of `docs/TASKS.md`: Comprehensive breakdown of all 8 phases (Phases 0-7), tracking task IDs, dependencies, and file touches.
- Authored initial draft of `docs/MEMORY.md`: Captured environment state, architectural decisions, assumptions, and command reference.

### 2026-10-06 (Session 2: Phase 1 Authentication & RBAC Engine)
- Configured PostgreSQL relational data models in `server/prisma/schema.prisma` for Users, Files, Folders, Versions, Shares, AuditLogs, and QuarantineLogs.
- Configured embedded PostgreSQL 18 engine (`embedded-postgres`) for Windows native execution alongside Docker Compose definitions. Pushed schema cleanly with Prisma.
- Built `server/src/services/auth.service.ts` with strict `@vit.edu` domain regex validation, Argon2id OTP hashing, attempt lockout (max 3), and student account auto-provisioning with default 200 MB storage quota.
- Built `server/src/services/token.service.ts` with RFC 6819 Refresh Token Rotation in `httpOnly`, `Secure`, `SameSite=Strict` cookies.
- Built Express controllers and rate limiting middleware (`otpRequestLimiter`, `otpVerifyLimiter`, `generalApiLimiter`).
- Built React 18 + Tailwind CSS Login page with 6-digit PIN inputs, countdown timer, auto-focus, paste support, and `AuthContext`.
- Verified 7/7 automated tests passing in `server/tests/auth.test.ts` (SEC-01 non-VIT email rejection, OTP dispatch, attempt lockout, 200 MB provisioning, ADMIN role grant, unauthenticated route protection).
- Verified client production build passes TypeScript strict mode with zero errors.

### 2026-10-06 (Session 3: Phase 2 Core Storage & Concurrency & Phase 3 Security Pipeline)
- Built `quota.service.ts` utilizing PostgreSQL atomic row-level locks (`SELECT ... FOR UPDATE`) to prevent concurrent quota over-subscription race conditions.
- Built `folder.service.ts` handling hierarchical breadcrumbs, folder renaming, soft deletion cascades, and depth/circular loop prevention.
- Built resumable chunked streaming engine (`chunk.service.ts`) with Busboy multipart parser, handling chunk validation, hashing, and contiguous assembly.
- Built `client/src/components/files/FileBrowser.tsx` with breadcrumbs, drag-and-drop file ingestion, upload progress, grid/list view toggles, folder actions, and secure download triggers.
- Verified 9/9 automated tests passing across `tests/quota.test.ts` and `tests/folder.test.ts`.
- Implemented `crypto.service.ts`: AES-256-GCM envelope encryption, 256-bit DEK generation, master key wrapping, streaming decryption with GCM authentication tag verification.
- Implemented `archive.service.ts`: Central Directory safe inspection without decompressing; enforces $\le 100:1$ ratio, $\le 500$ MB uncompressed size, $\le 1,000$ entries, $\le 3$ nesting depth, and zip-slip path traversal prevention.
- Implemented `scanner.service.ts`: ClamAV daemon client with built-in EICAR standard signature evaluation fallback.
- Implemented `pipeline.service.ts`: 9-Stage upload defense pipeline with quarantine staging, magic-byte MIME type validation, Stage 8 encrypted vault commit, and Stage 9 rollback + quarantine audit logging.
- Implemented `diskGuard.ts` checking physical available bytes on host disk before upload ingestion.
- Verified all 8 crypto & pipeline tests passing (`tests/crypto.test.ts`, `tests/pipeline.test.ts`). Total test count: 24/24 tests green.

### 2026-10-07 (Session 4: Phase 4 Sharing, Versioning & Recycle Bin Lifecycle)
- Implemented `share.service.ts`, `share.controller.ts`, and `share.routes.ts`: High-entropy URL-safe share token generator (`crypto.randomBytes(24)`), bcrypt passcode hashing, time-bound link expirations, atomic download cap tracking with auto-deactivation, and segmented VIEW_ONLY / DOWNLOAD permissions.
- Implemented `version.service.ts`, `version.controller.ts`, and version routes: Automatic historical versioning on sequential overwrites, maximum 5-version retention with oldest version pruning, atomic quota locking (`SELECT ... FOR UPDATE`) during version reverts, and streamed decrypted downloads.
- Implemented `trash.service.ts`, `trash.controller.ts`, and `trash.routes.ts`: Soft deletion for files and recursive folder cascades, ~30-day auto-purge countdown metrics, collision-resistant restorations, and permanent hard deletion unlinking `.enc` files and refunding quota.
- Implemented `cleanup.job.ts`: Node-cron scheduled maintenance executing 2:00 AM daily 30-day auto-purges, orphan upload chunk cleanup (>24h), and expired share link deactivation.
- Built React components: `ShareModal.tsx`, `VersionHistoryModal.tsx`, `RecycleBin.tsx`, and standalone public portal `PublicShare.tsx` (`/share/:token`).
- Implemented BigInt JSON serialization polyfill globally on `BigInt.prototype.toJSON`.
- Verified all 20 Phase 4 tests passing: `tests/share.test.ts` (8/8), `tests/trash.test.ts` (8/8), `tests/version.test.ts` (4/4). Full test suite: 44/44 tests green.
- Verified clean production client bundle compilation (`tsc && vite build`) in 10.13s.

### 2026-10-07 (Session 5: Phases 5, 6 & 7 — Visibility, Hardening & Project Delivery)
- Implemented `search.service.ts`, `search.controller.ts`, and `search.routes.ts`: PostgreSQL trigram and full-text search with category, size, and date filters (`tests/search.test.ts` 4/4 passing).
- Implemented `analytics.service.ts`: Personal user quota breakdown, file category distribution, version overhead tracking, 14-day activity timeline, and global 20 GB dedicated pool metrics.
- Implemented `admin.service.ts`, `admin.controller.ts`, and `admin.routes.ts`: Full RBAC-protected administrative console, student roster, quota override engine (thesis grants/custom MB), quarantine threat resolution, and audit log CSV export streaming (`tests/admin.test.ts` 7/7 passing).
- Built frontend components:
  - `StorageAnalyticsModal.tsx`: Interactive Recharts donut category chart and 14-day activity velocity bar chart.
  - `AdminDashboard.tsx`: 20 GB dedicated pool health meter, student roster table with live Quota Adjuster, quarantine incident manager, and audit log table with CSV download.
  - `FilePreviewModal.tsx`: In-browser on-the-fly decrypted streaming viewer for PDFs, images, text, and media.
  - `ThemeContext.tsx`: Persistent dark/light mode engine with seamless system preference synchronization.
  - `FileBrowser.tsx`: Integrated search bar with category pills (Docs, Images, Media, Archives, Code), file preview triggers, and storage telemetry launcher.
  - `App.tsx`: Protected `/admin` routing and administrative console navigation.
- Implemented `tests/securitySelfAttack.test.ts`: 8-point automated penetration test suite verifying domain boundaries, cross-tenant isolation, admin RBAC escalation blocks, EICAR malware interception, zip-slip detection, share password enforcement, 200 MB hard quota limit, and envelope encryption integrity.
- Verified all 11 test suites passing (**63/63 tests green**).
- Built disaster recovery backup automation (`scripts/backup.ps1`) generating PostgreSQL database dumps, encrypted vault backups, and cryptographic SHA-256 manifests.
- Authored final defense and capstone deliverables: `docs/DEMO.md` (interactive demo script), `docs/VIVA.md` (25 technical viva Q&As), and top-level `README.md`. All 6 living docs synchronized.

