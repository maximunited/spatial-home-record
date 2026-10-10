# Private share links

Tokenized, optionally passcode-protected links that expose a **redacted** project view with explicit layer permissions.

## Layers

| Layer | What guests see |
| ----- | --------------- |
| Walkthrough | Parametric 3D scene + share-safe plan/photo evidence (underlays, construction/current wall photos) |
| Dimensions | Plan size / length / height attributes |
| Technical | Circuit, outlet, cable, avoid-drilling style attributes |
| Inventory summary | Built-in / shelf / container names and non-payment attrs (brand, model, counts) |

**Never shareable (hard rule):** document **originals**, receipts/invoices/warranties in the share payload, payment attribute keys (`purchase_price`, `receipt_total`, …), and blob URLs whose storage key looks like a receipt/invoice (unless an explicit redacted/underlay key was chosen). There is no UI toggle for payments.

**Redacted document blobs (MVP):** Owners can manually upload a redacted file on a document in the entity Documents panel (`documents.redacted_blob_id`). Share links may **serve** that redacted blob via `/api/blobs/…?share=<token>`. Originals stay blocked. When walkthrough evidence points at a document original that has a redacted copy, the share payload prefers the redacted storage key. This is manual upload only — not automated CV redaction.

## Create a share link

1. Open the project overview: `/projects/[id]`.
2. In **Private share links**, set optional label, expiry (days), and passcode.
3. Check the layers to expose (walkthrough defaults on).
4. Click **Create share link**.
5. Copy the URL shown: `/share/<token>` (full origin + that path).

Revoke from the same panel — revoked tokens immediately 404.

Apply the schema first if needed:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/0001_share_links.sql
# or
npx drizzle-kit push
```

## Public route

`/share/[token]` is Clerk-public (see [`src/middleware.ts`](../src/middleware.ts)).

- No project Documents panel
- Walkthrough runs in `shareMode` (no links into private entity/detail routes)
- Passcode (if set) is verified with scrypt; unlock is stored in an httpOnly cookie scoped to `/share/<token>`

## Security caveats

1. **Token is the secret.** Anyone with the URL can open the allowed layers until expiry/revoke. Prefer a passcode for sensitive homes, and short expiry.
2. **Private uploads stay behind `/api/blobs`.** Share pages append `?share=<token>`; the blob route only serves the file when the token is active, the blob belongs to that project, and either (a) it is an owner-uploaded document **redacted** blob, or (b) it is linked as share-safe evidence and is **not** a document original. Seed assets under `/seed/…` remain world-readable (demo only).
3. **Passcodes are hashed (scrypt), never stored plaintext.** Passcodes are not written to the repo or logs.
4. **Layer flags fail closed** for unknown attribute keys — only allowlisted dimension / technical / inventory keys appear.
5. **Do not commit share tokens or passcodes** into docs, seeds, or `.env` examples.
6. **Revocation is soft** (`revoked_at`); rows remain for audit but `loadShareView` rejects them.
7. **Passcode unlock is cookie-scoped** to `/share/<token>` — it does not unlock arbitrary `/api/blobs` paths without the share query param.

## Code map

| Piece | Path |
| ----- | ---- |
| Schema | [`src/db/schema.ts`](../src/db/schema.ts) (`share_links`, `documents.redacted_blob_id`) |
| Migration | [`drizzle/0001_share_links.sql`](../drizzle/0001_share_links.sql) |
| Redaction | [`src/lib/share-redaction.ts`](../src/lib/share-redaction.ts) |
| CRUD / passcode | [`src/lib/share-links.ts`](../src/lib/share-links.ts) |
| Redacted upload | [`src/lib/documents.ts`](../src/lib/documents.ts) (`setDocumentRedactedBlob`), owner UI in [`documents-section.tsx`](../src/components/documents-section.tsx) |
| Viewer | [`src/app/share/[token]/page.tsx`](../src/app/share/[token]/page.tsx) |
| Owner UI | [`src/components/share-links-panel.tsx`](../src/components/share-links-panel.tsx) |
| Tests | [`tests/share-redaction.test.ts`](../tests/share-redaction.test.ts), integration case in `projects.integration.test.ts` |
