# Card Compositor

Public, brand-agnostic Next.js app: generate or batch-upload character art on Comfy Cloud and split it into print layers for a 2.5 × 3.5" trading card, with PSD, ZIP and 3D GLB exports.

## Rules
- **Public repo.** Everything committed here is world-readable.
- **Brand-agnostic.** No client names, client products, client mockups or presets derived from client work. No company logos as defaults (the logo slot starts empty).
- **Never commit keys.** `COMFY_CLOUD_API_KEY` and `ACCESS_CODE` live only in `.env.local` (git-ignored) or the host's env settings. `.env.example` lists names with no values. Run a secret scan before every push.
- Keys stay server-side: the browser only talks to `app/api/*`, which calls Comfy Cloud.
- Models are permissively licensed (FLUX.2 Klein 4B and Qwen-Image-Edit 2511, Apache 2.0; BEN2 base, MIT). Don't add non-commercial models.

## Stack
Next.js 16 / React 19 / TypeScript 5. `ag-psd` for PSD, `jszip` for ZIP, `three` + `model-viewer` for the GLB card.

## Layout
- `lib/layers.ts` — card geometry (trim, bleed, safe area, corner radius) and layer compositing.
- `lib/glb.ts` — card-shaped 3D export.
- `lib/presets.ts` — prompt presets (generic styles only).
- `workflows/*.json` — Comfy API-format workflows the server routes submit.

## Commands
- `npm run dev` — local dev server
- `npx tsc --noEmit` — type-check
