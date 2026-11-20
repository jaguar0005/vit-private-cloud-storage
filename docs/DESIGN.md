# UI/UX Design System & Wireframes
## Private Cloud Storage System (Cloud Computing Course Project)

> **What this document is and how to use it:**  
> This document defines the visual design system, design tokens, color palettes, component library, responsive behavior, accessibility standards, and page-by-page layouts for the Private Cloud Storage client. It serves as the blueprint for crafting a clean, modern, and trustworthy user interface.

---

## 1. Design Principles

1. **Clarity Over Clutter:** Academic cloud storage should feel lightweight, organized, and immediate. Users must understand their quota status, current folder location, and file actions at a glance.
2. **Transparent Security:** Security should not be an invisible mystery. When files are encrypted, scanned, or quarantined, the UI clearly communicates the status with badges, shields, and actionable feedback.
3. **Responsive by Default:** Designed mobile-first. Students inspecting PDF notes on their smartphones must enjoy the same smooth experience as desktop users managing complex directory structures.
4. **Delightful Micro-Interactions:** Subtle hover states, smooth progress transitions, and thoughtful skeleton loaders make the interface feel responsive and refined.

---

## 2. Design Tokens & Color Palette

The interface supports both **Light Mode** and **Dark Mode** with high-contrast, accessible palettes.

### 2.1 Semantic Palette

| Token | Light Mode Value (Hex) | Dark Mode Value (Hex) | Usage |
|---|---|---|---|
| **Background (Primary)** | `#F8FAFC` (Slate 50) | `#0B0F19` (Deep Slate/Navy) | Page canvas background |
| **Background (Surface)** | `#FFFFFF` (White) | `#151E2E` (Navy Card) | Cards, modals, sidebars |
| **Border / Divider** | `#E2E8F0` (Slate 200) | `#232F45` (Navy Border) | Borders, dividers, subtle outlines |
| **Text (Primary)** | `#0F172A` (Slate 900) | `#F8FAFC` (Slate 50) | Headers, active titles, values |
| **Text (Secondary)** | `#64748B` (Slate 500) | `#94A3B8` (Slate 400) | Timestamps, metadata, hints |
| **Primary (Brand / VIT Accent)** | `#0284C7` (Sky 600) | `#38BDF8` (Sky 400) | Primary buttons, active tabs, links |
| **Primary Hover** | `#0369A1` (Sky 700) | `#0EA5E9` (Sky 500) | Button hover states |
| **Success / Safe** | `#16A34A` (Green 600) | `#22C55E` (Green 500) | Clean scans, restore success, free space |
| **Warning / Caution** | `#D97706` (Amber 600) | `#F59E0B` (Amber 500) | Approaching quota (>80%), expiring links |
| **Danger / Quarantine** | `#DC2626` (Red 600) | `#EF4444` (Red 500) | Malware alerts, quota breach, delete actions |
| **Purple (Encryption Accent)** | `#7C3AED` (Violet 600) | `#A855F7` (Purple 400) | AES-256-GCM badges, encryption indicators |

---

## 3. Typography & Spacing Scale

### 3.1 Typography
- **Primary Typeface:** `Inter`, system-ui, sans-serif (imported via Google Fonts).
- **Monospace Typeface:** `JetBrains Mono`, `Fira Code`, monospace (for hashes, UUIDs, and code previews).

| Scale Token | Font Size | Line Height | Tailwind Class | Usage |
|---|---|---|---|---|
| `text-xs` | 0.75rem (12px) | 1rem (16px) | `text-xs` | Badges, timestamps, file sizes |
| `text-sm` | 0.875rem (14px) | 1.25rem (20px) | `text-sm` | Body copy, table cells, form labels |
| `text-base` | 1rem (16px) | 1.5rem (24px) | `text-base` | Buttons, navigation links |
| `text-lg` | 1.125rem (18px) | 1.75rem (28px) | `text-lg` | Card titles, modal headings |
| `text-xl` | 1.25rem (20px) | 1.75rem (28px) | `text-xl` | Section titles, dashboard metrics |
| `text-2xl` | 1.5rem (24px) | 2rem (32px) | `text-2xl` | Page headings, storage meter value |

### 3.2 Spacing & Radii
- **Base Grid:** 4px (0.25rem) increments.
- **Corner Radii:**
  - Badges & Pills: `rounded-full`
  - Buttons & Inputs: `rounded-lg` (8px)
  - Cards & Modals: `rounded-xl` (12px)
  - Large Panels: `rounded-2xl` (16px)

---

## 4. Reusable Component Library

1. **Button (`<Button variant="..." size="...">`):**
   - Variants: `primary`, `secondary`, `danger`, `ghost`, `outline`.
   - Features: Built-in loading spinner, disabled state styling, accessible focus ring (`focus:ring-2 focus:ring-sky-500`).
2. **Input (`<Input label="..." error="..." icon="...">`):**
   - Clean floating or top-aligned labels, error message container, optional leading/trailing icons.
