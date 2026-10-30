// README for exported ZIPs: what's inside, how the layers stack, and what prepress needs to know.
import { PPI } from "./layers";
// Written twice from the same data: README.md (plain text) and README.html (styled, opens in any browser).

export type ReadmeCard = { name: string; file: string; source?: string; seed: number; look: string[] };
export type ReadmeInfo = { kind: "batch" | "card"; cards: ReadmeCard[]; foilStrength?: number };

const SIZE = `2.5 x 3.5" card + 1/8" bleed at ${PPI} ppi`;

const LAYERS: [string, string][] = [
  ["Background", "Background art, full bleed."],
  ["Frame", "Card frame and text box, full bleed, with the art window cut out. A holo frame is left unprinted so the foil board shows."],
  ["Subject", "The character, cut out and placed in the art window."],
  ["Header", "Name bar (and the description panel on full-art cards)."],
  ["Text", "Name, stat, description, footer and logo."],
  ["Holo Foil", "Preview of the foil, Screen blend at the card's foil strength. For visualising only."],
  ["Foreground (WP)", "Hidden. Subject + header + text with no background: the art that blocks the holo."],
  ["PRINT Foil Mask", "Hidden. White = where foil shows."],
  ["PRINT White Plate", "Hidden. White = print white ink under the art; black = holo shows through."],
  ["PRINT Die Cut", "Hidden. White = inside the cut line (2.5 x 3.5\", 1/8\" corner radius)."],
];

const NOTES = [
  `Canvas is 2.75 x 3.75" at ${PPI} ppi: the 2.5 x 3.5" trim plus 1/8" bleed on every side. PSDs carry guides at the trim and the safe area.`,
  "Keep text and key art inside the safe area, 1/8\" in from the trim.",
  "Color mode is RGB, 8-bit. Convert to your press profile (CMYK or spot) in prepress.",
  "All layers are full-canvas and pixel-aligned; keep them registered when editing.",
  "The PRINT layers are hidden by default. Turn them on, or export them as separate plates, for the printer.",
];

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function readmeMd(i: ReadmeInfo) {
  const date = new Date().toISOString().slice(0, 10);
  const files = i.kind === "batch" ? "One layered PSD per card, in `psd/`." : "One PNG per layer, plus the flattened composite.";
  return [
    `# Comfy Cards export`,
    ``,
    `${date} · ${i.cards.length} card${i.cards.length === 1 ? "" : "s"} · ${SIZE}`,
    ``,
    files,
    ``,
    `## Cards`,
    ``,
    `| # | Name | File | Source image | Seed | Look |`,
    `|---|---|---|---|---|---|`,
    ...i.cards.map((c, k) => `| ${k + 1} | ${c.name || "Untitled"} | ${c.file} | ${c.source ?? "generated"} | ${c.seed} | ${c.look.join(", ")} |`),
    ``,
    `## Layers (bottom to top)`,
    ``,
    ...LAYERS.map(([n, d]) => `- **${n}**: ${d}`),
    ``,
    `## Print notes`,
    ``,
    ...NOTES.map((n) => `- ${n}`),
    ``,
    `Made with Comfy Cards on Comfy Cloud.`,
    ``,
  ].join("\n");
}

export function readmeHtml(i: ReadmeInfo) {
  const date = new Date().toISOString().slice(0, 10);
  const rows = i.cards.map((c, k) => `<tr><td class="n">${String(k + 1).padStart(2, "0")}</td><td><b>${esc(c.name || "Untitled")}</b></td>
    <td class="mono">${esc(c.file)}</td><td class="mono">${esc(c.source ?? "generated")}</td><td class="mono">${c.seed}</td>
    <td>${c.look.map((l) => `<span class="chip">${esc(l)}</span>`).join("")}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Comfy Cards export</title>
<style>
:root{--ink:#211927;--panel:#2a2131;--line:#3b3242;--yellow:#f2ff59;--canvas:#c2bfb9;--white:#f0efed}
*{box-sizing:border-box}body{margin:0;background:var(--ink);color:var(--white);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1040px;margin:0 auto;padding:48px 24px 64px}
.eyebrow{font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--canvas)}
h1{font-size:40px;line-height:1.05;margin:10px 0 8px;letter-spacing:-.02em}h2{font-size:18px;margin:40px 0 14px}
.meta{color:var(--canvas)}.meta b{color:var(--yellow);font-weight:600}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:6px 18px;overflow-x:auto}
table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:12px 10px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}th{font:600 11px ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--canvas)}
.mono{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--canvas)}.n{font-family:ui-monospace,Menlo,monospace;color:var(--yellow)}
.chip{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:1px 9px;margin:0 6px 6px 0;font-size:12px;color:var(--canvas)}
ol,ul{margin:0;padding:14px 18px 14px 34px}li{margin:6px 0}li b{color:var(--white)}li span{color:var(--canvas)}
footer{margin-top:40px;color:var(--canvas);font-size:13px}td b{white-space:nowrap}
</style></head><body><main>
<span class="eyebrow">Comfy Cards · export</span>
<h1>${i.kind === "batch" ? `${i.cards.length} cards, ready for print` : esc(i.cards[0]?.name || "Card export")}</h1>
<p class="meta">${date} · <b>${SIZE}</b>${i.foilStrength != null ? ` · foil preview ${i.foilStrength}%` : ""} · ${i.kind === "batch" ? "one layered PSD per card in <span class=\"mono\">psd/</span>" : "one PNG per layer plus the composite"}</p>
<h2>Cards</h2>
<div class="panel"><table><thead><tr><th>#</th><th>Name</th><th>File</th><th>Source image</th><th>Seed</th><th>Look</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>Layers, bottom to top</h2>
<div class="panel"><ol>${LAYERS.map(([n, d]) => `<li><b>${n}</b> <span>${d}</span></li>`).join("")}</ol></div>
<h2>Print notes</h2>
<div class="panel"><ul>${NOTES.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>
<footer>Made with Comfy Cards on Comfy Cloud.</footer>
</main></body></html>`;
}
