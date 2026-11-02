// Card geometry, and the frame / header / text / die layers drawn in the browser and sent to the workflow's slots.
// The canvas is the card plus 1/8" bleed on every side: 2.75 x 3.75" at 384 ppi = 1056 x 1440 px.
// Trim (the cut) is 2.5 x 3.5" with 1/8" rounded corners; keep text inside the safe area, 1/8" in from the trim.
export const W = 1056;
export const H = 1440;
export const PPI = 384;
export const CARD_IN = { w: 2.5, h: 3.5, bleed: 0.125 };
export type Rect = { x: number; y: number; w: number; h: number };
export const TRIM: Rect & { r: number } = { x: 48, y: 48, w: 960, h: 1344, r: 48 };
export const SAFE: Rect = { x: 96, y: 96, w: 864, h: 1248 };

/** window = where the character goes (the workflow makes the subject at this size, a multiple of 16, and places it here);
 *  header = name bar; text = description box (none = name only); footY = baseline of the small footer line. */
export type Layout = { id: string; label: string; fullArt: boolean; window: Rect; header: Rect; text?: Rect; footY: number };
export const LAYOUTS: Layout[] = [
  {
    id: "classic", label: "Classic", fullArt: false,
    header: { x: 112, y: 100, w: 832, h: 76 }, window: { x: 112, y: 184, w: 832, h: 576 },
    text: { x: 112, y: 784, w: 832, h: 500 }, footY: 1318,
  },
  {
    id: "full", label: "Full art", fullArt: true,
    header: { x: 112, y: 112, w: 832, h: 80 }, window: { x: 0, y: 0, w: W, h: H },
    text: { x: 112, y: 1000, w: 832, h: 284 }, footY: 1318,
  },
  {
    id: "fullname", label: "Full art, name only", fullArt: true,
    header: { x: 112, y: 112, w: 832, h: 80 }, window: { x: 0, y: 0, w: W, h: H }, footY: 1318,
  },
];
export const layoutOf = (id: string) => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];

export type Swatch = { id: string; label: string; hex: string; dark?: boolean }; // dark = needs dark text on top

export const FRAMES = [
  { id: "solid", label: "Solid" },
  { id: "gradient", label: "Gradient" },
  { id: "holo", label: "Holo frame" },
  { id: "off", label: "Off" },
];
export const HEADERS = [
  { id: "bar", label: "Bar" },
  { id: "pill", label: "Pill" },
  { id: "ribbon", label: "Ribbon" },
  { id: "off", label: "Off" },
];
// Where the holo foil prints: behind the character in the art (holo rare), on the frame only (reverse holo), or everywhere
export const FOIL_AREAS = [
  { id: "window", label: "Art, behind the character" },
  { id: "frame", label: "Frame only (reverse holo)" },
  { id: "card", label: "Whole card" },
];
export const SWATCHES: Swatch[] = [
  { id: "gold", label: "Gold", hex: "#d4af37", dark: true },
  { id: "silver", label: "Silver", hex: "#c9ccd1", dark: true },
  { id: "red", label: "Red", hex: "#b3141b" },
  { id: "black", label: "Black", hex: "#141016" },
  { id: "white", label: "White", hex: "#f5f3ee", dark: true },
  { id: "neon", label: "Neon green", hex: "#39ff14", dark: true },
  { id: "pink", label: "Hot pink", hex: "#ff2e93" },
  { id: "blue", label: "Royal blue", hex: "#1f4fd8" },
  { id: "purple", label: "Purple", hex: "#6b2fd6" },
  { id: "yellow", label: "Yellow", hex: "#f2ff59", dark: true },
];
export const AUTO = "auto";
const INK = "#211927";
const SILVER = "#c9ccd1"; // unprinted board, shown silver here so the foil preview reads on it

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
/** Mix toward white (0 keeps the color, 1 is white): the light text-box tint. */
function tint(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * (1 - t) + 255 * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

function canvas() {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return { c, g: c.getContext("2d")! };
}

const toBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("Could not draw layer"))), "image/png"));

function rrect(g: CanvasRenderingContext2D, r: Rect, radius: number) {
  g.beginPath();
  g.roundRect(r.x, r.y, r.w, r.h, radius);
}
const inset = (r: Rect, d: number): Rect => ({ x: r.x + d, y: r.y + d, w: r.w - d * 2, h: r.h - d * 2 });

