# VIT Private Cloud Storage — Viva Voce Examination Guide

This document contains **25 comprehensive technical questions and in-depth model answers** designed to help you defend this project with complete mastery during your Cloud Computing capstone examination.

---

## Category 1: Cloud Architecture, Storage Pools & Isolation

### Q1: What makes this a "Private Cloud" system rather than just a standard web application?
**Answer:**
A Private Cloud provides dedicated, isolated cloud infrastructure provisioned for exclusive use by a single organization. In our implementation:
1. **Single-Tenant Institutional Boundary:** The system strictly locks authentication to `@vit.edu` institutional credentials; public registrations are blocked at the perimeter.
2. **Dedicated Physical Storage Pool:** Rather than relying on third-party public cloud APIs (e.g. AWS S3), the application manages a local physical disk block pool bounded to **20 GB** on the host laptop.
3. **Multi-Tenant Virtualization & Metering:** Within this private perimeter, the host laptop acts as a private storage appliance. Each student receives an isolated virtual volume with an individual **200 MB personal storage quota**, monitored and metered in real time.
4. **Self-Contained On-Premises Architecture:** All components (database, application server, cryptographic envelope vault, and quarantine staging) run self-contained on the host machine without external vendor dependencies.

---

### Q2: How does the system enforce tenant isolation? Can Student A ever view Student B's files?
**Answer:**
Tenant isolation is enforced through **defense-in-depth across database queries, cryptographic keys, and API authorization**:
- **Application Query Layer:** Every file, folder, version, and trash query strictly enforces `WHERE user_id = req.user.id`. Files are referenced internally by UUIDs rather than sequential auto-incrementing integers, preventing ID enumeration attacks.
- **File System Layer:** Raw files on disk do not preserve original file names or directory hierarchies. They are stored as encrypted blobs named `<storageUuid>.enc` in the central vault. Even if an attacker gains read access to the server disk, they cannot determine file ownership or plaintext content without the database mapping and Master Key.
- **Verification:** Our automated test suite `tests/securitySelfAttack.test.ts` specifically executes cross-tenant intrusion tests where Student B attempts to download, rename, and delete Student A's files; all attempts return HTTP 404/403.

---

### Q3: Explain the difference between the 200 MB personal quota and the 20 GB host storage pool.
**Answer:**
- **200 MB Personal Quota:** The individual allocation cap assigned to each enrolled student upon account verification. This guarantees equitable resource distribution among peers and prevents single-student resource monopolization.
- **20 GB Host Storage Pool:** The physical disk capacity reserved on the host laptop's hard drive for the entire cloud system.
- **Quota Over-Subscription Defense:** The administrator console monitors the aggregate physical storage consumed across all student vaults against the 20 GB host ceiling. If host capacity reaches 90%, the system flags a storage alert to prevent physical disk exhaustion.

---

## Category 2: Cryptography & Envelope Encryption

### Q4: What is Envelope Encryption and why did you choose it over encrypting all files with a single Master Key?
**Answer:**
In envelope encryption, data is encrypted with a unique, randomly generated key called a **Data Encryption Key (DEK)**. The DEK itself is then encrypted (wrapped) with a higher-level key called the **Key Encryption Key (KEK) / Master Key**.

**Why we chose it over a single key:**
1. **Blast Radius Minimization:** If a single file's DEK is ever compromised, only that one file is exposed. The rest of the vault remains secure.
2. **Key Rotation Performance:** If the organization needs to rotate the Master Key, we do **not** have to decrypt and re-encrypt gigabytes of file ciphertext on disk. We only re-encrypt the 32-byte DEKs stored in the database.
3. **Cryptographic Wear-Out Prevention:** AES-256-GCM recommends not encrypting more than $2^{32}$ blocks under the same key/IV pair. Using a fresh DEK per file eliminates key wear-out.

---

### Q5: Why AES-256-GCM instead of AES-256-CBC?
**Answer:**
- **Authenticated Encryption with Associated Data (AEAD):** AES-GCM (Galois/Counter Mode) provides **both confidentiality and cryptographic integrity** in a single pass.
- **Integrity Tag:** GCM produces a 128-bit authentication tag (`auth_tag`). If an attacker tampers with even a single bit of the encrypted file on disk, the tag verification fails during decryption, preventing ciphertext manipulation or padding oracle attacks.
- **CBC Drawbacks:** AES-CBC requires PKCS#7 padding (susceptible to padding oracle attacks if not paired with HMAC) and is slower because encryption cannot be parallelized. AES-GCM computes Galois field multiplications and counter modes, offering superior streaming performance.

---

