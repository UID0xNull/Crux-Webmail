# MEDIUM — Reflected XSS via uncontrolled audit log metadata in DetailModal

## Classification
- CWE: CWE-79 – Improper Neutralization of Input During Web Page Generation (XSS)
- OWASP: A03:2021 – Injection
- CVSS v3.1: 6.1
- Vector: AV:N/AC:L/PR:H/UI:R/S:C/C:H/I:N/A:N

## Location
- File: src/web/app/admin/audit-log/page.tsx
- Line(s): ~184–209 (DetailModal and metaFields logic)

## Vulnerable Code
```tsx
const metaFields = Object.entries(
  (entry as AdminAuditLogEntry & Record<string, unknown>) || {}
).filter(([key]) => ['id', 'level', 'timestamp'].includes(key) === false);

...

{metaFields.length > 0 && (
  <div className="text-xs text-gray-600">
    {metaFields.map(([k, v]) => (
      <p key={k}>
        {k}: {String(v)}
      </p>
    ))}
  </div>
)}

{entry.message && <p className="text-sm">{entry.message}</p>}
```

## Problem Description
The DetailModal renders arbitrary fields from audit log entries directly into the DOM via `String()` without sanitization:
- All extra keys in entry are rendered as metadata.
- The message field is injected verbatim into JSX text content.
While React auto-escapes basic XSS, this pattern becomes unsafe if:
- Values include objects that coerce to strings with embedded HTML/URIs used elsewhere.
- Code later adopts `dangerouslySetInnerHTML`, SSR hydration quirks, or integration with rich-text components.
The page assumes backend-controlled data is safe and performs no defensive neutralization of untrusted fields.

## Attack Vector (conceptual)
1. Attacker triggers actions whose audit logs record crafted values in metadata/message fields via controlled inputs to endpoints.
2. Admin opens an event detail modal; the crafted values are rendered into DOM nodes from these fields.
3. If downstream rendering or extensions interpret parts of those strings as HTML/JS (or they influence attributes), this can lead to XSS under admin context, enabling session hijacking or full compromise depending on backend trust.

## Impact
- Execution in the admin’s browser under a trusted domain.
- Potential theft of admin cookies/tokens, escalation of actions via crafted requests from the admin session.

## Solution (frontend)
- Introduce a centralized sanitizer:

  - Example: `src/web/lib/security/sanitize.ts`:

```ts
const HTML_ESCAPE = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

export function sanitizeText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    return value.replace(/[&<>"']/g, c => HTML_ESCAPE[c as keyof typeof HTML_ESCAPE] ?? c);
  }
  try {
    const s = JSON.stringify(value, null, 2);
    // basic truncation to avoid DoS via huge payloads
    return s.length > 500 ? s.slice(0, 500) + '...' : s;
  } catch {
    return String(value).slice(0, 300);
  }
}
```

- Use it where logs are rendered:

```tsx
{metaFields.map(([k, v]) => (
  <p key={k}>
    {sanitizeText(k)}: {sanitizeText(v)}
  </p>
))}

{entry.message && <p className="text-sm">{sanitizeText(entry.message)}</p>}
```

- On backend: treat all user input in audit logs as untrusted; never log raw HTML, tokens, or secrets. Use allowlists for logged fields.

## References
- https://cwe.mitre.org/data/definitions/79.html
- https://owasp.org/www-project-top-ten/2017/A3_2017-Cross-Site_Scripting_(XSS).html
```