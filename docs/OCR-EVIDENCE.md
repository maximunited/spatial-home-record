# OCR / CV evidence assist (MVP)

Lean, pluggable pipeline that extracts **text hints** from document evidence context and suggests **document field / attribute fills** with explicit confidence. No CV model download; no automatic confirmation.

## Status

Shipped as Pass 2 MVP (item 12). Completeness gap scan is a separate shipped feature (item 15). Still **not** full binary OCR or scene reconstruction.

## What it does

| Capability | Behavior |
| ---------- | -------- |
| Text hints | From pasted plain text, filename tokens, and string metadata (`ocr_text`, `transcript`, `caption`, `summary`) |
| Document prefill | Merchant, document number, currency, total (attach form) |
| Attribute suggestions | Brand, model, serial, tile size, screen size, receipt reference — confidence `estimated` or `supported`, never `confirmed` |
| Providers | `heuristic` (default) and `none` (no-op); swap via `resolveOcrProvider` / `runOcrEvidenceAssist({ providerId })` |

## What it does not do

- Binary image/PDF OCR (Tesseract, cloud vision, ONNX, etc.)
- Photogrammetry / plan auto-trace / wall detection
- Live camera capture or continuous CV
- Auto-writing `confirmed` attributes
- Completeness-agent capture ranking (shipped separately; see Pass 2 item 15 in [README.md](README.md))

## Usage

Library: [`src/lib/ocr-evidence.ts`](../src/lib/ocr-evidence.ts)

```ts
import { runOcrEvidenceAssist } from "@/lib/ocr-evidence";

const result = runOcrEvidenceAssist({
  plainText: pastedReceiptText,
  filename: "receipt-ikea.pdf",
  preferredAttributeKeys: ["brand", "model"],
});
// result.suggestions → apply manually or via applyOcrAttributeSuggestionsAction
```

UI: on an entity detail panel, **Evidence text assist** — paste receipt/OCR text, preview suggestions, prefill the attach form, optionally apply attribute suggestions at `estimated` confidence.

Server action: `applyOcrAttributeSuggestionsAction` upserts only `target: "attribute"` keys with provenance `ocr_evidence_assist`.

## Checklist (this item)

- [x] Confirm still open vs north star in docs before coding
- [x] Pluggable provider interface (`heuristic` / `none`)
- [x] Text hints + attribute/document suggestions with confidence
- [x] No heavy CV dependency
- [x] Unit tests (`tests/ocr-evidence.test.ts`)
- [x] Docs index + TESTING entry
- [x] Thin UI + apply action (optional apply; never auto-confirm)

## Tests

```bash
npm run test:unit -- tests/ocr-evidence.test.ts
```

## Follow-ups (out of this PR)

- Real OCR provider behind the same interface (local or API)
- Persist assist runs as `evidence` type `inference`
- PDF text-layer extraction without a full CV stack
