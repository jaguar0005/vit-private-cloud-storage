# Product Requirements Document (PRD)
## Private Cloud Storage System (Cloud Computing Course Project)

> **What this document is and how to use it:**  
> This Product Requirements Document (PRD) defines the purpose, target users, functional specifications, security mandates, and non-functional requirements for the Private Cloud Storage platform. It serves as the single source of truth for all product scope decisions and illustrates how academic cloud computing concepts (multi-tenancy, resource metering, isolation, security pipelines) translate into practical software architecture.

---

## 1. Problem Statement & Motivation

University students frequently require dependable, privacy-focused storage to store course materials, programming assignments, datasets, and project archives. Standard public cloud solutions (e.g., Google Drive, Dropbox, OneDrive) present notable educational and operational hurdles:
1. **Lack of Institutional Isolation:** Files are stored on commercial multi-tenant infrastructure outside institutional governance.
2. **Resource Opacity:** Students and administrators have zero visibility into actual disk pool health, encryption key lifecycles, and underlying multi-tenant quota enforcement.
3. **Security Vulnerabilities:** Blind file-upload mechanisms in academic environments risk malware propagation, zip bombs, and unauthorized script execution.
4. **Pedagogical Gap:** Understanding how cloud storage systems actually meter storage, enforce atomic concurrency locks, implement envelope encryption, and sanitize untrusted payloads requires building a dedicated, fully instrumented private cloud.

This project delivers a **Private Cloud Storage Web Application** hosted on a single server/laptop, partitioning a designated **20 GB physical disk pool** into virtualized, strictly metered **200 MB personal quotas** for authenticated students possessing institutional `@vit.edu` email credentials.

---

## 2. Goals and Non-Goals

### 2.1 Goals
- **Institutional Domain Lockout:** Restrict user onboarding and authentication strictly to verified `@vit.edu` accounts via cryptographically secure Email One-Time Passwords (OTP).
- **Strict Multi-Tenancy & Quota Metering:** Provide each student with exactly 200 MB of isolated storage, enforced atomically at the database and filesystem levels so concurrent uploads cannot breach boundaries.
- **Defense-in-Depth Upload Security Pipeline:** Execute a 9-stage verification pipeline before committing any file to permanent storage (file size bounds, atomic quota reservations, quarantine staging, extension allowlisting, magic-byte inspection, zip-bomb/path-traversal protection, and antivirus scanning).
- **Cryptographic Privacy:** Store all files encrypted at rest using AES-256-GCM envelope encryption with per-file Data Encryption Keys (DEKs) wrapped by a master key.
- **Granular Collaboration & Lifecycle Controls:** Support time-limited, password-protected, download-capped share links, soft-delete with a 30-day auto-purge Recycle Bin, and up to 5 historical versions per file.
- **Administrative Observability:** Provide real-time dashboards for storage pool utilization, quarantine inspections, user quota overrides, and immutable audit logging.

### 2.2 Non-Goals
- **Real-Time Collaborative Editing:** Document editing (such as Google Docs concurrent typing) is out of scope; files are uploaded, versioned, previewed, and downloaded as discrete objects.
- **Multi-Server Distributed Consensus:** Clustering algorithms (e.g., Raft, Paxos) and multi-node S3 replication are out of scope; the system runs as a hardened single-node private cloud instance.
- **Public / Unauthenticated Signups:** Non-`@vit.edu` accounts are strictly disallowed at both the reverse proxy and application controller layers.
- **Native Mobile Apps:** No separate iOS/Android binary is produced; a responsive Progressive Web UI optimized for smartphone viewports serves mobile clients.

---

## 3. User Personas & Role-Based Access Control (RBAC)

### 3.1 User Personas
1. **Aditi (Student - General User):**
   - **Needs:** Upload code archives, PDF lecture slides, and project diagrams; preview lecture notes on her phone; share zip archives with teammates via expiring password-protected links.
   - **Constraints:** Limited to a 200 MB personal quota; cannot upload executable files or scripts.
