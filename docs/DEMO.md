# VIT Private Cloud Storage — Live Demonstration & Defense Script

This document provides a step-by-step walkthrough script for presenting and defending the **VIT Private Cloud Storage** capstone project before academic examiners and professors.

---

## 1. System Overview & Architecture Elevator Pitch

> *"Good morning professors. This project implements a high-security, multi-tenant Private Cloud Storage system hosted on a single laptop acting as an on-premises cloud appliance. It manages a dedicated **20 GB physical storage pool**, enforces strict institutional lockdown to **@vit.edu** domain accounts, isolates student tenants with an atomic **200 MB personal quota**, protects all stored data with **AES-256-GCM envelope encryption**, and defends against malware, zip bombs, and malicious uploads via a **zero-trust 9-stage inspection pipeline**."*

---

## 2. Live Demo Workflow (Step-by-Step)

### Step 1: Starting the Services
1. **Database & Backend:**
   ```powershell
   # In terminal 1 (project root)
   npm run dev:server
   ```
   *Point out to examiners:* PostgreSQL is running on port 5432 with embedded fallback, and the Express backend is active on `http://localhost:5000`.

2. **Frontend UI:**
   ```powershell
   # In terminal 2
   npm run dev:client
   ```
   *Point out to examiners:* Vite development server is active on `http://localhost:5173`.

---

### Step 2: Demonstrating Domain Lockdown & OTP Authentication
1. Open your browser to `http://localhost:5173/login`.
2. **Negative Test (Domain Boundary Attack):**
   - Enter `intruder@gmail.com` or `hacker@mit.edu`.
   - Click **Send Verification Code**.
   - **Result:** Red security banner: *"Only official @vit.edu email addresses are permitted."*
3. **Positive Test (Institutional Student Login):**
   - Enter `student.defense@vit.edu`.
   - Click **Send Verification Code**.
   - Show the terminal console output where the 6-digit cryptographic OTP is printed.
   - Enter the 6-digit code and click **Verify & Enter Vault**.
   - **Result:** Student enters vault with **200 MB personal storage quota** automatically provisioned.

---

### Step 3: Vault Hierarchy & Storage Meter
1. Show the **Personal Storage Meter**:
   - `0.0 MB used of 200 MB (0%)`.
   - Explain that PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) protect this quota against concurrent race conditions.
2. Click **New Folder** and create `Cloud_Computing_Lab`.
3. Enter `Cloud_Computing_Lab` and show the dynamic breadcrumb trail:
   - `Root > Cloud_Computing_Lab`.
4. Upload a normal lecture slide or document (e.g. `Lecture_Notes.pdf`).
   - Observe the progress bar and instant toast notification.
   - Observe the Storage Meter dynamically update with the file size.

---

### Step 4: The 9-Stage Upload Defense Pipeline (Live Malware Defense)
1. Prepare a simulated test file named `malware_test.txt` containing the standard EICAR antivirus test signature:
   ```
   X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*
   ```
2. Attempt to upload `malware_test.txt` via the File Browser.
3. **Result:**
   - The upload is intercepted at **Stage 4** of the pipeline.
   - UI displays: *"Stage 4 Security Violation: Malware signature detected (EICAR_STANDARD_TEST_SIGNATURE)"*.
   - **Crucial Defense Point to Show Examiners:**
     - Open the physical directory `storage/vault/`.
     - Notice that **no file was created** in the encrypted vault.
     - The malicious payload was quarantined in `storage/quarantine/`, inspected, and destroyed without touching student storage.

---

### Step 5: Proof of AES-256 Envelope Encryption (Zero Plaintext on Disk)
1. Open the physical directory `storage/vault/` on the laptop.
2. Locate the `.enc` file corresponding to `Lecture_Notes.pdf`.
3. Open the `.enc` file in Notepad or VS Code:
   - Show the examiners that the file is completely unintelligible binary ciphertext.
   - Search for known plaintext phrases inside the document — nothing is found.
4. Explain the cryptographic construction to the examiner:
   - Each file has its own unique 256-bit **Data Encryption Key (DEK)** generated with `crypto.randomBytes(32)`.
   - The DEK is encrypted (wrapped) with the host's 256-bit **Master Key Encryption Key (KEK)**.
   - Each encryption uses a fresh **96-bit IV** and computes a **128-bit authentication tag**.
   - Decryption occurs strictly on-the-fly in memory during authorized streaming downloads.

