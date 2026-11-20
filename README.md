# VIT Private Cloud Storage

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg?logo=node.js)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18.4-336791.svg?logo=postgresql)](https://www.postgresql.org/)
[![Security](https://img.shields.io/badge/Encryption-AES--256--GCM-red.svg)](https://en.wikipedia.org/wiki/Galois/Counter_Mode)
[![Tests](https://img.shields.io/badge/Tests-63%2F63%20Passing-brightgreen.svg)]()
[![License](https://img.shields.io/badge/License-Academic%20Capstone-orange.svg)]()

A high-security, multi-tenant Private Cloud Storage web application designed and built for a university Cloud Computing capstone project. Hosted entirely on a single host laptop acting as an on-premises cloud appliance, the system manages a dedicated **20 GB local disk storage pool**, enforces strict institutional access locked to **@vit.edu** domain accounts, provisions an atomic **200 MB personal quota** per student, and secures all stored assets using **AES-256-GCM envelope encryption** and a **zero-trust 9-stage upload defense pipeline**.

---

## Key Highlights

- **Dedicated Host Storage Pool:** Manages a physical 20 GB laptop disk partition with automated telemetry and capacity alerts.
- **Institutional Identity Boundary:** Locked to verified `@vit.edu` students via Argon2id-hashed OTPs and RFC 6819 token rotation with `httpOnly`, `SameSite=Strict` cookies.
- **Atomic Concurrency Row Locks:** Prevents quota race conditions via PostgreSQL `SELECT ... FOR UPDATE` row-level locks.
- **AES-256-GCM Envelope Encryption:** Unique 256-bit Data Encryption Key (DEK) per file, wrapped with the host Master Key (KEK). Zero plaintext stored on physical disk.
- **Zero-Trust 9-Stage Defense Pipeline:** Intercepts malware (ClamAV / EICAR), zip bombs (central directory ratio checks $\le 100:1$), zip slips (path traversal), and magic byte mismatches before data reaches the vault.
- **Sequential File Versioning:** Retains up to 5 historical versions with one-click rollbacks and atomic storage quota refunds.
- **Lifecycle Recycle Bin:** 30-day auto-purge countdown with collision-safe restoration (`(restored)`) and background cron cleanup.
- **Administrative Governance Console:** Real-time 20 GB pool telemetry, student quota overrides (thesis grants), quarantine threat management, and institutional audit trail with CSV streaming.
- **Interactive Storage Telemetry:** Donut category breakdowns and 14-day activity velocity charts powered by Recharts.

---

## Architecture Diagram

```mermaid
graph TD
    Client["Client Browser (React + Tailwind)"] -->|httpOnly Cookies / REST API| Gateway["Express 4 API Gateway (Port 5000)"]
    
    subgraph "Zero-Trust Upload Pipeline (9 Stages)"
        Gateway --> S1["Stage 1: Streaming Size Bound (100 MB)"]
        S1 --> S2["Stage 2: Extension Whitelist"]
        S2 --> S3["Stage 3: Magic Bytes Inspection"]
        S3 --> S4["Stage 4: ClamAV / EICAR Antivirus Scan"]
        S4 --> S5["Stage 5: Zip Bomb Central Directory Check"]
        S5 --> S6["Stage 6: Zip Slip Traversal Check"]
        S6 --> S7["Stage 7: Quota Row Lock (SELECT ... FOR UPDATE)"]
        S7 --> S8["Stage 8: AES-256-GCM Envelope Encryption"]
        S8 --> Vault["Encrypted Vault (/storage/vault/*.enc)"]
        S1 -.->|Violation| Quarantine["Quarantine Staging & Log (/storage/quarantine)"]
        S4 -.->|Violation| Quarantine
        S5 -.->|Violation| Quarantine
        S6 -.->|Violation| Quarantine
    end

    subgraph "Database Tier (Port 5432)"
        Gateway --> DB[(PostgreSQL 18.4 Engine)]
        DB --> Users["User & Quota Records"]
        DB --> Metadata["File & Wrapped DEK Records"]
        DB --> Audit["Tamper-Evident Audit Logs"]
    end
```

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite, Tailwind CSS, TanStack React Query, Recharts, Lucide Icons |
| **Backend** | Node.js 20+, Express 4, TypeScript 5.7, Busboy Streaming, Yauzl |
| **Database & ORM** | PostgreSQL 18.4, Prisma ORM, Trigram Full-Text Search (`pg_trgm`) |
| **Cryptography** | Node.js `node:crypto`, AES-256-GCM, Argon2id, Bcrypt, RFC 6819 Token Rotation |
| **Antivirus & Staging** | ClamAV Daemon (`clamscan`) with embedded EICAR signature validation |
| **Testing** | Vitest, Supertest (11 test suites, 63 passing tests) |

---

## Quick Start Guide

### Prerequisites
- **Node.js** v20.x or higher
- **npm** v10.x or higher
- **PostgreSQL 18** (running on port 5432, or use the automated embedded engine)

### 1. Installation
Clone the repository and install all dependencies:
```bash
git clone <repository-url>
cd Cloud_CP
npm install
npm run install:all
```

### 2. Environment Configuration
Copy `.env.example` to `.env` (pre-configured for local laptop execution):
```bash
cp .env.example .env
```

Key environment settings:
- `PORT=5000`
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vit_cloud_storage`
- `STORAGE_MASTER_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef` (256-bit KEK)
- `STORAGE_POOL_MAX_BYTES=21474836480` (20 GB host allocation ceiling)
- `ALLOWED_EMAIL_DOMAIN=vit.edu`

### 3. Database Migration
Run Prisma migrations to initialize the schema:
```bash
npm run prisma:generate
npm run prisma:migrate
```

### 4. Running the Application
Launch both backend and frontend development servers concurrently:
```bash
npm run dev
```
Or start them individually:
- **Backend API:** `npm run dev:server` (`http://localhost:5000`)
- **Frontend Client:** `npm run dev:client` (`http://localhost:5173`)

---

## Running Test Suites

The codebase includes **11 end-to-end and unit test suites with 63 automated tests**, covering all security policies, cryptographic operations, quota concurrency, and penetration attacks.

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Test Suite Matrix
- `tests/auth.test.ts` — OTP issuance, Argon2id verification, RFC 6819 token rotation, lockout.
- `tests/quota.test.ts` — PostgreSQL `SELECT ... FOR UPDATE` concurrency row locks, 200 MB quota bounds.
- `tests/folder.test.ts` — Folder tree hierarchy, breadcrumbs, circular nesting prevention.
- `tests/crypto.test.ts` — AES-256-GCM envelope encryption, DEK wrapping, streaming cipher.
- `tests/pipeline.test.ts` — 9-stage upload defense pipeline, ClamAV/EICAR, zip bomb, magic bytes.
- `tests/share.test.ts` — Share link expiration, bcrypt password protection, download limits.
- `tests/trash.test.ts` — Soft deletion, collision-safe restoration, permanent unlinking.
- `tests/version.test.ts` — Sequential version snapshotting, 5-version limit, oldest snapshot pruning.
- `tests/search.test.ts` — Full-text case-insensitive substring search, category filters, tenant isolation.
- `tests/admin.test.ts` — RBAC enforcement, quota overrides, quarantine resolution, CSV export.
- `tests/securitySelfAttack.test.ts` — Security penetration tests (domain boundary, cross-tenant isolation, zip-slip, privilege escalation).

---

## Disaster Recovery & Backup

Automated disaster recovery scripts are provided in `scripts/`:

```powershell
# Execute snapshot backup of PostgreSQL and encrypted vault
powershell -ExecutionPolicy Bypass -File .\scripts\backup.ps1
```
The script generates a timestamped bundle under `backups/vit_cloud_backup_<timestamp>/` containing:
- `database_dump.sql` (Full PostgreSQL database dump)
- `vault_storage/` (Encrypted `.enc` storage files)
- `BACKUP_MANIFEST.json` (Cryptographic SHA-256 manifest of all backup artifacts)

---

## Project Documentation & Academic Defense

Comprehensive technical documentation is maintained in `/docs`:
- [`PRD.md`](./docs/PRD.md) — Product Requirements Document.
- [`ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — High-level system architecture and component designs.
- [`RULES.md`](./docs/RULES.md) — System boundaries, constraints, and business logic rules.
- [`DESIGN.md`](./docs/DESIGN.md) — UI design tokens, component architecture, and interaction states.
- [`TASKS.md`](./docs/TASKS.md) — Implementation roadmap, milestone checklists, and progress tracking.
- [`MEMORY.md`](./docs/MEMORY.md) — Architectural memory, technical decisions, and gotchas.
- [`DEMO.md`](./docs/DEMO.md) — Step-by-step viva presentation and live defense script.
- [`VIVA.md`](./docs/VIVA.md) — 25 deep technical viva voce examination Q&As.

---

## License

Developed for the VIT Cloud Computing Capstone Course. Academic and educational use only.
