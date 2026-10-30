// Browser-side exports: a layered PSD (ag-psd) and a ZIP of the PNG layers, built from the card's downloaded files.
import { writePsd, type Layer } from "ag-psd";
import JSZip from "jszip";
import { readmeHtml, readmeMd, type ReadmeCard, type ReadmeInfo } from "./readme";
import { H, PPI, SAFE, TRIM, W } from "./layers";

// bottom -> top; print masks go on top, hidden, for prepress
const STACK: { key: string; name: string; blend?: "screen"; hidden?: boolean }[] = [
  { key: "L1_fx", name: "Background" },
  { key: "L2_frame", name: "Frame" },
  { key: "L3_subject", name: "Subject" },
  { key: "L4_banner", name: "Header" },
  { key: "L5_text", name: "Text" },
  { key: "L6_foil", name: "Holo Foil", blend: "screen" },
  { key: "FG_plate", name: "Foreground (WP)", hidden: true },
  { key: "P1_foil", name: "PRINT Foil Mask", hidden: true },
  { key: "P3_white", name: "PRINT White Plate", hidden: true },
  { key: "P2_diecut", name: "PRINT Die Cut", hidden: true },
];

async function canvasFrom(blob: Blob) {
  const img = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return c;
}

function save(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

const toPng = (c: HTMLCanvasElement) =>
  new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("Could not build plate"))), "image/png"));

/** Foreground plate (subject + header + text, no background) and its white plate: where the art blocks the holo.
 *  Built here from layers the workflow already returns. */
async function withPlates(files: Record<string, Blob>) {
  const parts = ["L3_subject", "L4_banner", "L5_text"].filter((k) => files[k]);
  if (!parts.length) return files;
  const fg = await canvasFrom(files[parts[0]]);
  const g = fg.getContext("2d")!;
  for (const k of parts.slice(1)) g.drawImage(await createImageBitmap(files[k]), 0, 0);
  const white = document.createElement("canvas");
  white.width = fg.width;
  white.height = fg.height;
  const wg = white.getContext("2d")!;
  const src = g.getImageData(0, 0, fg.width, fg.height).data;
  const out = wg.createImageData(fg.width, fg.height);
  for (let i = 0; i < src.length; i += 4) {
    const v = src[i + 3] > 128 ? 255 : 0; // white = print white under the art, black = holo shows
    out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
    out.data[i + 3] = 255;
  }
  wg.putImageData(out, 0, 0);
  return { ...files, FG_plate: await toPng(fg), P3_white: await toPng(white) };
}

// Photoshop guides at the trim and the safe area (bleed is the canvas edge)
const GUIDES = [
  ...[TRIM.x, TRIM.x + TRIM.w, SAFE.x, SAFE.x + SAFE.w].map((location) => ({ location, direction: "vertical" as const })),
  ...[TRIM.y, TRIM.y + TRIM.h, SAFE.y, SAFE.y + SAFE.h].map((location) => ({ location, direction: "horizontal" as const })),
];

/** foilOpacity = the card's Foil strength (0-1): the workflow screens the foil at that opacity, so the PSD matches it.
 *  Tagged at 384 ppi, so the 1056 x 1440 canvas opens as 2.75 x 3.75" (2.5 x 3.5" trim plus 1/8" bleed). */
export async function buildPsd(raw: Record<string, Blob>, foilOpacity = 1) {
  const files = await withPlates(raw);
  const children: Layer[] = [];
  for (const s of STACK) {
    if (!files[s.key]) continue;
    children.push({
      name: s.name, canvas: await canvasFrom(files[s.key]), blendMode: s.blend ?? "normal", hidden: !!s.hidden,
      opacity: s.key === "L6_foil" ? foilOpacity : 1,
    });
  }
  if (!children.length) throw new Error("No layers to export");
  const composite = files.composite ? await canvasFrom(files.composite) : undefined;
  const resolutionInfo = { horizontalResolution: PPI, horizontalResolutionUnit: "PPI", widthUnit: "Inches", verticalResolution: PPI, verticalResolutionUnit: "PPI", heightUnit: "Inches" } as const;
  const buf = writePsd({
    width: W, height: H, children, canvas: composite,
    imageResources: { resolutionInfo, gridAndGuidesInformation: { guides: GUIDES } },
  });
  return new Blob([buf], { type: "image/vnd.adobe.photoshop" });
}

export async function downloadPsd(raw: Record<string, Blob>, base: string, foilOpacity = 1) {
  save(await buildPsd(raw, foilOpacity), `${base}.psd`);
}

function addReadme(zip: JSZip, info: ReadmeInfo) {
  zip.file("README.html", readmeHtml(info));
  zip.file("README.md", readmeMd(info));
}

export type BatchCard = { files: Record<string, Blob>; base: string; foilOpacity: number; card: Omit<ReadmeCard, "file"> };

/** Every finished card as a layered PSD in one ZIP, with a README. PSDs are stored, not re-compressed (they're big
 *  and already RLE-packed), so zipping stays fast. */
export async function downloadAll(cards: BatchCard[], onProgress?: (done: number) => void) {
  const zip = new JSZip();
  const rows: ReadmeCard[] = [];
  for (const [k, c] of cards.entries()) {
    zip.file(`psd/${c.base}.psd`, await buildPsd(c.files, c.foilOpacity), { compression: "STORE" });
    rows.push({ ...c.card, file: `psd/${c.base}.psd` });
    onProgress?.(k + 1);
  }
  addReadme(zip, { kind: "batch", cards: rows });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  save(await zip.generateAsync({ type: "blob" }), `comfy-cards_${cards.length}-cards_${stamp}.zip`);
}

export async function downloadZip(raw: Record<string, Blob>, base: string, card?: Omit<ReadmeCard, "file">, foilStrength?: number) {
  const files = await withPlates(raw);
  const zip = new JSZip();
  for (const [key, blob] of Object.entries(files)) zip.file(`${base}_${key}.png`, blob);
  if (card) addReadme(zip, { kind: "card", cards: [{ ...card, file: `${base}_*.png` }], foilStrength });
  save(await zip.generateAsync({ type: "blob" }), `${base}_layers.zip`);
}

/** Downscale (and re-encode as PNG, keeping alpha) so uploads stay under the serverless request limit. */
export async function prepareUpload(file: File, maxEdge = 2048): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("Could not read image"))), "image/png"));
}