---

### Step 6: In-Browser Decrypted Preview & Telemetry
1. In the file browser, click on the file or click the **Eye icon** ("In-Browser Decrypted Preview").
2. Show that the backend unwraps the DEK, streams the decrypted plaintext directly to the browser, and renders the PDF/image/text in the modal.
3. Click the **Storage Telemetry** button in the toolbar:
   - View the interactive Recharts Donut chart displaying the category breakdown (Documents, Images, Media, Code).
   - View the 14-day activity velocity chart tracking uploads, downloads, and shares.

---

### Step 7: Sequential Version Snapshots & One-Click Rollback
1. Upload an updated version of `Lecture_Notes.pdf` into the same folder.
2. Notice the file version increments.
3. Click the **History** icon next to the file:
   - Modal shows Version 1 (snapshot timestamp + size) and Version 2 (active).
4. Click **Revert to Version 1**:
   - The active document rolls back to Version 1.
   - The quota meter atomically adjusts.
   - Point out that the system retains up to **5 sequential versions**; when version 6 is uploaded, the oldest snapshot is automatically unlinked and quota refunded.

---

### Step 8: Secure File Sharing with Password & Download Limits
1. Click the **Share** icon on any file.
2. Configure share settings:
   - Set permission: `DOWNLOAD`.
   - Set password: `vit_password_2026`.
   - Set max downloads: `2`.
   - Set expiration: 1 day.
3. Click **Generate Secure Share Link** and copy the URL.
4. Open an **Incognito / Private Window** and paste the link:
   - Show that the public portal requires the password before revealing the file name or download action.
   - Enter `wrong_password` -> access rejected.
   - Enter `vit_password_2026` -> file unlocked.
   - Download the file twice -> on the third attempt, show the HTTP 410 *"Download limit reached"* defense.

---

### Step 9: Recycle Bin & 30-Day Auto Purge
1. Delete a folder containing files.
2. Switch to the **Recycle Bin (30-Day Auto Purge)** tab:
   - The deleted folder and its contents appear with a **30-day countdown timer**.
   - Explain that soft deletes do not immediately release disk blocks until emptied or auto-purged by the scheduled `node-cron` background worker.
3. Click **Restore**:
   - The items return to the active vault. If a name collision exists, show how the system automatically renames the item with `(restored)`.

---

### Step 10: Administrative Governance Console
1. Log out and log in with the designated institutional administrator account:
   - Email: `admin@vit.edu`.
2. Notice the golden **Admin Console** badge in the navbar; click it to navigate to `/admin`.
3. Present the three governance tabs:
   - **System Overview & Health:** Live progress meter of the host's 20 GB dedicated disk pool, registered student count, and quarantine alerts.
   - **Student Roster & Quota Overrides:** Table of all students. Click **Adjust Quota** on a student and select **Thesis Grant (500 MB)**. The student's quota limit is immediately updated in the database.
   - **Quarantine Threat Console:** Shows the EICAR incident logged from Step 4, including uploader email, client IP, detection rule, and a **Resolve Threat** action button.
   - **Institutional Audit Trail:** Searchable tamper-evident log of all operations (`FILE_UPLOAD`, `SHARE_DOWNLOAD`, `QUOTA_OVERRIDE`).
   - Click **Export CSV Log** to stream a complete `.csv` audit file.

---

## 3. Command-Line (`curl`) Verification Cheatsheet

For examiners who request raw terminal verification:

```bash
# 1. Health check
curl -X GET http://localhost:5000/api/v1/health

# 2. OTP Request (Negative Test)
curl -X POST http://localhost:5000/api/v1/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"intruder@gmail.com"}'

# 3. OTP Request (Positive Test)
curl -X POST http://localhost:5000/api/v1/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"student@vit.edu"}'

# 4. Storage Pool Telemetry
curl -X GET http://localhost:5000/api/v1/analytics/pool \
  -H "Cookie: accessToken=<ADMIN_OR_STUDENT_JWT>"
```
