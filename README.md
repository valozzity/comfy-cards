# Comfy Cards

Type a short idea or drop in your own artwork, and get a print-ready **2.5 × 3.5" trading card** split into layers: background, frame, character, header, text and holo foil, plus foil, white and die-cut plates. Runs on [Comfy Cloud](https://cloud.comfy.org); the API key stays on the server.

- **Layouts**: Classic (name bar, art window, description box), Full art, Full art with name only.
- **Your own look**: every Style, Palette and Framing dropdown has a Custom… option for your own words; background and foil too.
- **Generate or upload**: generate a character with FLUX.2 Klein 4B, or upload one image or a whole folder (each image becomes a card). Optional clean-up or restyle with Qwen-Image-Edit 2511. BEN2 cuts the character out.
- **Print geometry**: 1056 × 1440 px canvas = 2.5 × 3.5" trim + 1/8" bleed at 384 ppi, 1/8" rounded corners, 1/8" safe area.
- **Foil**: generated holo pattern, printed behind the character in the art (holo rare), on the frame only (reverse holo) or across the whole card.
- **Exports**: layered PSD (true size, guides at trim and safe), ZIP of PNG layers with a README, 3D `.glb` with an iridescent holo finish, and a batch ZIP of every PSD.
- **Edits**: Generate variation, or re-run the character, background or foil with a note; untouched layers are reused exactly.

## Run locally

```bash
npm install
cp .env.example .env.local   # then add your Comfy Cloud API key
npm run dev
```

| Variable | What it is |
|---|---|
| `COMFY_CLOUD_API_KEY` | Comfy Cloud API key. Every run bills this account. |
| `ACCESS_CODE` | Optional. Comma-separated codes for the access screen (one per audience, so each can be revoked). Empty = no screen. |
| `COMFY_BASE_URL` | Optional. Defaults to `https://cloud.comfy.org`. |

Never commit `.env.local`; it is git-ignored.

## How it fits together

- `workflows/*.json` — Comfy API graphs: `generate` (FLUX character), `upload` (your art, optional Qwen edit) and `edit` (one layer through Qwen). `lib/comfy.ts` fills prompts, seeds, the art window, the foil area and the uploaded layers per run.
- `app/api/*` — thin server routes (upload, run, status, outputs, file, edit, check). The browser polls; no long-running functions.
- `lib/layers.ts` — card geometry (`LAYOUTS`, trim, safe area) and the frame, header, text and die layers, drawn in the browser and uploaded into the workflow's layer slots.
- `lib/presets.ts` — style, palette, background and foil prompt presets.
- `lib/export.ts`, `lib/readme.ts` — PSD / ZIP / batch exports and their README. `lib/glb.ts` — the 3D card.

## Models

All permissively licensed: FLUX.2 Klein 4B (Apache 2.0), Qwen-Image-Edit 2511 (Apache 2.0), BEN2 base (MIT).

## License

[MIT](LICENSE)
