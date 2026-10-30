// Server-only helpers: talk to Comfy (Cloud today, a Comfy API deployment later) with the key kept on the server.
import generate from "../workflows/generate.json";
import upload from "../workflows/upload.json";
import edit from "../workflows/edit.json";

const BASE = process.env.COMFY_BASE_URL || "https://cloud.comfy.org"; // empty in .env counts as unset

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

function apiKey() {
  const key = process.env.COMFY_CLOUD_API_KEY;
  if (!key) throw new Error("COMFY_CLOUD_API_KEY is not set");
  return key;
}

export function comfy(path: string, init: RequestInit = {}) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), "X-API-Key": apiKey() },
    cache: "no-store",
  });
}

/** Returns a 401 response when ACCESS_CODE is set and the request doesn't carry one of its codes.
 *  ACCESS_CODE may list several, comma-separated (one per audience), so one can be revoked without the others. */
export function denied(req: Request) {
  const codes = (process.env.ACCESS_CODE ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  const sent = req.headers.get("x-access-code");
  if (!codes.length || (sent && codes.includes(sent))) return null;
  return Response.json({ error: "Wrong access code" }, { status: 401 });
}

// Node ids in workflows/*.json
export const OUTPUT_NODES: Record<string, string> = {
  "55": "composite", "90": "source", "62": "L1_fx", "65": "L2_frame", "68": "L3_subject",
  "71": "L4_banner", "74": "L5_text", "117": "L6_foil", "82": "P1_foil", "84": "P2_diecut",
  "900": "edited", // workflows/edit.json
};

/** One layer through Qwen-Image-Edit 2511 (re-running a card's background or foil with an instruction). */
export function buildEditGraph(image: string, prompt: string, seed: number, jobId: string): Graph {
  const g: Graph = structuredClone(edit) as Graph;
  g["100"].inputs.image = image;
  g["217"].inputs.prompt = prompt;
  g["222"].inputs.seed = seed;
  g["900"].inputs.filename_prefix = `CC/${jobId}/${jobId}_edit`;
  return g;
}
const LAYER_LOADERS: Record<string, string> = {
  background: "140", frame: "152", banner: "165", nameArt: "173", dieline: "160", foil: "110",
};

export type Rect = { x: number; y: number; w: number; h: number };
export type RunParams = {
  mode: "generate" | "upload";
  subjectPrompt?: string;
  enhance?: boolean;
  enhancePrompt?: string;
  backgroundPrompt: string;
  foilPrompt: string;
  foilStrength: number;
  foilArea?: "window" | "frame" | "card"; // where the holo prints (see FOIL_AREAS in lib/layers.ts)
  seeds: { subject: number; background: number; foil: number };
  uploads?: Partial<Record<"subject" | keyof typeof LAYER_LOADERS, string>>; // Comfy input file names
  window: Rect; // art window on the 1056 x 1440 card canvas; the subject is made at this size and placed here
};

// Empty layer slots load a tiny placeholder (the workflow switches on its < 16 px width to the template / generated
// layer). It lives in each Comfy account's input store, so the server uploads it once per process.
const TEMPLATE_PLACEHOLDER = "49ff5041e8e976b682b22e82d7f98d20948e2171eba81a62a31d04b2f3a995ac.png";
const PLACEHOLDER_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAADUlEQVR4nGNgGAUgAAABCAABgukLHQAAAABJRU5ErkJggg==";
let placeholder: Promise<string> | undefined;
export function placeholderName() {
  placeholder ??= (async () => {
    const form = new FormData();
    form.append("image", new Blob([Buffer.from(PLACEHOLDER_PNG, "base64")], { type: "image/png" }), "cc-placeholder.png");
    form.append("overwrite", "true");
    const r = await comfy("/api/upload/image", { method: "POST", body: form });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.name) throw new Error(`Placeholder upload failed (${r.status})`);
    return body.name as string;
  })().catch((e) => { placeholder = undefined; throw e; });
  return placeholder;
}

const even16 = (n: number) => Math.max(256, Math.round(n / 16) * 16);

export function buildGraph(p: RunParams, jobId: string, blank: string): Graph {
  const g: Graph = structuredClone(p.mode === "generate" ? generate : upload) as Graph;
  const set = (node: string, input: string, value: unknown) => { g[node].inputs[input] = value; };
  for (const node of Object.values(g)) {
    if (node.class_type === "LoadImage" && node.inputs.image === TEMPLATE_PLACEHOLDER) node.inputs.image = blank;
  }
  set("48", "text", " "); // the name and card text arrive as a drawn layer (nameArt slot)
  set("20", "text", p.backgroundPrompt);
  set("120", "text", p.foilPrompt);
  set("114", "opacity", Math.max(0, Math.min(100, Math.round(p.foilStrength))));
  set("23", "noise_seed", p.seeds.background);
  set("123", "noise_seed", p.seeds.foil);

  // art window: subject size, its place on the card, and the window mask (node 30) the foil area uses
  const win = { x: Math.round(p.window.x), y: Math.round(p.window.y), w: even16(p.window.w), h: even16(p.window.h) };
  for (const id of ["400", "401"]) { set(id, "x", win.x); set(id, "y", win.y); }
  set("30", "location_x", win.x + win.w / 2);
  set("30", "location_y", win.y + win.h / 2);
  set("30", "shape_width", win.w);
  set("30", "shape_height", win.h);
  if (p.mode === "generate") {
    set("10", "text", p.subjectPrompt ?? "");
    set("13", "noise_seed", p.seeds.subject);
    for (const id of ["7", "8"]) { set(id, "width", win.w); set(id, "height", win.h); }
  } else {
    if (!p.uploads?.subject) throw new Error("Upload a subject image first");
    set("100", "image", p.uploads.subject);
    set("208", "switch", p.enhance !== false);
    if (p.enhancePrompt) set("217", "prompt", p.enhancePrompt);
    set("222", "seed", p.seeds.subject);
    for (const id of ["101", "224"]) { set(id, "width", win.w); set(id, "height", win.h); }
  }

  // foil mask 113 = foil pattern inside the die. "window": only in the art, and not over the character, header or
  // text; "frame": only outside the art window (reverse holo); "card": everywhere (the template as built)
  const mask = (id: string, operation: string, from: string, by: string) =>
    (g[id] = { class_type: "MaskComposite", inputs: { x: 0, y: 0, operation, destination: [from, 0], source: [by, 0] } });
  let foil = "113";
  if (p.foilArea === "window") {
    mask("950", "multiply", "113", "30");
    mask("951", "subtract", "950", "180");
    mask("952", "subtract", "951", "182");
    mask("953", "subtract", "952", "183");
    foil = "953";
  } else if (p.foilArea === "frame") {
    mask("950", "subtract", "113", "30");
    mask("951", "subtract", "950", "182");
    mask("952", "subtract", "951", "183");
    foil = "952";
  }
  if (foil !== "113") {
    set("114", "layer_mask", [foil, 0]);
    set("115", "mask", [foil, 0]);
    set("133", "destination", [foil, 0]);
  }

  for (const [layer, node] of Object.entries(LAYER_LOADERS)) {
    const file = p.uploads?.[layer as keyof typeof LAYER_LOADERS];
    if (file) set(node, "image", file); // otherwise the placeholder keeps the template / generated layer
  }
  for (const node of Object.values(g)) {
    const prefix = node.inputs.filename_prefix;
    if (typeof prefix === "string") node.inputs.filename_prefix = prefix.replace("CC/", `CC/${jobId}/${jobId}_`);
  }
  return g;
}