2. **Prof. Sharma (Faculty / Academic Admin):**
   - **Needs:** Supervise the 20 GB laptop storage pool; view real-time pool metrics; review quarantined files triggered by security alerts; inspect audit logs for anomalous activity; adjust student quota allowances for specific research projects.

### 3.2 Permission Matrix

| Capability / Feature | Student (`STUDENT`) | Administrator (`ADMIN`) | Anonymous / Guest |
|---|:---:|:---:|:---:|
| Request Login OTP (`@vit.edu`) | Yes | Yes | Yes |
| Request Login OTP (Non-`@vit.edu`) | **Blocked (403)** | **Blocked (403)** | **Blocked (403)** |
| Complete 2FA Login Session | Yes | Yes | No |
| Upload Files (within 200 MB limit) | Yes | Yes (Configurable Quota) | No |
| Create, Rename, Move, Delete Folders | Yes (Own root) | Yes (Own root) | No |
| Soft-Delete & Restore Files (Recycle Bin) | Yes (Own items) | Yes (Own items) | No |
| Permanent Delete Files | Yes (Own items) | Yes (Own items) | No |
| Access Public Share Links | Yes | Yes | Yes (Token + Pwd) |
| Create / Revoke Share Links | Yes (Own files) | Yes (Own files) | No |
| View Storage Dashboard (Personal) | Yes (200 MB meter) | Yes (Personal meter) | No |
| View System Dashboard (20 GB Pool) | No | Yes | No |
| Review / Resolve Quarantine Queue | No | Yes | No |
| User Management & Quota Overrides | No | Yes | No |
| Export System Audit Logs (CSV) | No | Yes | No |

---

## 4. Numbered Functional Requirements

### FR-01: Institutional Email OTP Authentication & 2FA
- **Description:** Users register and log in solely using email addresses ending in `@vit.edu`. The system generates a cryptographically random 6-digit numeric One-Time Password (OTP) with an expiration time of 10 minutes.
- **Acceptance Criteria:**
  1. Emails not matching the regex `^[a-zA-Z0-9._%+-]+@vit\.edu$` are rejected with HTTP 400 Bad Request before database querying.
  2. OTPs are hashed using argon2 or scrypt before storage; plain OTPs are never stored in the database.
  3. Max 3 OTP attempts per code; after 3 failed attempts, the code is invalidated.
  4. In development mode (`DEV_OTP_CONSOLE=true`), the OTP is logged to `stdout` for rapid testing without SMTP credentials.
  5. Upon OTP verification, two JSON Web Tokens (Access Token: 15-min expiry; Refresh Token: 7-day expiry) are issued as `httpOnly`, `Secure`, `SameSite=Strict` cookies.
  6. Refresh token rotation is strictly enforced: reusing an old refresh token revokes all active sessions for that user family.

### FR-02: Storage Pool & Personal Quota Management
- **Description:** Enforce a hard 20 GB server-wide storage pool threshold and a default 200 MB quota per student.
- **Acceptance Criteria:**
  1. Each student record tracks `quota_bytes` (default: 209,715,200 bytes) and `used_bytes`.
  2. The server monitors available disk space on the physical volume; if free space drops below `DISK_GUARD_THRESHOLD_MB` (default: 1024 MB / 1 GB), all upload requests are rejected with HTTP 507 Insufficient Storage.
  3. Quota calculation encompasses all active files, historical versions, and items currently in the Recycle Bin.
  4. Quota reservation occurs inside an atomic transaction using database row-level locking (`SELECT ... FOR UPDATE`) before streaming data to disk.

