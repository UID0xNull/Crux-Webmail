# Mitigation Plan — Security Audit (Crux Webmail)

## 1. Executive Summary

| Severity | Count | Example |
|----------|-------|---------|
| CRITICAL | 0     | –       |
| HIGH     | 0     | –       |
| MEDIUM   | 3–4   | XSS in audit log; missing admin access check; metadata modal XSS |
| LOW      | 1+    | Verbose error messages leaking internal details |

Overall, the system is not exposed to critical remote execution or direct data breach via clearly exploitable injection, but several medium-severity issues around:

- unvalidated trust of logged/displayed data (XSS risk), and  
- missing / weak admin access checks  

must be fixed before release/hardening.

All findings are documented as separate files in this `security-audit/` directory.

## 2. Prioritization

Priority is based on impact vs effort:

1) MEDIUM — XSS via audit log fields (MEDIUM-XSS-log-fields-rendering.md)
   - High risk if attackers can control logged values (e.g., usernames/messages).
   - Quick fix; high ROI.

2) MEDIUM — XSS via metadata/detail modal (MEDIUM-XSS-metadata-detail-modal.md)
   - Same class of issue: direct rendering of stored strings.
   - Should be fixed alongside #1 with shared escaping logic.

3) MEDIUM — Missing admin access check(s) (MEDIUM-missing-admin-access-check.md)
   - Risk of unauthorized operations or data access in admin views.
   - Requires consistent guard / middleware approach across routes.

4) LOW — Error message information leak (LOW-error-message-leak.md)
   - Limited impact but reduces fuzzing/attack cost.
   - Simple to patch; apply globally for production environments.

## 3. Actionable Roadmap

Use this as a checklist of concrete steps, each tied to specific files and patterns.

### Task 1: Sanitize displayed log values (XSS in Audit Logs)

- Related file: `src/web/app/admin/audit-log/page.tsx`
- Issue: Raw string interpolation for:
  - it.action
  - it.actorName
  - entry.message
  - meta fields k/v
- Action:
  1) Create a shared sanitization utility:
     - File: `src/shared/sanitizeText.ts` (or similar, depending on existing utils).
     - Content concept:

       ```ts
       export function sanitizeText(value: unknown): string {
         const s = String(value ?? "");
         return s
           .replace(/&/g, "&")
           .replace(/</g, "<")
           .replace(/>/g, ">")
           .replace(/"/g, """)
           .replace(/'/g, "'");
       }
       ```

  2) Update page.tsx to use it:
     - Wrap all log field renderings via `sanitizeText(...)`, e.g.:

       Before (vulnerable):
         {String(it.actorName)}
       After (safe):
         {sanitizeText(it.actorName)}

     - Apply consistently for:
       - it.action
       - it.actorName
       - entry.message
       - all meta fields k/v.

### Task 2: Sanitize metadata/detail modal content

- Related file(s): same as above; plus any component that renders rich detail views.
- Action:
  - Ensure all user-influenced strings in modals/panels are passed through `sanitizeText` or equivalent before rendering.
  - If components already render raw metadata objects, adjust them similarly to Task 1.

### Task 3: Enforce admin-only access checks

- Related file(s): 
  - Admin pages in `src/web/app/admin/...` (e.g., layout.tsx or page guard).
- Issue: Some admin endpoints/pages rely on implicit trust instead of verifying role/permission.
- Action:
  1) Define a centralized check:
     - Example utility: `src/shared/authGuards.ts` exporting something like:

       ```ts
       export function requireAdmin(user: { id?: string; role?: string }) {
         if (!user || user.role !== "admin") {
           throw new Error("ADMIN_REQUIRED");
         }
         return user as NonNullable<typeof user>;
       }
       ```

  2) Apply `requireAdmin` in:
     - Admin route handlers (API routes, page props).
     - Client-side guards in admin layout (`src/web/app/admin/layout.tsx`), redirecting non-admins.
  3) Audit every `/admin/...` endpoint for consistent use of this guard to avoid partial enforcement.

### Task 4: Reduce information leakage from error messages

- Related file(s): server + shared code returning errors to client.
- Issue: Errors may include stack traces, internal paths, or raw system messages in production.
- Action:
  1) Ensure a global error handler for production:
     - In server (e.g., main HTTP/Express-like entry), log full details internally but respond with safe, generic messages like:
       - "Internal server error"
     - Avoid echoing stack traces or environment internals to the client.

  2) If there is already an env-aware configuration (e.g., NODE_ENV check):
     - Confirm that verbose logging/error bodies only occur in dev/test and never in production.

## 4. Long-Term Recommendations

- Adopt a standard input/output sanitization policy:
  - Central utilities for sanitizing, escaping, and formatting untrusted data used across the UI and APIs.
- Harden admin boundaries:
  - Role-based access control (RBAC) middleware for all admin routes instead of ad-hoc checks.
- Integrate security tooling into CI:
  - Dependency audit (npm / yarn / pnpm).
  - Static analysis (ESLint with security rules, or similar).
- Enable content security policies and transport security headers at the web server/edge:
  - Content-Security-Policy to mitigate XSS impact.
  - Strict-Transport-Security for HTTPS-only traffic.

This plan should be treated as incremental: apply Tasks 1–4 first (they are localized), then roll out long-term controls across the project.