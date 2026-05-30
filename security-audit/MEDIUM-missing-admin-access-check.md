# MEDIUM — Missing frontend defense-in-depth for admin-only route

## Classification
- CWE: CWE-601 – Open URL / Inadequate Access Control (defense-in-depth gap)
- OWASP: A01:2021 – Broken Access Control
- CVSS v3.1: 5.4
- Vector: AV:N/AC:L/PR:H/UI:N/S:C/C:N/I:L/A:N

## Location
- File: src/web/app/admin/audit-log/page.tsx (entire component)

## Vulnerable Code
There is no role or permission check in the page itself. Example:
```tsx
export default function AdminAuditPage() {
  // No verification that current user has admin rights before loading/rendering.
}
```

## Problem Description
The audit log viewer assumes:
- “Only admins reach this URL,” relying entirely on backend or outer routing to enforce access.
While correct enforcement should happen server-side, failing to assert required roles in the frontend:
- Breaks defense-in-depth (if route guards are misconfigured).
- Increases blast radius when a non-admin token reaches admin-only pages.

## Attack Vector (conceptual)
1. Attacker obtains or guesses an authenticated user session without admin role.
2. If routing protection is incomplete, the attacker directly navigates to /admin/audit-log.
3. Backend misconfiguration might allow loading logs; frontend does not reject the view even if some non-admin roles are allowed to fetch limited data.

## Impact
- Unauthorized exposure of audit logs, system events, actor information.
- Potential misuse for reconnaissance or social engineering attacks.

## Solution (frontend defense-in-depth)
Wrap the page with a role guard or check early inside:

Example pattern:
```tsx
if (!userRoles?.includes('ADMIN')) {
  return <p>Access denied</p>;
}
```
- Keep real access control enforced in backend, but add this as extra safety.

## References
- https://owasp.org/www-project-top-ten/2017/A2_2017-Broken_Authentication_and_Session_Management.html
- https://cwe.mitre.org/data/definitions/601.html