### FR-03: Hierarchical Folder Management
- **Description:** Provide a virtual directory hierarchy allowing nested folders, renaming, moving, and breadcrumb navigation.
- **Acceptance Criteria:**
  1. Folders support unlimited nesting depth (up to practical path limits of 20 levels).
  2. Deleting a folder recursively moves all child files and subfolders into the Recycle Bin.
  3. Circular folder movements (moving a folder inside one of its own descendants) are blocked with HTTP 400.
  4. Folder names are sanitized to prevent illegal filesystem characters (`/`, `\`, `..`, `:`, `*`, `?`, `"`, `<`, `>`, `|`).

### FR-04: Resumable, Chunked File Streaming Upload
- **Description:** Enable users to upload files of arbitrary permitted sizes via chunked, resumable streams with client-side progress reporting.
- **Acceptance Criteria:**
  1. Client partitions files into configurable chunks (e.g., 5 MB per chunk) with an upload session ID.
  2. Server verifies chunk checksums and assembles chunks in a dedicated temporary staging directory.
  3. File streaming enforces the individual file size limit and personal quota during streaming, aborting immediately if limits are breached.
  4. Aborted or interrupted uploads clean up orphaned chunks automatically after 24 hours.

### FR-05: 9-Stage Upload Defense Pipeline
- **Description:** Every upload undergoes a strict 9-phase verification sequence prior to permanent admission.
- **Acceptance Criteria:**
  1. **Stage 1 (Streaming Size Limit):** Terminate connection if file stream exceeds user remaining quota or max file size.
  2. **Stage 2 (Atomic Quota Reservation):** Lock user row, verify `used_bytes + incoming_bytes <= quota_bytes`, add reservation.
  3. **Stage 3 (Quarantine Ingestion):** Write file exclusively to isolated quarantine directory `/storage/quarantine/`.
  4. **Stage 4 (Extension Allowlist):** Reject forbidden extensions (`.exe`, `.bat`, `.cmd`, `.sh`, `.ps1`, `.msi`, `.js`, `.vbs`, `.jar`, `.scr`, `.dll`, `.com`, `.hta`, `.pif`, `.reg`).
  5. **Stage 5 (Magic Bytes Verification):** Inspect file headers using `file-type` buffer matching. Reject mismatches (e.g., an `.exe` renamed to `.pdf`).
  6. **Stage 6 (Archive Safe Inspection):** Inspect ZIP central directory without decompressing. Reject if uncompressed size > 500 MB, compression ratio > 100:1, file count > 1,000, nesting depth > 3, password-protected, or entries contain path traversal (`../`).
  7. **Stage 7 (Antivirus Scan):** Send file to ClamAV daemon (`clamd`). If ClamAV is unavailable in dev, use the EICAR test string signature fallback.
  8. **Stage 8 (Envelope Encryption & Relocation):** Generate 256-bit AES DEK, encrypt file via AES-256-GCM, wrap DEK with Master Key, write ciphertext to `/storage/vault/<uuid>`, compute SHA-256 digest, commit database record, and update `used_bytes`.
  9. **Stage 9 (Rollback on Failure):** If any stage fails, delete temporary files, release quota reservation, record quarantine entry with failure reason, and return descriptive HTTP 422 error.

### FR-06: Envelope Encryption at Rest
- **Description:** Files stored on physical disk must be completely unreadable ciphertext, protected by envelope encryption.
- **Acceptance Criteria:**
  1. Physical file on disk is encrypted using AES-256-GCM with a unique 96-bit Initialization Vector (IV) and 128-bit Authentication Tag.
  2. The Data Encryption Key (DEK) is generated using `crypto.randomBytes(32)` for each file.
  3. The DEK is encrypted (wrapped) with the application Master Key (`STORAGE_MASTER_KEY` from `.env`) and stored in the database.
  4. Raw plaintext files are never stored on permanent storage. Direct file access on the host reveals only scrambled ciphertext.

### FR-07: Secure Download & Browser Preview
- **Description:** Allow authorized users to stream and preview or download files with strict security headers.
- **Acceptance Criteria:**
  1. Server streams decrypted bytes on the fly; no decrypted copy is written to disk.
  2. Downloads include headers: `Content-Disposition: attachment; filename="<sanitized>"`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-transform`.
  3. Safe in-browser previews supported for images (PNG, JPG, SVG, WebP), PDFs, and plain text/code files (Markdown, TXT, JSON, CSV).
  4. High-risk MIME types are forced to download as binary octet-streams.

### FR-08: Time-Limited & Protected Share Links
- **Description:** Users can generate public or restricted access links for any file they own.
- **Acceptance Criteria:**
  1. Share links use unguessable 128-bit cryptographic tokens.
  2. Optional parameters: Expiration timestamp (e.g., 1 hour, 1 day, 7 days), bcrypt-hashed access password, maximum download count (e.g., 5 downloads), and permission mode (`VIEW_ONLY` vs `DOWNLOAD`).
  3. Accessing an expired or download-exhausted link returns HTTP 410 Gone.
  4. Entering an incorrect password increments rate-limit counters to prevent brute-force attacks.

### FR-09: File Versioning (Last 5 Versions)
- **Description:** Overwriting or updating a file preserves historical versions up to a depth of 5.
- **Acceptance Criteria:**
  1. Uploading a file with the same name in the same folder creates a new version entry rather than destroying history.
  2. Previous versions retain their individual encrypted blobs, SHA-256 hashes, and size allocations.
  3. When version count reaches 6, the oldest version (version 1) is automatically purged and its quota refunded.
  4. Users can view version history, download historical versions, or revert to an older version.

### FR-10: Recycle Bin & 30-Day Auto-Purge
- **Description:** Soft-deletion mechanism to prevent accidental data loss.
- **Acceptance Criteria:**
  1. Deleted files and folders have their `deleted_at` timestamp set; they immediately disappear from the active file browser.
  2. Items in the Recycle Bin continue to count toward the student's 200 MB quota.
  3. Users can restore items (verifying name collisions in the target folder) or permanently purge them.
  4. A daily cron job permanently deletes any file or folder with `deleted_at < NOW() - 30 days` and releases physical disk space.

### FR-11: Smart Search with Typo Tolerance
- **Description:** High-performance search allowing students to locate files across their entire directory tree.
- **Acceptance Criteria:**
  1. PostgreSQL Full-Text Search (`tsvector`) indexed on file names and metadata tags.
  2. Trigram similarity (`pg_trgm`) enabled for typo-tolerant matching (e.g., searching "assigment" finds "assignment_1.pdf").
  3. Search filters support filtering by MIME category (documents, media, archives, code), size ranges, and modification dates.
  4. Search queries are strictly scoped to the authenticated user's ownership or shared files.

### FR-12: Activity Logging & Audit Trail
- **Description:** Comprehensive, append-only security log tracking all critical operations.
- **Acceptance Criteria:**
  1. Events logged: `AUTH_LOGIN`, `AUTH_LOGOUT`, `FILE_UPLOAD`, `FILE_DOWNLOAD`, `FILE_DELETE`, `FILE_RESTORE`, `SHARE_CREATE`, `SHARE_ACCESS`, `QUARANTINE_REJECT`, `ADMIN_OVERRIDE`.
  2. Each log entry captures: `timestamp`, `user_id`, `ip_address`, `user_agent`, `action`, `resource_id`, `details_json`.
  3. Admins can filter logs and export the audit trail to standard CSV format.

### FR-13: Storage Usage Analytics & Dashboard
- **Description:** Interactive, visual telemetry on storage consumption.
- **Acceptance Criteria:**
  1. Student view: Recharts donut and bar visualizer displaying used vs. available quota, breakdown by file category (Documents, Code, Media, Archives, Others), and top 5 largest files.
  2. Admin view: Global 20 GB pool health gauge, pool free space percentage, number of active students, quarantine incident counter, and disk trend trajectory.

### FR-14: Administrative Management Console
- **Description:** Back-office administrative interface for platform governance.
- **Acceptance Criteria:**
  1. User table with pagination, search, status toggles (Active, Suspended), and quota adjustment modal.
  2. Quarantine queue displaying all files rejected by the 9-stage pipeline, the exact violation reason, timestamp, and submitting user.
  3. Capability for admins to permanently purge rejected quarantine artifacts.

---

## 5. Non-Functional Requirements (NFRs)

| ID | Category | Requirement Description | Target Metric |
|---|---|---|---|
| **NFR-01** | **Performance** | API response time for file metadata listing (up to 1,000 files) | < 150 ms (p95) |
| **NFR-02** | **Throughput** | File streaming upload and download throughput on local loopback | > 40 MB/s (limited only by disk I/O) |
| **NFR-03** | **Security** | Authentication credential security | Argon2id for OTP hashes; bcrypt (cost 12) for share passwords |
| **NFR-04** | **Security** | Cryptographic envelope encryption standards | NIST SP 800-38D AES-256-GCM; IV uniqueness guaranteed |
| **NFR-05** | **Availability** | Graceful degradation under resource exhaustion | Immediate HTTP 507 when pool free space < 1 GB |
| **NFR-06** | **Usability** | Responsive design support | Fully functional down to 360px viewport width |
| **NFR-07** | **Observability** | Structured logging and error tracking | JSON formatted logs with request correlation IDs |
| **NFR-08** | **Data Integrity** | Bit-rot and corruption verification | SHA-256 cryptographic digest verified on every restore and download |

---

## 6. User Stories

1. **US-01 (Secure Institutional Login):** As a VIT student, I want to log in using my college email address (`@vit.edu`) without having to remember a complex password, so that I receive a temporary OTP in my inbox to securely access my storage.
2. **US-02 (Storage Quota Awareness):** As a student working on heavy datasets, I want to see a live visual gauge of my 200 MB storage usage, so that I do not unexpectedly run out of space during project submissions.
3. **US-03 (Malware and Payload Protection):** As an academic administrator, I want untrusted student uploads to be scanned and validated before reaching disk storage, so that malicious scripts or zip bombs cannot compromise the host laptop.
4. **US-04 (Expiring Project Submissions):** As a student collaborating on an assignment, I want to share a zip archive with my professor using an access link that expires after 48 hours and requires a password, so that access is strictly controlled.
5. **US-05 (Accidental Deletion Recovery):** As a student who accidentally deleted my final report, I want to retrieve it from the Recycle Bin within 30 days, so that my work is not permanently lost.
6. **US-06 (Mobile Lecture Preview):** As a student on my phone in the lecture hall, I want to preview uploaded PDF notes directly in my mobile browser without downloading large binary files to my phone.
7. **US-07 (Admin Quota Exception):** As a student working on a large Capstone project, I want my professor/admin to grant me a 500 MB quota override, so that I can store my trained model weights.

---

## 7. Out of Scope

- Synchronous collaborative rich-text document editing (e.g., Etherpad / Operational Transformation engines).
- Native iOS and Android native binary applications (distribution through Apple App Store / Google Play).
- Multi-datacenter multi-master database replication.
- Support for external non-university email providers (Gmail, Outlook, Yahoo).
- Dynamic video transcoding and adaptive bitrate streaming (HLS/DASH).

---

## 8. Assumptions & Dependencies

1. **Single Node Deployment:** The application runs on a single host machine (student laptop) running Docker or native Node.js 20+ runtime.
2. **Storage Allocation:** A dedicated directory on the host file system acts as the 20 GB private cloud storage pool.
3. **Email Delivery Fallback:** For evaluation without active SMTP credentials, a development mode console emitter prints OTP tokens directly to `stdout`.
4. **Antivirus Scanning:** When ClamAV daemon (`clamd`) is active in Docker, scans are performed via network socket. If running in isolated local mode without Docker, the embedded fallback engine inspects file signatures including the EICAR test standard.

---

## 9. Risk Analysis & Mitigation Strategies

| Risk Description | Severity | Probability | Mitigation Strategy |
|---|:---:|:---:|---|
| **Concurrent Upload Quota Overshoot** | High | Medium | Row-level database locking (`SELECT ... FOR UPDATE`) inside an explicit transaction reserves byte allocations prior to disk writes. |
| **Zip-Bomb Decompression Denial-of-Service** | High | Low | Parse ZIP central directories using header streams without decompression; reject files exceeding 100:1 ratio or 500 MB uncompressed limit. |
| **Path Traversal via Malicious Filenames** | Critical | Medium | Discard client-supplied filenames on disk; store all files using random UUID v4 filenames in an isolated vault directory outside web roots. |
| **Master Encryption Key Compromise or Loss** | Critical | Low | Master key stored in environment variables, never committed to VCS; backup and recovery playbook documents key backup procedures. |
| **Host Disk Exhaustion** | High | Medium | Real-time disk guard middleware checks physical free space before accepting any upload stream; refuses requests if disk has < 1 GB free. |

---

## 10. Success Metrics

1. **Zero Domain Bypass:** 100% of unauthorized login attempts with non-`@vit.edu` domains are rejected.
2. **Zero Quota Leaks:** 100% of concurrent race condition upload tests honor the 200 MB user limit without overshooting.
3. **100% Malware & Bomb Interception:** All EICAR test signatures, path-traversal archives, and high-ratio zip bombs are intercepted at Quarantine Stage 6 & 7.
4. **Flawless Ciphertext Verification:** All raw files residing in the storage vault are cryptographically indistinguishable from random noise (AES-256-GCM ciphertext).
5. **Zero Data Loss on Restore:** 100% of restored files from the Recycle Bin match their original pre-deletion SHA-256 hash.

---

## 11. Academic Cloud Computing Concepts Mapping

To ensure academic rigor during project evaluation and viva defense, the table below highlights how components of this project directly map to foundational cloud computing principles:

| Cloud Computing Concept | Real-World Cloud Primitive (AWS/GCP/Azure) | Implementation in this Private Cloud Storage System |
|---|---|---|
| **Multi-Tenancy** | AWS IAM & AWS Organizations | Role-Based Access Control (`STUDENT` vs `ADMIN`), institutional domain isolation (`@vit.edu`), and strict tenant-scoped data queries. |
| **Resource Metering & Quotas** | AWS Service Quotas & API Gateway Usage Plans | User-level 200 MB quota enforcement with atomic row locks, real-time usage calculation, and administrative quota overrides. |
| **Storage Tiering & Virtualization** | Amazon S3 & Amazon EBS | Logical hierarchy of virtual folders decoupled from physical disk; physical files stored under random UUIDs in an encrypted volume. |
| **Security Pipelines & Guardrails** | AWS GuardDuty, S3 Object Lock, Macie | 9-Stage defense-in-depth upload pipeline (magic bytes, archive central directory inspection, ClamAV antivirus scanning). |
| **Envelope Encryption** | AWS Key Management Service (KMS) | Master Key (KEK) wraps per-file Data Encryption Keys (DEKs) generated with AES-256-GCM. |
| **Resource Isolation & Sandboxing** | AWS Lambda MicroVMs (Firecracker), Docker | Isolated `/storage/quarantine` staging zone preventing untrusted files from touching production vault storage. |
| **System Health & Telemetry** | Amazon CloudWatch & Datadog | Real-time disk guard monitor, physical volume capacity tracking, and structured audit trail exports. |
| **Scheduled Lifecycle Policies** | S3 Lifecycle Rules (Glacier transition/expiration) | Node-cron automated jobs executing 30-day trash auto-purges, orphan chunk cleanups, and expired share-link revocations. |