### Q6: What is the structure of the encrypted file and key record in the database?
**Answer:**
For each file in the `File` table:
- `storage_uuid`: Unique UUID identifying the `.enc` file in `/storage/vault/<storage_uuid>.enc`.
- `encrypted_dek`: The 32-byte DEK, encrypted by Master KEK via AES-256-GCM, encoded in Base64 (contains DEK IV + DEK Tag + DEK Ciphertext).
- `iv`: Unique 96-bit (12-byte) initialization vector generated per file via `crypto.randomBytes(12)`.
- `auth_tag`: 128-bit (16-byte) authentication tag generated by the streaming GCM cipher.
- `sha256_hash`: SHA-256 checksum of the original unencrypted file, used for integrity verification.

---

## Category 3: Concurrency & Database Internals

### Q7: What is a storage quota race condition and how did you prevent it in PostgreSQL?
**Answer:**
**The Race Condition:**
If Student A has 195 MB used of their 200 MB quota and concurrently sends two simultaneous upload requests of 4 MB each:
- Request 1 reads used bytes: 195 MB (195 + 4 = 199 MB $\le$ 200 MB $\rightarrow$ Allowed).
- Request 2 reads used bytes concurrently: 195 MB (195 + 4 = 199 MB $\le$ 200 MB $\rightarrow$ Allowed).
- Both uploads complete, resulting in 203 MB stored, breaching the 200 MB quota!

**Our Prevention Mechanism:**
In `quota.service.ts`, we utilize **PostgreSQL Row-Level Locks** within an atomic Prisma transaction:
```sql
SELECT quota_bytes, used_bytes FROM "User" WHERE id = $1 FOR UPDATE;
```
The `FOR UPDATE` clause places an exclusive lock on that student's row. Request 2 is blocked until Request 1 finishes and commits its updated `used_bytes`. Request 2 then reads the committed 199 MB, detects that 199 + 4 = 203 MB > 200 MB, and immediately rejects with HTTP 413 `QUOTA_EXCEEDED`.

---

### Q8: What transaction isolation level is used and why?
**Answer:**
PostgreSQL defaults to `Read Committed`. However, by combining an atomic transaction with explicit `SELECT ... FOR UPDATE` row locks, we achieve serializable-like isolation on the user's storage quota without the abort-and-retry overhead of full Serializable isolation.

---

## Category 4: The 9-Stage Upload Defense Pipeline

### Q9: Walk through all 9 stages of the upload defense pipeline.
**Answer:**
1. **Stage 1 (Rate Limiting & Streaming Size Limit):** Rejects requests exceeding 100 MB or violating IP rate limits.
2. **Stage 2 (MIME & Extension Whitelist):** Verifies file extension against institutional allowed list.
3. **Stage 3 (Magic Bytes Validation):** Reads the initial 4,100 bytes of the file to inspect binary file signatures (`file-type`), ensuring an `.exe` renamed to `.pdf` is detected.
4. **Stage 4 (Antivirus Scanning):** Scans file via ClamAV daemon / EICAR virus signature engine.
5. **Stage 5 (Zip Bomb Analysis):** For archives, parses the Central Directory to ensure uncompressed size $\le$ 500 MB, compression ratio $\le$ 100:1, and entry count $\le$ 1,000.
6. **Stage 6 (Zip Slip Defense):** Inspects all internal archive paths to prevent directory traversal (`../`).
7. **Stage 7 (Concurrency Quota Row Lock):** Locks user row via `SELECT ... FOR UPDATE` and verifies remaining quota.
8. **Stage 8 (Envelope Encryption & Vault Move):** Generates DEK, encrypts payload with AES-256-GCM, moves ciphertext to vault, and commits database transaction.
9. **Stage 9 (Rollback on Failure):** If any stage fails, unlinks quarantine files, releases row locks, and records a security incident in `QuarantineLog`.

---

### Q10: How does the system defend against Zip Bombs without uncompressing them into memory or disk?
**Answer:**
Uncompressing a zip bomb to inspect it causes disk or RAM exhaustion (Denial of Service). Our system uses **Central Directory Parsing via `yauzl`**:
- A ZIP file stores its header metadata in the **Central Directory** at the end of the file.
- The pipeline parses only the Central Directory headers **without decompressing the payload bytes**.
- It sums the declared uncompressed sizes of all entries and calculates the compression ratio:
  $$\text{Ratio} = \frac{\text{Total Uncompressed Size}}{\text{Compressed Size}}$$
- If the ratio exceeds **100:1**, total uncompressed size exceeds **500 MB**, or entry count exceeds **1,000**, the archive is rejected at Stage 5.

---

### Q11: What is a Zip-Slip vulnerability and how is it prevented?
**Answer:**
Zip-Slip is an arbitrary file overwrite vulnerability where an archive contains filenames with path traversal characters (e.g. `../../../../etc/passwd` or `..\windows\system32\calc.exe`). If unpacked blindly, it overwrites critical operating system files.