3. **Modal (`<Modal title="..." isOpen onClose>`):**
   - Glassmorphic backdrop with blur (`backdrop-blur-sm bg-black/50`), escape key listener, focus trap.
4. **Toast Notifications (`<Toast>` via Sonner or Lucide):**
   - Stacked bottom-right notifications for success, warnings, error banners, and upload completions.
5. **Storage Gauge (`<StorageGauge used={...} total={...} />`):**
   - Visual radial and horizontal progress bar color-coded: Blue (<70%), Amber (70-90%), Red (>90%).
6. **File Card & File Table (`<FileGrid>`, `<FileTable>`):**
   - Toggleable grid/list views with file icons per MIME type, hover action menu (download, share, star, rename, delete).
7. **Upload Progress Modal (`<UploadProgressModal>`):**
   - Multi-file progress drawer displaying filename, percentage, transfer speed, and stage badges (Uploading -> Scanning -> Encrypting -> Done).
8. **Skeleton Loaders (`<SkeletonLoader>`):**
   - Shimmer animation placeholder for tables, cards, and file trees while queries resolve.

---

## 5. Page-by-Page Layouts & Wireframes

### 5.1 Login & Institutional OTP Authentication Page

```
+-----------------------------------------------------------------------+
|                                                                       |
|                         [ VIT Private Cloud ]                         |
|                 Academic Cloud Storage for Students                   |
|                                                                       |
|         +---------------------------------------------------+         |
|         |                     Sign In                       |         |
|         |                                                   |         |
|         |  Student Email (@vit.edu)                         |         |
|         |  [ aditi.sharma@vit.edu                         ] |         |
|         |                                                   |         |
|         |  [ Send One-Time Password (OTP) ]                 |         |
|         |                                                   |         |
|         |  - - - - - - - - - - - - - - - - - - - - - - - -  |         |
|         |                                                   |         |
|         |  Enter 6-Digit OTP                                |         |
|         |  [ 4 ] [ 8 ] [ 2 ] [ 9 ] [ 1 ] [ 0 ]              |         |
|         |  Resend in 01:45                                  |         |
|         |                                                   |         |
|         |  [ Verify & Open Storage Vault ]                  |         |
|         |                                                   |         |
|         |  🔒 Restricted to verified VIT University domains |         |
|         +---------------------------------------------------+         |
|                                                                       |
+-----------------------------------------------------------------------+
```

---

### 5.2 Main Dashboard & Storage Overview

```
+------------------------------------------------------------------------------------------------+
| [LOGO] VIT Private Cloud    [ Search files... (Ctrl+K) ]      (🔔) (🌙/☀️) [ Aditi S. (@vit.edu) v] |
+------------------------------------------------------------------------------------------------+
| SIDEBAR         | MAIN WORKSPACE                                                               |
|                 |                                                                              |
| 📁 My Files     | Breadcrumbs: Home > Cloud Computing > Lab Assignments                        |
| ⭐ Starred      |                                                                              |
| 🔗 Shared Links | [ + New Folder ]   [ ⬆ Upload Files ]   [ 🔄 Refresh ]   [ 🔲 Grid / ☰ List ] |
| 🗑 Recycle Bin  |------------------------------------------------------------------------------|
| 📊 Analytics    | Quick Storage Health:                                                        |
|                 | [████████████████████░░░░░░░░░░░░░░░░░░] 74.2 MB of 200 MB used (37%)       |
| -- ADMIN --     | Documents: 42 MB  |  Archives: 20 MB  |  Media: 10 MB  |  Code: 2.2 MB         |
| 🛡 Admin Center |------------------------------------------------------------------------------|
| ☣ Quarantine   | Files & Folders:                                                             |
|                 |                                                                              |
|                 | [📁 Lab 1 - Setup]    [📁 Lab 2 - VPC]    [📁 Final Project]                 |
|                 |                                                                              |
|                 | [📄 project_report.pdf] [🔒 Encrypted AES-256] [12.4 MB] [••• Actions]       |
|                 | [📦 datasets_archive.zip] [🔒 Encrypted AES-256] [28.1 MB] [••• Actions]     |
|                 | [📝 lab_notes.md] [🔒 Encrypted AES-256] [140 KB] [••• Actions]              |
|                 |                                                                              |
+------------------------------------------------------------------------------------------------+
```

---

### 5.3 File Share Dialog Wireframe

```
+-----------------------------------------------------------------------+
|  Share "project_report.pdf"                                     [ X ] |
|-----------------------------------------------------------------------|
|  Link Settings                                                        |
|                                                                       |
|  Link Expiry:                                                         |
|  ( ) 24 Hours     (•) 3 Days     ( ) 7 Days     ( ) Never             |
|                                                                       |
|  [x] Require Access Password                                          |
|  Password: [ ••••••••••••••••                 ] [ Generate Safe Key ] |
|                                                                       |
|  [x] Limit Downloads                                                  |
|  Max Downloads: [ 5   ]                                               |
|                                                                       |
|  Access Permission:                                                   |
|  (•) View & Download     ( ) View-Only (No Download)                  |
|                                                                       |
|  Shareable URL:                                                       |
|  [ https://cloud.vit.edu/share/t8x9q2m901...         ] [ Copy Link ]  |
|                                                                       |
|  [ Done ]                                                             |
+-----------------------------------------------------------------------+
```

