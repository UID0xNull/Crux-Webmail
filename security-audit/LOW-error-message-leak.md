# LOW — Potential information leakage via generic error display

## Classification
- CWE: CWE-209 – Information Exposure Through an Error Message
- OWASP: A05:2021 – Security Misconfiguration / A09:2021 – Logging and Monitoring Failures
- CVSS v3.1: 3.7
- Vector: AV:N/AC:H/PR:H/UI:N/S:U/C:L/I:N/A:N

## Location
- File: src/web/app/admin/audit-log/page.tsx
- Line(s): ~29–35 (load + setError)

## Vulnerable Code
```tsx
} catch (e: any) {
  setError(e?.message ?? 'Failed to load audit logs');
}
```

Rendered later with:
```tsx
{error && (
  <p className="text-red-600">{error}</p>
)}
```

## Problem Description
The component displays backend error messages verbatim into the UI via e?.message.
If an HTTP response or runtime error includes internal details (stack traces, DB/Redis errors, internal URLs), these can be shown directly in the admin view, aiding reconnaissance for further exploitation.

## Attack Vector (conceptual)
- Attacker with admin access triggers operations that cause backend failures.
- Internal error messages appear in this page, revealing tech stack or environment details useful to craft more precise attacks.

## Impact
- Leaked internal details can help an attacker:
  - Map the architecture and services.
  - Target specific components or known vulnerabilities.

## Solution
Normalize and sanitize displayed errors. Example:
```tsx
catch (e: any) {
  // Log raw error internally only; show a safe message to users.
  const msg = e?.message as string | undefined;
  setError(
    msg && !msg.includes('at ') 
      ? msg.slice(0, 120) + '...' 
      : 'Failed to load audit logs'
  );
}
```
- Prefer centralized error handling that never surfaces raw stack traces or environment-specific paths.

## References
- https://cwe.mitre.org/data/definitions/209.html
- https://owasp.org/www-project-top-ten/2017/A6_2017-Security_Misconfiguration.html