**Our Prevention:**
Stage 6 inspects every archive entry path using `path.normalize` and ensures that:
1. Entry path does not contain `..` or relative parent traversals.
2. The resolved target path remains strictly bounded within the intended destination directory.
3. If any traversal attempt is detected, the pipeline halts with `ZIP_SLIP_DETECTED` and stages the file in quarantine.

---

### Q12: How does Magic Byte validation differ from checking `req.file.mimetype`?
**Answer:**
The MIME type in HTTP requests (`Content-Type: image/png`) is supplied by the client browser or attacker and can be trivial to spoof. Magic byte validation reads the first few bytes (the binary file signature) directly from the raw file:
- PDF: `%PDF` (`25 50 44 46`)
- PNG: `\x89PNG\r\n\x1a\n` (`89 50 4E 47 0D 0A 1A 0A`)
- ZIP: `PK\x03\x04` (`50 4B 03 04`)

Stage 3 uses `file-type` to inspect these bytes. If a user uploads an executable (`MZ` header) renamed to `assignment.pdf`, the mismatch triggers an immediate security violation.

---

## Category 5: Authentication, Session Management & RBAC

### Q13: Why use Argon2id for OTP hashing instead of bcrypt or SHA-256?
**Answer:**
- **SHA-256 is not a password hash:** It is designed for fast hashing. An attacker with a GPU could compute billions of SHA-256 hashes per second, brute-forcing a 6-digit OTP ($10^6$ combinations) in milliseconds.
- **Argon2id Winner of PHC:** Argon2id combines resistance to side-channel cache attacks (from Argon2i) and GPU memory-hard attacks (from Argon2d).
- **Memory Cost:** We configure Argon2id with 19 MB of memory cost (`m=19456`) and 2 time iterations (`t=2`), ensuring brute-force attacks require prohibitive memory resources per attempt.

---

### Q14: Explain the token lifecycle and RFC 6819 compliance.
**Answer:**
- **Short-Lived Access Tokens:** Stored in an `httpOnly`, `SameSite=Strict` cookie with a **15-minute** expiration.
- **Long-Lived Refresh Tokens:** Stored in a separate `httpOnly` cookie with a **7-day** expiration.
- **RFC 6819 Refresh Token Rotation:** Every time `/api/v1/auth/refresh` is called, the old refresh token is invalidated in the database and a brand-new token pair is issued.
- **Replay Detection:** If an old, already-used refresh token is presented, the system flags token reuse, invalidates all active sessions for that student, and forces re-authentication.

---

### Q15: Why are tokens stored in `httpOnly` cookies rather than browser `localStorage`?
**Answer:**
Tokens stored in `localStorage` can be accessed by any JavaScript executing in the browser. If the application has any Cross-Site Scripting (XSS) vulnerability, an attacker can steal the tokens via `localStorage.getItem('token')`.
`httpOnly` cookies are inaccessible to JavaScript (`document.cookie` cannot read them). The browser automatically includes them in HTTP requests to the backend, completely mitigating client-side token theft via XSS.

---

## Category 6: Sharing Engine, Versioning & Lifecycle Management

### Q16: How do expiring share links work without exposing raw file paths?
**Answer:**
1. **URL-Safe NanoID Tokens:** The backend generates a cryptographically random, URL-safe 21-character token (`crypto.randomBytes(16).toString('base64url')`).
2. **Access Control Verification:** When a recipient visits `/share/:token`:
   - Checks if `is_active` is true.
   - Checks if `expires_at` is null or $> \text{now()}$.
   - Checks if `max_downloads` is null or $\text{download_count} < \text{max_downloads}$.
3. **Decryption on Demand:** The file is streamed and decrypted on-the-fly directly to the recipient's response stream. The raw `.enc` storage path is never exposed.

---

### Q17: How does password protection on share links work?
**Answer:**
When a student enables password protection:
1. The password is hashed using **bcrypt** (salt rounds = 10) and stored in `ShareLink.password_hash`.
2. Public API endpoint `/api/v1/shares/public/:token` returns metadata with `isPasswordRequired: true`, withholding file size and download links.
3. The recipient must provide the password via header or parameter. The backend calls `bcrypt.compare(password, share.password_hash)`. If invalid, HTTP 401 `INVALID_PASSWORD` is returned.

---

### Q18: What is the file versioning strategy and how are older versions pruned?
**Answer:**
- **Sequential Version Snapshots:** When an existing file is updated, the previous version is recorded in the `FileVersion` table with an incremented `version_number`.
- **5-Version Cap:** To prevent unbounded storage consumption, each file retains up to **5 versions**.
- **Pruning & Quota Refund:** When version 6 is uploaded, the oldest snapshot (version 1) is selected. Its encrypted file is unlinked from `/storage/vault/`, its database record deleted, and the student's `used_bytes` quota is atomically refunded by the size of the deleted snapshot.