---

### 5.4 Recycle Bin / Recovery Interface

```
+------------------------------------------------------------------------------------------------+
| SIDEBAR         | Recycle Bin (Items are automatically purged after 30 days)                    |
|                 | [ Empty Trash Permanently ]                                                  |
| 📁 My Files     |------------------------------------------------------------------------------|
| ⭐ Starred      | Name                   Original Path      Deleted On       Size      Actions |
| 🔗 Shared Links |------------------------------------------------------------------------------|
| 🗑 Recycle Bin* | test_results.csv       /Cloud/Lab 2       Oct 04, 2026     1.4 MB    [Restore] [Purge]
| 📊 Analytics    | old_diagram.png        /Cloud/Drawings    Oct 02, 2026     3.2 MB    [Restore] [Purge]
|                 | draft_syllabus.docx    /                  Sep 28, 2026     420 KB    [Restore] [Purge]
+------------------------------------------------------------------------------------------------+
```

---

### 5.5 Admin Center & Quarantine Review

```
+------------------------------------------------------------------------------------------------+
| SIDEBAR         | System Storage Pool Health (Physical Host Machine)                           |
|                 | Pool Capacity: 20.0 GB   |   Allocated: 4.8 GB   |   Free Space: 15.2 GB     |
| 🛡 Admin Center | Disk Guard Threshold: 1.0 GB Free (Status: HEALTHY / ACTIVE)                |
| ☣ Quarantine*  |------------------------------------------------------------------------------|
| 👥 User Quotas  | Quarantined Submissions (Rejected by Defense Pipeline)                       |
| 📜 Audit Export |------------------------------------------------------------------------------|
|                 | Timestamp      Student Email        File Name       Violation Reason   Actions|
|                 |------------------------------------------------------------------------------|
|                 | Oct 06 14:22   rahul.v@vit.edu      crack.exe       Forbidden Extension [Purge]|
|                 | Oct 06 15:10   priya.k@vit.edu      docs.zip        Zip Bomb (120:1)    [Purge]|
|                 | Oct 06 16:05   student3@vit.edu     invoice.pdf.exe Wrong Magic Bytes   [Purge]|
|                 | Oct 06 17:00   test@vit.edu         eicar.com.txt   Malware Signature   [Purge]|
+------------------------------------------------------------------------------------------------+
```

---

## 6. Responsive Breakpoints & Mobile Adaptations

| Breakpoint | Viewport Width | UI Adaptations |
|---|---|---|
| **Mobile (`< 640px`)** | 360px – 639px | Sidebar collapses into a slide-over mobile drawer; file list defaults to compact row cards; bottom action sheet for file operations; floating upload button (`FAB`). |
| **Tablet (`640px - 1024px`)** | 640px – 1023px | Collapsible icon sidebar; 2-column dashboard widgets; compact table headers. |
| **Desktop (`> 1024px`)** | 1024px+ | Full multi-column layout with expanded sidebar, breadcrumbs, search bar with shortcut hint (`Ctrl+K`), and split-view preview drawer. |

---

## 7. Accessibility (a11y) & Usability Standards

1. **Color Contrast:** All text meets or exceeds **WCAG 2.1 AA** contrast ratios (minimum 4.5:1 for normal text, 3:1 for large text).
2. **Keyboard Navigation:**
   - `Tab` / `Shift+Tab`: Predictable tab sequence through interactive items.
   - `Enter` / `Space`: Open folders, trigger buttons, activate modals.
   - `Escape`: Dismiss open modals, preview drawers, or dropdown menus.
   - `Ctrl+K` / `Cmd+K`: Focus universal file search input.
3. **Screen Readers:** ARIA landmarks (`role="main"`, `role="navigation"`, `aria-label="Upload progress"`), meaningful button labels (`aria-label="Delete file assignment.pdf"`).
4. **Focus Rings:** Distinct 2px sky-blue focus rings (`focus-visible:ring-2 focus-visible:ring-sky-500`) on all interactive controls.

---

## 8. Copywriting & Error Messaging Standards

| State | Bad Example | Good Standard Example |
|---|---|---|
| Non-VIT Email | "Invalid email." | "Access restricted: Please enter an official VIT University email (@vit.edu)." |
| Quota Exceeded | "File too big." | "Quota Exceeded: This upload requires 45 MB, but you have 18 MB remaining of your 200 MB allowance." |
| Zip Bomb Detected | "Archive error." | "Security Violation: This zip archive exhibits abnormal compression characteristics (potential zip bomb) and was quarantined." |
| Magic Byte Mismatch | "Upload failed." | "Security Violation: File extension does not match its internal binary format. The upload was blocked." |
| Disk Guard Triggered | "Server error 507." | "System Alert: The private storage pool has reached critical capacity (< 1 GB free). Uploads are temporarily paused." |