/** Die line: white = inside the cut (the trim with rounded corners). Uploaded into the die slot every run. */
export async function drawDie(): Promise<Blob> {
  const { c, g } = canvas();
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#fff";
  rrect(g, TRIM, TRIM.r);
  g.fill();
  return toBlob(c);
}

/** The card frame: full bleed, with the art window cut out. Classic also carries the description box. */
export async function drawFrame(style: string, color: Swatch, layout: Layout): Promise<Blob> {
  const { c, g } = canvas();
  if (style === "off") {
    // no frame, but Classic still needs a readable description box over the background
    if (!layout.fullArt && layout.text) {
      rrect(g, layout.text, 18);
      g.fillStyle = "rgba(245, 243, 238, 0.94)";
      g.fill();
    }
    return toBlob(c);
  }
  const edge = style === "holo" ? "#8d9096" : shade(color.hex, 0.55);
  if (style === "holo") g.fillStyle = SILVER;
  else if (style === "gradient") {
    const grad = g.createLinearGradient(0, 0, W * 0.4, H);
    grad.addColorStop(0, tint(color.hex, 0.25));
    grad.addColorStop(0.55, color.hex);
    grad.addColorStop(1, shade(color.hex, 0.62));
    g.fillStyle = grad;
  } else g.fillStyle = color.hex;
  g.fillRect(0, 0, W, H);

  // full art keeps a thin border just inside the trim; classic cuts out the art window
  const hole = layout.fullArt ? inset(TRIM, 22) : layout.window;
  const radius = layout.fullArt ? 26 : 10;
  g.globalCompositeOperation = "destination-out";
  rrect(g, hole, radius);
  g.fill();
  g.globalCompositeOperation = "source-over";
  g.lineWidth = 6;
  g.strokeStyle = edge;
  rrect(g, inset(hole, -3), radius + 3);
  g.stroke();

  if (!layout.fullArt && layout.text) {
    rrect(g, layout.text, 18);
    g.fillStyle = tint(style === "holo" ? "#f5f3ee" : color.hex, 0.82);
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = edge;
    g.stroke();
  }
  return toBlob(c);
}

/** The name bar, plus (full-art layouts) the translucent description panel, which has to sit above the character. */
export async function drawHeader(style: string, color: Swatch, layout: Layout): Promise<Blob> {
  const { c, g } = canvas();
  const h = layout.header;
  const cy = h.y + h.h / 2;
  g.lineJoin = "round";
  if (style === "off" && layout.fullArt) {
    // no bar: a soft dark fade from the top so a white name reads on busy art
    const fade = g.createLinearGradient(0, 0, 0, h.y + h.h + 90);
    fade.addColorStop(0, "rgba(10, 6, 14, 0.7)");
    fade.addColorStop(1, "rgba(10, 6, 14, 0)");
    g.fillStyle = fade;
    g.fillRect(0, 0, W, h.y + h.h + 90);
  }
  if (style === "bar") {
    rrect(g, h, 12);
    g.fillStyle = color.hex;
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = shade(color.hex, 0.55);
    g.stroke();
  }
  if (style === "pill") {
    rrect(g, h, h.h / 2);
    g.fillStyle = color.hex;
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = INK;
    g.stroke();
    rrect(g, inset(h, 9), (h.h - 18) / 2);
    g.lineWidth = 2;
    g.strokeStyle = color.dark ? shade(color.hex, 0.7) : "rgba(255,255,255,0.55)";
    g.stroke();
  }
  if (style === "ribbon") {
    // V-notched tails behind the band, reaching toward the card edges
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? h.x : h.x + h.w;
      g.beginPath();
      g.moveTo(x0, h.y + 12);
      g.lineTo(x0 + s * 52, h.y + 12);
      g.lineTo(x0 + s * 30, cy + 12);
      g.lineTo(x0 + s * 52, h.y + h.h + 12);
      g.lineTo(x0, h.y + h.h + 12);
      g.closePath();
      g.fillStyle = shade(color.hex, 0.6);
      g.fill();
    }
    g.fillStyle = color.hex;
    g.fillRect(h.x, h.y, h.w, h.h);
    g.lineWidth = 5;
    g.strokeStyle = INK;
    g.strokeRect(h.x, h.y, h.w, h.h);
  }
  if (layout.fullArt && layout.text) {
    rrect(g, layout.text, 22);
    g.fillStyle = "rgba(14, 9, 18, 0.62)";
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = "rgba(255, 255, 255, 0.28)";
    g.stroke();
  }
  return toBlob(c);
}