---

### Q19: Explain the Recycle Bin lifecycle and how the 30-day auto-purge works.
**Answer:**
1. **Soft Deletion:** When a file or folder is deleted, `deleted_at` is set to `new Date()`. The file disappears from the File Browser but remains in the database.
2. **Recycle Bin UI:** Displays all soft-deleted items with a real-time countdown calculating days remaining until the 30-day purge threshold (`deleted_at + 30 days`).
3. **Collision-Safe Restoration:** Restoring a file checks if an active file with the same name exists. If so, it renames the restored file with `(restored)`.
4. **Auto-Purge Job:** A `node-cron` background worker runs daily at midnight (`0 0 * * *`), queries all items where `deleted_at < now() - 30 days`, unlinks their encrypted files, refunds the student's quota, and permanently deletes the records.

---

## Category 7: Administrative Governance & Audit

### Q20: How does the system enforce RBAC for administrative routes?
**Answer:**
In `rbac.middleware.ts`, the `requireAdmin` middleware inspects the decoded JWT payload from `req.user`. If `req.user.role !== 'ADMIN'`, the request is immediately aborted with HTTP 403 `FORBIDDEN` and code `'FORBIDDEN'`.
Admin privileges are restricted to designated administrator accounts (such as `admin@vit.edu`), verified against institutional directory roles.

---

### Q21: What information is captured in the institutional audit trail?
**Answer:**
Every state-changing operation writes an immutable record to the `AuditLog` table containing:
- `user_id`: ID of the acting student or admin.
- `action`: Standardized event string (`AUTH_LOGIN`, `FILE_UPLOAD`, `FILE_DELETE`, `SHARE_CREATE`, `QUOTA_OVERRIDE`, etc.).
- `resource_id`: ID of the affected file, folder, or share link.
- `ip_address`: Client IPv4/IPv6 address.
- `user_agent`: Browser/client user-agent header.
- `metadata`: JSON object capturing contextual attributes (filename, version, previous quota, new quota).
- `created_at`: Cryptographic server timestamp.

---

## Category 8: Advanced Engineering Challenges & Resilience

### Q22: What challenge did Windows file locks (`EBUSY`) present and how did you resolve it?
**Answer:**
On Windows operating systems, deleting a file via `fs.promises.unlink` while any open stream or file descriptor still references it triggers an `EBUSY: resource busy or locked` error.

**Our Resolution in `crypto.service.ts` and `pipeline.service.ts`:**
1. Explicitly destroyed both the read and write streams (`readStream.destroy()`, `writeStream.destroy()`).
2. Added an event listener awaiting the explicit `'close'` event on the file descriptor before executing `unlink`.
3. Implemented a resilient retry loop with a 50ms exponential backoff to handle transient Windows antivirus lockouts.

---

### Q23: Why did you have to configure custom `BigInt` JSON serialization?
**Answer:**
In JavaScript and TypeScript, the native `BigInt` primitive (used by Prisma for 64-bit integer columns like `size_bytes` and `quota_bytes`) throws a `TypeError: Do not know how to serialize a BigInt` when processed by `JSON.stringify()`.
To resolve this globally without tedious manual type mapping in every controller, we attached a custom serialization prototype in `app.ts`:
```typescript
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
```
This ensures large byte values are safely transmitted as string literals across REST APIs without numeric overflow.

---

### Q24: How does the system handle search performance across thousands of files?
**Answer:**
In `search.service.ts`, we utilize **PostgreSQL Full-Text Search and Trigram Indexing (`pg_trgm`)**:
- Files are indexed on their `name` column using trigram GIN indexes (`CREATE INDEX ON "File" USING gin (name gin_trgm_ops)`).
- Trigram similarity allows sub-millisecond substring matching and fuzzy matching across file names even without exact prefix matches.
- All search queries remain tenant-isolated via `WHERE user_id = $1`.

---

### Q25: How does your disaster recovery and backup script (`backup.ps1`) work?
**Answer:**
Our automated disaster recovery script:
1. **Dumps Database State:** Executes `pg_dump` against PostgreSQL to capture schema, tables, and audit logs into a clean `.sql` snapshot (with a Node.js JSON fallback).
2. **Snapshots Vault Storage:** Recursively copies all encrypted `.enc` vault objects from `/storage/vault/`.
3. **Computes Cryptographic Manifest:** Generates a `BACKUP_MANIFEST.json` containing SHA-256 hashes for every backed-up artifact. If a restore is attempted, the manifest is validated to detect any backup corruption or tampering.
