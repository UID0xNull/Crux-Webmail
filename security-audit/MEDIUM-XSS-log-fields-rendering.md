# MEDIUM — Unsanitized log messages and actor fields in admin view

## Classification
- CWE: CWE-79 – Improper Neutralization of Input During Web Page Generation (XSS)
- OWASP: A03:2021 – Injection
- CVSS v3.1: 5.8
- Vector: AV:N/AC:H/PR:H/UI:R/S:C/C:L/I:L/A:N

## Location
- File: src/web/app/admin/audit-log/page.tsx
- Line(s): ~120–136 (table rows rendering + fmtTimestamp)

## Vulnerable Code
```tsx
<tr key={it.id} className="cursor-pointer hover:bg-gray-100">
  <td className="py-2 px-4" title={String(it.action)}>{it.action}</td>
  ...
  <td className="max-w-[10vw] overflow-hidden" title={String(it.actorName)}>{String(it.actorName)}</td>
</tr>
```

Detail modal also:
```tsx
{(entry.actorName || entry.actorId) && (
  <div className="text-sm">Actor: {entry.actorName || `#${entry.actorId}`}</div>
)}
```

## Problem Description
The page renders `action` and `actorName` directly into DOM (and title attributes) using unfiltered backend data. While React escapes basic HTML in text nodes, this becomes risky if:
- A future change introduces dangerousSetInnerHTML.
- These values are used as parts of URLs, event handlers, or component props without re-checks.
This pattern relies on implicit safety instead of an explicit sanitization layer for untrusted log data.

## Attack Vector (conceptual)
1. Attacker forces creation of audit entries with crafted `action`/`actorName` via backend input injection.
2. Admin views the audit table or details; these values render in DOM nodes and title attributes.
3. If later integrated into unsafe contexts, this can enable reflected XSS under admin context.

## Impact
- Potential client-side script execution under admin credentials.
- Enables session theft or administrative actions if combined with unsafe rendering patterns.

## Solution (frontend)
- Apply a safe text sanitizer to all log fields rendered:
  - `sanitizeText(it.action)`, `sanitizeText(String(it.actorName))`, etc.
  - Use same `sanitizeText` utility as in MEDIUM-XSS-metadata-detail-modal.md.

Example snippet:
```tsx
<td className="py-2 px-4" title={sanitizeText(it.action)}>{sanitizeText(it.action)}</td>
... 
<td className="max-w-[10vw] overflow-hidden" title={sanitizeText(it.actorName || '')}>{String(it.actorName || '')}</td>
```

## References
- https://cwe.mitre.org/data/definitions/79.html