export type TextColors = { name: string; body: string; foot: string };
/** Text has to stay readable on whatever sits under it. */
export function textColors(layout: Layout, header: string, headerColor: Swatch, frame: string, frameColor: Swatch): TextColors {
  const onFrame = layout.fullArt || frame === "off" ? "#FFFFFF" : frame === "holo" || frameColor.dark ? INK : "#FFFFFF";
  return {
    name: header !== "off" ? (headerColor.dark ? INK : "#FFFFFF") : onFrame,
    body: layout.fullArt ? "#F5F3EE" : INK,
    foot: layout.fullArt ? "rgba(255,255,255,0.85)" : onFrame,
  };
}

/** Word-wrap into lines no wider than `max`; line breaks in the source are kept. */
function wrap(g: CanvasRenderingContext2D, text: string, max: number) {
  const lines: string[] = [];
  for (const para of text.split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (g.measureText(next).width > max && line) { lines.push(line); line = word; } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** The text layer: name (left) and stat (right) on the header, description in the text box, footer line, logo. */
export async function drawTextLayer(o: {
  layout: Layout; name: string; stat?: string; description?: string; footer?: string; colors: TextColors;
  nameFont: string; bodyFont: string; logo?: Blob; nameArt?: Blob;
}): Promise<Blob> {
  const { c, g } = canvas();
  const { layout: l, colors } = o;
  const h = l.header;
  const cy = h.y + h.h / 2;
  await Promise.all([document.fonts.load(`700 40px ${o.nameFont}`), document.fonts.load(`400 30px ${o.bodyFont}`),
    document.fonts.load(`600 30px ${o.bodyFont}`)]);
  g.textBaseline = "middle";

  let statW = 0;
  const stat = o.stat?.trim().toUpperCase();
  if (stat) {
    g.font = `700 40px ${o.nameFont}`;
    statW = g.measureText(stat).width + 24;
    g.fillStyle = colors.name;
    g.textAlign = "right";
    g.fillText(stat, h.x + h.w - 28, cy + 2);
  }
  const room = h.w - 56 - statW;
  if (o.nameArt) {
    const art = await placeInBox(o.nameArt, room, h.h - 16, h.x + 28 + room / 2, cy);
    g.drawImage(await createImageBitmap(art), 0, 0);
  } else if (o.name.trim()) {
    const text = o.name.trim().toUpperCase();
    let size = 58;
    g.font = `700 ${size}px ${o.nameFont}`;
    while (g.measureText(text).width > room && size > 26) g.font = `700 ${(size -= 2)}px ${o.nameFont}`;
    g.fillStyle = colors.name;
    g.textAlign = "left";
    g.fillText(text, h.x + 28, cy + 2);
  }

  const body = o.description?.trim();
  if (l.text && body) {
    const box = inset(l.text, 32);
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    let size = 36, lines: string[] = [];
    for (; size >= 18; size -= 1) {
      g.font = `400 ${size}px ${o.bodyFont}`;
      lines = wrap(g, body, box.w);
      if (lines.length * size * 1.32 <= box.h) break;
    }
    g.fillStyle = colors.body;
    lines.forEach((line, k) => g.fillText(line, box.x, box.y + size + k * size * 1.32));
  }

  if (o.footer?.trim()) {
    g.font = `600 24px ${o.bodyFont}`;
    g.textBaseline = "alphabetic";
    g.textAlign = "left";
    g.fillStyle = colors.foot;
    g.fillText(o.footer.trim(), SAFE.x + 16, l.footY);
  }
  if (o.logo) {
    // bottom right, on the footer line, inside the safe area
    const placed = await placeInBox(o.logo, 240, 56, SAFE.x + SAFE.w - 136, l.footY - 12);
    g.drawImage(await createImageBitmap(placed), 0, 0);
  }
  return toBlob(c);
}

/** Fit uploaded art into a box on a full card canvas. */
export async function placeInBox(file: Blob, w: number, h: number, cx: number, cy: number): Promise<Blob> {
  const img = await createImageBitmap(file);
  const s = Math.min(w / img.width, h / img.height);
  const { c, g } = canvas();
  g.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
  return toBlob(c);
}
