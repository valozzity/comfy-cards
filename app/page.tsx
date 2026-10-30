"use client";

import { useEffect, useRef, useState } from "react";
import { downloadAll, downloadPsd, downloadZip, prepareUpload } from "@/lib/export";
import {
  BACKGROUNDS, CUSTOM, FOILS, FRAMINGS, PALETTES, RANDOM, STYLES, VARIATION_PROMPT, backgroundEditPrompt, characterPrompt, choose, editPrompt, foilEditPrompt, resolve, restylePrompt,
  pick, type Preset,
} from "@/lib/presets";
import {
  AUTO, FOIL_AREAS, FRAMES, HEADERS, LAYOUTS, SWATCHES, drawDie, drawFrame, drawHeader, drawTextLayer, layoutOf, textColors,
  type Rect, type Swatch, type TextColors,
} from "@/lib/layers";
import { bodyFont, nameFont } from "./fonts";
import Viewer3D from "./Viewer3D";
import Tour, { type TourStep } from "./Tour";
import { buildGlb } from "@/lib/glb";

type Mode = "generate" | "upload";
type LayerSlot = "background" | "frame" | "banner" | "nameArt" | "dieline" | "foil";
type Seeds = { subject: number; background: number; foil: number };
type Params = {
  mode: Mode; name: string; subjectPrompt?: string; enhance?: boolean; enhancePrompt?: string;
  backgroundPrompt: string; foilPrompt: string; foilStrength: number; foilArea: string; seeds: Seeds;
  uploads?: Partial<Record<"subject" | LayerSlot, string>>;
  window: Rect;
};
// what the dropdowns resolved to for this card (shown as chips; reused by "New background")
type Picks = {
  style?: string; palette?: string; background: string; foil: string; bgChoice: string; foilChoice: string;
  layout?: string; frame?: string; header?: string; framing?: string; from?: string;
};
// everything on the text layer except the name, so a re-run with a new name can redraw it
type CardText = { layout: string; stat: string; description: string; footer: string; colors: TextColors; logo?: File; nameArt?: File };
type Card = {
  key: string; params: Params; picks: Picks; id?: string; status: string; error?: string; source?: string;
  files?: Record<string, Blob>; urls?: Record<string, string>; view: string; rerunOpen?: boolean; text?: CardText;
};
type Rerun = { character: boolean; background: boolean; foil: boolean; note: string; name: string; variation?: boolean };

const LAYER_SLOTS: { key: LayerSlot; label: string; hint: string }[] = [
  { key: "background", label: "Background", hint: "any size · default generated" },
  { key: "frame", label: "Frame", hint: "card-size PNG · replaces the Frame" },
  { key: "banner", label: "Header", hint: "card-size PNG · replaces the Header" },
  { key: "nameArt", label: "Name art", hint: "transparent PNG · replaces the typed name" },
  { key: "dieline", label: "Die line", hint: "white = inside the cut · default rounded 2.5 × 3.5\"" },
  { key: "foil", label: "Foil", hint: "transparent PNG · default generated" },
];
const STRIP = ["composite", "L1_fx", "L2_frame", "L3_subject", "L4_banner", "L5_text", "L6_foil", "P2_diecut"];
const TERMINAL = ["success", "error", "non_retryable_error", "lost", "cancelled"];
const seed = () => Math.floor(Math.random() * 2 ** 31);

function Drop({ file, onFile, big, title, hint }: { file?: File; onFile: (f?: File) => void; big?: boolean; title: string; hint: string }) {
  const [over, setOver] = useState(false);
  const url = useRef<string>("");
  if (file && !url.current) url.current = URL.createObjectURL(file);
  if (!file && url.current) { URL.revokeObjectURL(url.current); url.current = ""; }
  return (
    <label className={`drop${big ? " big" : ""}${over ? " over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]); }}>
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onFile(e.target.files?.[0])} />
      {file ? <img src={url.current} alt="" /> : null}
      <div>
        <div className="t">{file ? file.name : title}</div>
        <div className="s">{file ? "click to replace" : hint}</div>
      </div>
      {file ? <button type="button" className="clear" onClick={(e) => { e.preventDefault(); onFile(undefined); }}>remove</button> : null}
    </label>
  );
}

// Upload mode takes one image or a whole folder: each image becomes its own card(s), named from its file name.
type Source = { id: string; file: File; name: string };
const IMAGE = /\.(png|jpe?g|webp)$/i;
const nameFromFile = (f: File) =>
  f.name.replace(/\.[^.]+$/, "").replace(/[-_.]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();

/** Files from a drop, walking into dropped folders (Chrome / Safari / Firefox directory entries). */
async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (!entries.some((e) => e.isDirectory)) return [...dt.files];
  const out: File[] = [];
  const walk = async (e: FileSystemEntry): Promise<void> => {
    if (e.isFile) { out.push(await new Promise<File>((ok, no) => (e as FileSystemFileEntry).file(ok, no))); return; }
    const reader = (e as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((ok, no) => reader.readEntries(ok, no));
      if (!batch.length) break;
      for (const c of batch) await walk(c);
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

function BatchDrop({ sources, onAdd, onChange }: {
  sources: Source[]; onAdd: (files: File[]) => void; onChange: (s: Source[]) => void;
}) {
  const [over, setOver] = useState(false);
  const urls = useRef(new Map<string, string>());
  const thumb = (s: Source) => {
    if (!urls.current.has(s.id)) urls.current.set(s.id, URL.createObjectURL(s.file));
    return urls.current.get(s.id)!;
  };
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  const pickers = (
    <div className="pick-row">
      <label className="btn-line">Choose images<input type="file" multiple accept="image/png,image/jpeg,image/webp"
        onChange={(e) => { onAdd([...(e.target.files ?? [])]); e.target.value = ""; }} /></label>
      <label className="btn-line">Choose folder<input type="file" {...({ webkitdirectory: "" } as object)}
        onChange={(e) => { onAdd([...(e.target.files ?? [])]); e.target.value = ""; }} /></label>
    </div>
  );
  return (
    <div className={`batch${over ? " over" : ""}`} data-tour="batch"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={async (e) => { e.preventDefault(); setOver(false); onAdd(await filesFromDrop(e.dataTransfer)); }}>
      {sources.length === 0 ? (
        <div className="batch-empty">
          <div className="t">Drop your artwork here</div>
          <div className="s">One image, several, or a whole folder · PNG, JPG or WEBP · each image becomes its own card</div>
          {pickers}
        </div>
      ) : (
        <>
          <div className="row"><span className="eyebrow">{sources.length} image{sources.length === 1 ? "" : "s"}</span>
            <button type="button" className="btn-line" onClick={() => onChange([])}>Clear all</button></div>
          <div className="batch-list">{sources.map((s) => (
            <div className="batch-item" key={s.id}>
              <img src={thumb(s)} alt="" />
              <input type="text" value={s.name} aria-label={`Name for ${s.file.name}`}
                onChange={(e) => onChange(sources.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))} />
              <button type="button" className="clear" title={s.file.name}
                onClick={() => onChange(sources.filter((x) => x.id !== s.id))}>remove</button>
            </div>))}</div>
          {pickers}
        </>
      )}
    </div>
  );
}

function Select({ label, value, onChange, options, random, custom }: {
  label: string; value: string; onChange: (v: string) => void; options: Preset[]; random?: string; custom?: boolean;
}) {
  return (
    <label className="field"><span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {random ? <option value={RANDOM}>{random}</option> : null}
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        {custom ? <option value={CUSTOM}>Custom…</option> : null}
      </select>
    </label>
  );
}

function RerunPanel({ card, onRun, onClose }: { card: Card; onRun: (o: Rerun) => void; onClose: () => void }) {
  const [o, setO] = useState<Rerun>({ character: true, background: false, foil: false, note: "", name: card.params.name });
  const toggle = (k: "character" | "background" | "foil") => setO((v) => ({ ...v, [k]: !v[k] }));
  const nothing = !o.character && !o.background && !o.foil && o.name === card.params.name;
  return (
    <div className="rerun">
      <span className="eyebrow">Re-run these layers</span>
      <div className="checks">
        {(["character", "background", "foil"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={o[k]} onClick={() => toggle(k)}>{k === "foil" ? "Holo foil" : k[0].toUpperCase() + k.slice(1)}</button>
        ))}
      </div>
      <label className="field"><span>What should change?</span>
        <textarea value={o.note} placeholder={o.character ? "make the hat gold and add sunglasses" : "leave empty for a fresh theme"}
          onChange={(e) => setO((v) => ({ ...v, note: e.target.value }))} /></label>
      <label className="field"><span>Card name</span>
        <input type="text" value={o.name} onChange={(e) => setO((v) => ({ ...v, name: e.target.value }))} /></label>
      <span className="muted" style={{ fontSize: 12 }}>Character edits use Qwen-Image-Edit 2511 on this card. Layers you leave unchecked are reused exactly.</span>
      <div className="actions">
        <button className="btn" disabled={nothing} onClick={() => onRun(o)}>Re-run</button>
        <button className="btn-line" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

export default function Page() {
  const [code, setCode] = useState("");
  const [access, setAccess] = useState<"checking" | "locked" | "open">("checking"); // the code screen comes first
  const [codeError, setCodeError] = useState("");
  const [mode, setMode] = useState<Mode>("generate");
  const [name, setName] = useState("PARTY PUG");
  const [layoutId, setLayoutId] = useState("classic");
  const [stat, setStat] = useState("LV 12");
  const [description, setDescription] = useState("Confetti Blast: once per turn, shake the room. Everyone nearby gets a little happier.\n\nNever misses a party. Rarely invited back.");
  const [footer, setFooter] = useState("Illus. You · 001/100");
  // character
  const [idea, setIdea] = useState("Pug with a party hat");
  const [styleId, setStyleId] = useState("card");
  const [paletteId, setPaletteId] = useState("any");
  const [framingId, setFramingId] = useState("full");
  // the user's own Style / Palette / Framing text, used when the dropdown is on Custom…
  const [styleCustom, setStyleCustom] = useState("Soft watercolor storybook illustration with loose ink outlines, gentle washes of color and visible paper texture.");
  const [paletteCustom, setPaletteCustom] = useState("teal, coral and warm cream");
  const [framingCustom, setFramingCustom] = useState("shown as a close-up portrait of the head and shoulders, centered and filling the frame.");
  const [logo, setLogo] = useState<File>();
  const [viewer, setViewer] = useState<{ url: string; filename: string }>();
  const [fullPrompt, setFullPrompt] = useState("");
  const [fullEdited, setFullEdited] = useState(false);
  // upload treatment: "off" = as-is, "enhance" = clean up only, a style id or random = restyle
  const [treatment, setTreatment] = useState("enhance");
  // background + foil
  const [bgId, setBgId] = useState(RANDOM);
  const [foilId, setFoilId] = useState(RANDOM);
  const [bgCustom, setBgCustom] = useState(BACKGROUNDS[0].text);
  const [foilCustom, setFoilCustom] = useState(FOILS[0].text);
  const [foilStrength, setFoilStrength] = useState(60);
  const [foilArea, setFoilArea] = useState("window");
  const [frameId, setFrameId] = useState("solid");
  const [frameColor, setFrameColor] = useState(AUTO);
  const [headerId, setHeaderId] = useState("bar");
  const [headerColor, setHeaderColor] = useState(AUTO);
  const [count, setCount] = useState(2);
  const [sources, setSources] = useState<Source[]>([]);
  const [busyText, setBusyText] = useState("");
  const [zipping, setZipping] = useState<number>(); // cards packed so far while building "Download all"
  const [layers, setLayers] = useState<Partial<Record<LayerSlot, File>>>({});
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [touring, setTouring] = useState(false);
  const addSources = (files: File[]) => setSources((cur) => [
    ...cur,
    ...files.filter((f) => IMAGE.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((file) => ({ id: crypto.randomUUID(), file, name: nameFromFile(file) })),
  ]);
  const uploaded = useRef(new Map<File, string>()); // don't re-upload the same file on every run
  const drawn = useRef(new Map<string, string>()); // drawn frame / header / text / die layers, by look

  async function codeWorks(c: string) {
    const r = await fetch("/api/check", { headers: { "x-access-code": c } }).catch(() => null);
    return !!r?.ok;
  }
  // a saved code from an earlier visit skips the screen, but only if the server still accepts it
  useEffect(() => {
    let saved = "";
    try { saved = localStorage.getItem("cc-code") ?? ""; } catch {}
    setCode(saved);
    // with no ACCESS_CODE on the server, an empty code passes and the screen is skipped
    (async () => setAccess((await codeWorks(saved)) ? "open" : "locked"))();
  }, []);
  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setCodeError("");
    if (!(await codeWorks(code))) { setCodeError("That code didn't work."); return; }
    try { localStorage.setItem("cc-code", code); } catch {}
    setAccess("open");
  }

  // live preview of the composed character prompt (until the user edits it by hand)
  const previewStyle = styleId === RANDOM ? null : choose(STYLES, styleId, styleCustom);
  const previewPalette = paletteId === RANDOM ? null : choose(PALETTES, paletteId, paletteCustom);
  const framing = choose(FRAMINGS, framingId, framingCustom);
  const composed = previewStyle && previewPalette ? characterPrompt(idea, previewStyle, previewPalette, framing) : "";
  const shownPrompt = fullEdited ? fullPrompt : composed;

  async function api(path: string, init: RequestInit = {}) {
    const r = await fetch(path, { ...init, headers: { ...(init.headers as Record<string, string>), "x-access-code": code } });
    if (r.status === 401) { setAccess("locked"); throw new Error("Access code required"); }
    return r;
  }
  const patch = (key: string, p: Partial<Card>) => setCards((cs) => cs.map((c) => (c.key === key ? { ...c, ...p } : c)));

  async function uploadFile(f: File) {
    const hit = uploaded.current.get(f);
    if (hit) return hit;
    const form = new FormData();
    form.append("image", await prepareUpload(f), f.name.replace(/\.\w+$/, "") + ".png");
    const r = await api("/api/upload", { method: "POST", body: form });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error ?? "Upload failed");
    uploaded.current.set(f, body.name);
    return body.name as string;
  }

  /** Poll a Comfy job to the end and download its files by layer. */
  async function waitFor(id: string, onStatus: (s: string) => void) {
    let status = "queued";
    while (!TERMINAL.includes(status)) {
      await new Promise((ok) => setTimeout(ok, 3000));
      status = (await (await api(`/api/status?id=${id}`)).json()).status;
      onStatus(status);
    }
    if (status !== "success") throw new Error(`Run ${status}`);
    const { files } = await (await api(`/api/outputs?id=${id}`)).json();
    const blobs: Record<string, Blob> = {};
    await Promise.all(Object.entries(files as Record<string, { filename: string; subfolder: string }>).map(async ([layer, f]) => {
      const q = new URLSearchParams({ filename: f.filename, subfolder: f.subfolder });
      blobs[layer] = await (await api(`/api/file?${q}`)).blob();
    }));
    return blobs;
  }

  async function follow(card: Card & { prep?: () => Promise<Partial<Params>> }) {
    try {
      let params = card.params;
      if (card.prep) { // e.g. Qwen edits of the background / foil before the card is composited
        params = { ...params, ...(await card.prep()) };
        patch(card.key, { params });
      }
      const r = await api("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Submit failed");
      patch(card.key, { id: body.id, status: "queued" });
      const blobs = await waitFor(body.id, (status) => patch(card.key, { status }));
      const urls = Object.fromEntries(Object.entries(blobs).map(([k, b]) => [k, URL.createObjectURL(b)]));
      patch(card.key, { status: "done", files: blobs, urls });
    } catch (e) {
      patch(card.key, { status: "error", error: (e as Error).message });
    }
  }

  function launch(items: { params: Params; picks: Picks; text?: CardText; source?: string; prep?: (key: string) => Promise<Partial<Params>> }[]) {
    const fresh = items.map(({ prep, ...it }) => {
      const key = crypto.randomUUID();
      return { key, ...it, status: prep ? "editing layers" : "submitting", view: "composite", prep: prep && (() => prep(key)) };
    });
    setCards((cs) => [...fresh.map(({ prep, ...c }) => c), ...cs]);
    fresh.forEach(follow);
  }


  /** Background + foil for one card: "random" draws a new theme per call, "custom" uses the typed prompt. */
  function backdrop(bgChoice: string, foilChoice: string) {
    const bg = bgChoice === CUSTOM ? { label: "Custom", text: bgCustom } : resolve(BACKGROUNDS, bgChoice);
    const foil = foilChoice === CUSTOM ? { label: "Custom", text: foilCustom } : resolve(FOILS, foilChoice);
    return { backgroundPrompt: bg.text, foilPrompt: foil.text, background: bg.label, foil: foil.label };
  }

  /** A drawn layer, uploaded once per look and reused from the cache. */
  async function drawnUpload(key: string, draw: () => Promise<Blob>, filename: string) {
    const hit = drawn.current.get(key);
    if (hit) return hit;
    const name = await uploadBlob(await draw(), filename);
    drawn.current.set(key, name);
    return name;
  }
  const frameLayer = (style: string, color: Swatch, layout: string) =>
    drawnUpload(`frame:${style}:${color.id}:${layout}`, () => drawFrame(style, color, layoutOf(layout)), `frame-${style}-${color.id}.png`);
  const headerLayer = (style: string, color: Swatch, layout: string) =>
    drawnUpload(`header:${style}:${color.id}:${layout}`, () => drawHeader(style, color, layoutOf(layout)), `header-${style}-${color.id}.png`);
  const dieLayer = () => drawnUpload("die", drawDie, "die.png");
  /** Name, stat, description, footer and logo on one layer (the workflow's name-art slot). */
  function textLayer(cardName: string, t: CardText) {
    const key = ["text", cardName, t.layout, t.stat, t.description, t.footer, JSON.stringify(t.colors),
      t.logo?.name, t.logo?.size, t.nameArt?.name, t.nameArt?.size].join("|");
    return drawnUpload(key, () => drawTextLayer({
      layout: layoutOf(t.layout), name: cardName, stat: t.stat, description: t.description, footer: t.footer, colors: t.colors,
      nameFont: nameFont.style.fontFamily, bodyFont: bodyFont.style.fontFamily, logo: t.logo, nameArt: t.nameArt,
    }), "text.png");
  }

  const swatch = (id: string, auto: string) =>
    id === RANDOM ? pick(SWATCHES) : SWATCHES.find((s) => s.id === (id === AUTO ? auto : id))!;
  const styleOf = (list: { id: string; label: string }[], id: string) => (id === RANDOM ? pick(list) : list.find((s) => s.id === id)!);
  const layout = layoutOf(layoutId);

  async function run() {
    setError("");
    setBusy(true);
    try {
      const base: NonNullable<Params["uploads"]> = {};
      let runFor: (Source | null)[] = [null]; // generate: one set of variants; upload: one set per image
      if (mode === "upload") {
        if (!sources.length) throw new Error("Add your artwork first.");
        runFor = sources;
        for (const [k, f] of Object.entries(layers) as [LayerSlot, File | undefined][]) {
          if (!f || k === "nameArt") continue; // name art is placed on the text layer below
          base[k] = await uploadFile(f);
        }
      } else if (!idea.trim() && !fullEdited) {
        throw new Error("Describe the character first.");
      }
      if (!base.dieline) base.dieline = await dieLayer();
      const items: { params: Params; picks: Picks; text?: CardText; source?: string }[] = [];
      const nameArt = mode === "upload" ? layers.nameArt : undefined;
      for (const [si, src] of runFor.entries()) {
      if (src) setBusyText(`Uploading ${si + 1} of ${runFor.length}…`);
      const subjectFile = src ? await uploadFile(src.file) : undefined;
      const cardName = src ? src.name : name;
      for (let v = 0; v < count; v++) {
        const palette = choose(PALETTES, paletteId, paletteCustom);
        const b = backdrop(bgId, foilId);
        const seeds = { subject: seed(), background: seed(), foil: seed() };
        const uploads = { ...base, ...(subjectFile ? { subject: subjectFile } : {}) };
        const frame = styleOf(FRAMES, frameId), frameSw = swatch(frameColor, "gold");
        const header = styleOf(HEADERS, headerId), headerSw = swatch(headerColor, "red");
        if (!uploads.frame) uploads.frame = await frameLayer(frame.id, frameSw, layout.id);
        if (!uploads.banner) uploads.banner = await headerLayer(header.id, headerSw, layout.id);
        const colors = textColors(layout, layers.banner ? "bar" : header.id, layers.banner ? SWATCHES[3] : headerSw, frame.id, frameSw);
        const text: CardText = { layout: layout.id, stat, description, footer, colors, logo, nameArt };
        uploads.nameArt = await textLayer(cardName, text);
        const picks: Picks = {
          palette: palette.id === "any" ? undefined : palette.id === CUSTOM ? `Palette: ${palette.text}` : palette.label, background: b.background, foil: b.foil,
          bgChoice: bgId, foilChoice: foilId, layout: layout.label,
          frame: layers.frame ? "Your frame" : frame.id === "off" ? "No frame" : frame.id === "holo" ? "Holo frame" : `${frameSw.label} ${frame.label.toLowerCase()} frame`,
          header: layers.banner ? "Your header" : header.id === "off" ? "No header" : `${headerSw.label} ${header.label.toLowerCase()}`,
        };
        const common = {
          mode, name: cardName, backgroundPrompt: b.backgroundPrompt, foilPrompt: b.foilPrompt, foilStrength, seeds, uploads,
          foilArea: layout.fullArt && foilArea === "frame" ? "card" : foilArea, window: layout.window,
        };
        if (mode === "generate") {
          const style = choose(STYLES, styleId, styleCustom);
          picks.style = style.id === CUSTOM ? "Custom style" : style.label;
          if (framing.id !== "full") picks.framing = framing.id === CUSTOM ? "Custom framing" : framing.label;
          items.push({ picks, text, params: { ...common, subjectPrompt: fullEdited ? fullPrompt : characterPrompt(idea, style, palette, framing) } });
        } else {
          const restyle = treatment === "off" || treatment === "enhance" ? null : choose(STYLES, treatment, styleCustom);
          picks.style = treatment === "off" ? "As-is" : restyle ? (restyle.id === CUSTOM ? "Custom style" : restyle.label) : "Enhanced";
          items.push({ picks, text, source: src?.file.name, params: { ...common, enhance: treatment !== "off", enhancePrompt: restylePrompt(restyle, palette) } });
        }
      }
      }
      launch(items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setBusyText("");
    }
  }

  const lookOf = (c: Card) =>
    [c.picks.layout, c.picks.style, c.picks.framing, c.picks.palette, c.picks.background, c.picks.foil, c.picks.frame, c.picks.header].filter(Boolean) as string[];
  const readmeCard = (c: Card) => ({ name: c.params.name, source: c.source, seed: c.params.seeds.subject, look: lookOf(c) });
  const finished = cards.filter((c) => c.status === "done" && c.files);

  async function downloadEverything() {
    setError("");
    setZipping(0);
    try {
      await downloadAll(
        finished.map((c) => ({ files: c.files!, base: fileBase(c), foilOpacity: c.params.foilStrength / 100, card: readmeCard(c) })),
        setZipping,
      );
    } catch (e) {
      setError(`Download all failed: ${(e as Error).message}`);
    } finally {
      setZipping(undefined);
    }
  }

  async function uploadBlob(blob: Blob, filename: string) {
    const form = new FormData();
    form.append("image", blob, filename);
    const r = await api("/api/upload", { method: "POST", body: form });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error ?? "Upload failed");
    return body.name as string;
  }

  /** Re-run a finished card through the Upload workflow: its own character goes back in (edited by Qwen or
   *  passed through as-is), and every layer not being re-run is fed back from the card's files, so it stays identical. */
  async function rerun(c: Card, o: Rerun) {
    setError("");
    patch(c.key, { rerunOpen: false });
    try {
      const f = c.files!;
      const p = c.params;
      const uploads: Params["uploads"] = { subject: await uploadBlob(f.source, "character.png") };
      if (!o.background) uploads.background = await uploadBlob(f.L1_fx, "background.png");
      if (!o.foil) uploads.foil = await uploadBlob(f.L6_foil, "foil.png");
      uploads.frame = await uploadBlob(f.L2_frame, "frame.png");
      uploads.banner = await uploadBlob(f.L4_banner, "banner.png");
      uploads.dieline = p.uploads?.dieline ?? (await dieLayer());
      if (c.text && o.name !== p.name) uploads.nameArt = await textLayer(o.name, c.text);
      else if (p.uploads?.nameArt) uploads.nameArt = p.uploads.nameArt;
      const note = o.note.trim();
      // with a note, background / foil are EDITED by Qwen from the card's own layer (it sees the image);
      // without one they regenerate from a fresh theme
      const fresh = backdrop(c.picks.bgChoice, c.picks.foilChoice);
      const editBg = o.background && !!note, editFoil = o.foil && !!note;
      const bgPrompt = o.background && !note ? fresh.backgroundPrompt : p.backgroundPrompt;
      const foilPrompt = o.foil && !note ? fresh.foilPrompt : p.foilPrompt;
      const prep = editBg || editFoil ? async (key: string) => {
        const edited = { ...uploads };
        const editLayer = async (layer: Blob, prompt: string, label: string) => {
          patch(key, { status: `editing ${label}` });
          const r = await api("/api/edit", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: await uploadBlob(layer, `${label}.png`), prompt, seed: seed() }) });
          const body = await r.json();
          if (!r.ok) throw new Error(body.error ?? `Edit of the ${label} failed`);
          const out = await waitFor(body.id, (st) => patch(key, { status: `editing ${label} · ${st.replace(/_/g, " ")}` }));
          if (!out.edited) throw new Error(`The ${label} edit returned no image`);
          return uploadBlob(out.edited, `${label}-edited.png`);
        };
        if (editBg) edited.background = await editLayer(f.L1_fx, backgroundEditPrompt(note), "background");
        if (editFoil) edited.foil = await editLayer(f.L6_foil, foilEditPrompt(note), "foil");
        patch(key, { status: "submitting" });
        return { uploads: edited };
      } : undefined;
      const redone = [o.character && (o.variation ? "variation" : "character"), o.background && "background", o.foil && "foil"].filter(Boolean);
      launch([{
        params: {
          mode: "upload", name: o.name, uploads, foilStrength: p.foilStrength, foilArea: p.foilArea, window: p.window,
          enhance: o.character, enhancePrompt: o.variation || !note ? VARIATION_PROMPT : editPrompt(note),
          backgroundPrompt: bgPrompt, foilPrompt,
          seeds: { subject: seed(), background: o.background ? seed() : p.seeds.background, foil: o.foil ? seed() : p.seeds.foil },
        },
        picks: {
          ...c.picks,
          background: o.background && !note ? fresh.background : editBg ? `${c.picks.background} · edited` : c.picks.background,
          foil: o.foil && !note ? fresh.foil : editFoil ? `${c.picks.foil} · edited` : c.picks.foil,
          from: `${redone.length ? redone.join(" + ") : "name"} of ${p.name || "card"} ${p.seeds.subject}`,
        },
        text: c.text,
        prep,
      }]);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const variation = (c: Card) => rerun(c, { character: true, background: false, foil: false, note: "", name: c.params.name, variation: true });
  async function open3d(c: Card) {
    try {
      setViewer({ url: URL.createObjectURL(await buildGlb(c.files!)), filename: fileBase(c) });
    } catch (e) {
      setError(`3D export failed: ${(e as Error).message}`);
    }
  }
  const fileBase = (c: Card) => `${(c.params.name || "card").replace(/\W+/g, "_")}_${c.params.seeds.subject}`;

  // first visit after the code screen: open the tour once
  useEffect(() => {
    if (access !== "open") return;
    let seen = "1";
    try { seen = localStorage.getItem("cc-tour-v1") ?? ""; } catch {}
    if (!seen) setTouring(true);
  }, [access]);
  function endTour() {
    setTouring(false);
    try { localStorage.setItem("cc-tour-v1", "1"); } catch {}
  }
  const tourSteps: TourStep[] = [
    { title: "Welcome to Comfy Cards", body: "Turn a short idea or your own artwork into a print-ready 2.5 × 3.5\" trading card, split into layers: background, frame, character, header, text, holo foil and the print plates. Here's the 30-second tour." },
    {
      target: "layout", title: "Pick a layout",
      body: "Classic puts the art in a window under the name bar with a description box below. Full art runs the character edge to edge with the text over it.",
      action: { label: "Set up a demo card", run: () => { setMode("generate"); setLayoutId("classic"); setCount(1); } },
    },
    { target: "modes", title: "Generate or Upload", body: "Generate creates a character from a short idea. Upload takes your own artwork, from one image to a whole folder.", enter: () => setMode("generate") },
    { target: "batch", title: "Batch upload", body: "Drop images or a folder here. Each image becomes its own card, named from its file name; edit any name before you run.", enter: () => setMode("upload") },
    { target: "card-text", title: "Card text", body: "Name, an optional stat, the description and a footer line (artist, set number). Text is set inside the safe area and shrinks to fit." },
    { target: "logo", title: "Logo", body: "Optional. Drop in a transparent PNG and it sits bottom right on every card in the run." },
    { target: "backdrop", title: "Background and foil", body: "Pick a theme or Random per variant. Foil area chooses where the holo prints: behind the character, on the frame only, or the whole card." },
    { target: "border", title: "Frame and header", body: "Choose the frame and name-bar style and colors. Holo frame leaves the frame unprinted so the foil board shows." },
    { target: "run", title: "Run it", body: "Each card takes about a minute on Comfy Cloud. Batches queue up and fill in as they finish." },
    { target: "results", title: "Your cards", body: "Every card gives you a layered PSD at 384 ppi with bleed, trim and safe guides, a Layers ZIP, a 3D GLB with reflective holo, plus Generate variation and Re-run for edits." },
    { title: "Download everything", body: "When several cards are ready, Download all packs every PSD into one ZIP with a README for prepress. Replay this tour any time from Tour in the top bar.", enter: () => setMode("generate") },
  ];

  const topbar = (
    <header className="topbar"><span className="mark" aria-hidden /><span>Comfy Cards</span>
      {access === "open" ? <button className="btn-line tour-btn" onClick={() => setTouring(true)}>Tour</button> : null}</header>
  );

  if (access !== "open") {
    return (
      <>
        {topbar}
        <div className="gate">
          {access === "checking" ? <div className="spinner" /> : (
            <form className="panel stack" onSubmit={unlock}>
              <span className="eyebrow">Comfy Cards</span>
              <label className="field"><span>Access code</span>
                <input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoFocus /></label>
              {codeError ? <div className="error">{codeError}</div> : null}
              <button className="btn wide" disabled={!code}>Continue</button>
            </form>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {topbar}
      <span className={nameFont.className} aria-hidden style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}>A</span>
      <span className={bodyFont.className} aria-hidden style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}>A<b>A</b></span>
      <main className="page">
        <section className="hero">
          <div>
            <span className="eyebrow">Comfy Cards</span>
            <h1>Idea or artwork in. Trading cards out.</h1>
            <p>Type a short idea and pick a style, or upload your own art. Each run builds a 2.5 × 3.5" card with bleed: background, frame, character, header, text and holo foil as separate layers, plus the foil, white and die-cut plates and a layered PSD for your designers.</p>
            <div className="status">
              <span className="dot" /> Runs on Comfy Cloud
              <span className="chip">FLUX.2 Klein 4B</span><span className="chip">Qwen-Image-Edit 2511</span><span className="chip">BEN2 cutout</span>
            </div>
          </div>
        </section>

        <section className="work">
          <div className="panel stack">
            <span className="eyebrow">Settings</span>
            <div className="field" data-tour="layout"><span>Layout</span>
              <div className="choices three">{LAYOUTS.map((l) => (
                <button key={l.id} className="choice" aria-pressed={layoutId === l.id} onClick={() => setLayoutId(l.id)}>
                  <i className={`thumb ${l.id}`} aria-hidden /><b>{l.label}</b></button>))}</div>
            </div>
            <div className="choices" data-tour="modes">
              <button className="choice" aria-pressed={mode === "generate"} onClick={() => setMode("generate")}>
                <b>Generate</b><small>From a short idea</small></button>
              <button className="choice" aria-pressed={mode === "upload"} onClick={() => setMode("upload")}>
                <b>Upload</b><small>From your own artwork</small></button>
            </div>

            {mode === "generate" ? (
              <>
                <label className="field"><span>Character</span>
                  <input type="text" value={idea} placeholder="Pug with a party hat"
                    onChange={(e) => { setIdea(e.target.value); setFullEdited(false); }} /></label>
                <div className="two">
                  <Select label="Style" value={styleId} onChange={(v) => { setStyleId(v); setFullEdited(false); }} options={STYLES} random="Random per variant" custom />
                  <Select label="Palette" value={paletteId} onChange={(v) => { setPaletteId(v); setFullEdited(false); }} options={PALETTES} random="Random per variant" custom />
                </div>
                {styleId === CUSTOM ? (
                  <label className="field"><span>Your style</span>
                    <textarea value={styleCustom} placeholder="Medium first, then line, shading and finish: e.g. Gouache painting with thick brushstrokes and a matte finish."
                      onChange={(e) => { setStyleCustom(e.target.value); setFullEdited(false); }} /></label>
                ) : null}
                {paletteId === CUSTOM ? (
                  <label className="field"><span>Your palette</span>
                    <input type="text" value={paletteCustom} placeholder="teal, coral and warm cream"
                      onChange={(e) => { setPaletteCustom(e.target.value); setFullEdited(false); }} /></label>
                ) : null}
                <Select label="Framing" value={framingId} onChange={(v) => { setFramingId(v); setFullEdited(false); }} options={FRAMINGS} custom />
                {framingId === CUSTOM ? (
                  <label className="field"><span>Your framing</span>
                    <input type="text" value={framingCustom} placeholder="shown as a close-up portrait, centered and filling the frame."
                      onChange={(e) => { setFramingCustom(e.target.value); setFullEdited(false); }} /></label>
                ) : null}
                <details>
                  <summary><span className="eyebrow">Full prompt</span></summary>
                  <div className="stack">
                    {shownPrompt ? (
                      <textarea value={shownPrompt} onChange={(e) => { setFullPrompt(e.target.value); setFullEdited(true); }} />
                    ) : (
                      <span className="muted" style={{ fontSize: 13 }}>Written per variant when Style or Palette is Random.</span>
                    )}
                    {fullEdited ? <button className="btn-line" onClick={() => setFullEdited(false)}>Back to the style presets</button> : null}
                  </div>
                </details>
              </>
            ) : (
              <>
                <BatchDrop sources={sources} onAdd={addSources} onChange={setSources} />
                <div className="two">
                  <label className="field"><span>Treatment</span>
                    <select value={treatment} onChange={(e) => setTreatment(e.target.value)}>
                      <option value="enhance">Clean up for print</option>
                      <option value="off">Use as-is</option>
                      <optgroup label="Restyle with Qwen-Image-Edit 2511">
                        <option value={RANDOM}>Random per variant</option>
                        {STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        <option value={CUSTOM}>Custom…</option>
                      </optgroup>
                    </select>
                  </label>
                  <Select label="Palette" value={paletteId} onChange={setPaletteId} options={PALETTES} random="Random per variant" custom />
                </div>
                {treatment === CUSTOM ? (
                  <label className="field"><span>Your style</span>
                    <textarea value={styleCustom} placeholder="Medium first, then line, shading and finish: e.g. Gouache painting with thick brushstrokes and a matte finish."
                      onChange={(e) => { setStyleCustom(e.target.value); setFullEdited(false); }} /></label>
                ) : null}
                {paletteId === CUSTOM ? (
                  <label className="field"><span>Your palette</span>
                    <input type="text" value={paletteCustom} placeholder="teal, coral and warm cream"
                      onChange={(e) => { setPaletteCustom(e.target.value); setFullEdited(false); }} /></label>
                ) : null}
              </>
            )}

            <hr className="divider" />
            <div className="stack" data-tour="card-text">
              <span className="eyebrow">Card text</span>
              <div className="two name-stat">
                {mode === "generate" ? (
                  <label className="field"><span>Name</span>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
                ) : <div className="field"><span>Name</span><span className="muted" style={{ fontSize: 13, paddingTop: 10 }}>From each file name</span></div>}
                <label className="field"><span>Stat (optional)</span>
                  <input type="text" value={stat} placeholder="LV 12" onChange={(e) => setStat(e.target.value)} /></label>
              </div>
              {layout.text ? (
                <label className="field"><span>Description</span>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>
              ) : null}
              <label className="field"><span>Footer (optional)</span>
                <input type="text" value={footer} placeholder="Illus. Name · 001/100" onChange={(e) => setFooter(e.target.value)} /></label>
              <div data-tour="logo"><Drop file={logo} onFile={setLogo} title="Logo (optional)" hint="transparent PNG · bottom right" /></div>
            </div>
            <span className="muted mono" style={{ fontSize: 12 }}>2.5 × 3.5" + 1/8" bleed · 384 ppi · PSD guides at trim and safe</span>

            <div className="field"><span>Variants per run</span>
              <div className="count">{[1, 2, 3, 4].map((n) => (
                <button key={n} aria-pressed={count === n} onClick={() => setCount(n)}>{n}</button>))}</div>
            </div>

            <hr className="divider" />
            <span className="eyebrow">Background and foil</span>
            <div className="two" data-tour="backdrop">
              <Select label="Background" value={bgId} onChange={setBgId} options={BACKGROUNDS} random="Random per variant" custom />
              <Select label="Holo foil" value={foilId} onChange={setFoilId} options={FOILS} random="Random per variant" custom />
            </div>
            {bgId === CUSTOM ? (
              <label className="field"><span>Custom background</span>
                <textarea value={bgCustom} onChange={(e) => setBgCustom(e.target.value)} /></label>
            ) : null}
            {foilId === CUSTOM ? (
              <label className="field"><span>Custom foil</span>
                <textarea value={foilCustom} onChange={(e) => setFoilCustom(e.target.value)} /></label>
            ) : null}
            <div className="two">
              <label className="field"><span>Foil area</span>
                <select value={layout.fullArt && foilArea === "frame" ? "card" : foilArea} onChange={(e) => setFoilArea(e.target.value)}>
                  {FOIL_AREAS.filter((a) => !(layout.fullArt && a.id === "frame")).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select></label>
              <label className="field"><span className="row"><span>Foil strength</span><span className="mono">{foilStrength}</span></span>
                <input type="range" min={0} max={100} value={foilStrength} onChange={(e) => setFoilStrength(+e.target.value)} /></label>
            </div>

            <hr className="divider" />
            <span className="eyebrow">Frame and header</span>
            <div className="two" data-tour="border">
              <Select label="Frame" value={frameId} onChange={setFrameId} options={FRAMES.map((b) => ({ ...b, text: "" }))} random="Random per variant" />
              <label className="field"><span>Frame color</span>
                <select value={frameColor} onChange={(e) => setFrameColor(e.target.value)} disabled={frameId === "off" || frameId === "holo"}>
                  <option value={AUTO}>Gold</option><option value={RANDOM}>Random per variant</option>
                  {SWATCHES.filter((s) => s.id !== "gold").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select></label>
            </div>
            <div className="two">
              <Select label="Header" value={headerId} onChange={setHeaderId} options={HEADERS.map((b) => ({ ...b, text: "" }))} random="Random per variant" />
              <label className="field"><span>Header color</span>
                <select value={headerColor} onChange={(e) => setHeaderColor(e.target.value)} disabled={headerId === "off"}>
                  <option value={AUTO}>Red</option><option value={RANDOM}>Random per variant</option>
                  {SWATCHES.filter((s) => s.id !== "red").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select></label>
            </div>

            {mode === "upload" ? (
              <details>
                <summary><span className="eyebrow">Your layers (optional)</span></summary>
                <div className="stack">
                  <span className="muted" style={{ fontSize: 13 }}>Upload any layer to replace it. Empty slots use the template or a generated layer.</span>
                  <div className="layer-grid">{LAYER_SLOTS.map((s) => (
                    <Drop key={s.key} file={layers[s.key]} title={s.label} hint={s.hint}
                      onFile={(f) => setLayers((l) => ({ ...l, [s.key]: f }))} />))}</div>
                </div>
              </details>
            ) : null}

            <hr className="divider" />
            <button className="btn wide" data-tour="run" disabled={busy} onClick={run}>
              {busy ? busyText || "Uploading…" : `Run ${count * (mode === "upload" ? Math.max(1, sources.length) : 1)} on Comfy Cloud`}</button>
            {error ? <div className="error">{error}</div> : null}
          </div>

          <div className="panel" data-tour="results">
            <div className="panel-head"><span className="eyebrow">Results</span>
              {cards.length ? (
                <div className="head-actions">
                  <span className="muted mono" style={{ fontSize: 12 }}>{finished.length}/{cards.length} ready</span>
                  {finished.length > 1 ? (
                    <button className="btn" data-tour="download-all" disabled={zipping !== undefined} onClick={downloadEverything}>
                      {zipping !== undefined ? `Packing ${zipping}/${finished.length}…` : `Download all (${finished.length} PSDs)`}</button>
                  ) : null}
                </div>
              ) : null}</div>
            {cards.length === 0 ? (
              <div className="empty"><div><h3>No cards yet</h3>
                <p className="muted" style={{ margin: 0 }}>Set up a run on the left. Each card takes about a minute.</p></div></div>
            ) : (
              <div className="results">{cards.map((c, i) => (
                <article className="card" key={c.key}>
                  <div className="stage">
                    <span className="tag">{String(cards.length - i).padStart(2, "0")}</span>
                    {c.urls ? <img src={c.urls[c.view] ?? c.urls.composite} alt={c.view} /> : c.status === "error" ? (
                      <div className="wait"><span className="error">{c.error}</span></div>
                    ) : (
                      <div className="wait"><div className="spinner" /><span className="mono">{c.status.replace(/_/g, " ")}</span></div>
                    )}
                  </div>
                  {c.urls ? (
                    <div className="strip">{STRIP.filter((k) => c.urls![k]).map((k) => (
                      <button key={k} title={k} aria-pressed={c.view === k} onClick={() => patch(c.key, { view: k })}>
                        <img src={c.urls![k]} alt={k} /></button>))}</div>
                  ) : null}
                  <div className="card-foot">
                    <div className="row"><span className="name" title={c.source}>{c.params.name || "Untitled"}</span>
                      <span className="muted mono" style={{ fontSize: 11 }}>seed {c.params.seeds.subject}</span></div>
                    <div className="picks">
                      {c.picks.from ? <span className="chip from">↻ {c.picks.from}</span> : null}
                      {lookOf(c).map((p, k) => (
                        <span className="chip" key={k}>{p}</span>))}
                    </div>
                    <div className="actions">
                      <button className="btn" disabled={!c.files} onClick={() => downloadPsd(c.files!, fileBase(c), c.params.foilStrength / 100)}>PSD</button>
                      <button className="btn-line" disabled={!c.files} onClick={() => downloadZip(c.files!, fileBase(c), readmeCard(c), c.params.foilStrength)}>Layers ZIP</button>
                      <button className="btn-line" disabled={!c.files} onClick={() => open3d(c)}>3D / GLB</button>
                    </div>
                    <div className="actions">
                      <button className="btn-line" disabled={c.status !== "done"} onClick={() => variation(c)}>Generate variation</button>
                      <button className="btn-line" disabled={c.status !== "done"} aria-pressed={!!c.rerunOpen}
                        onClick={() => patch(c.key, { rerunOpen: !c.rerunOpen })}>Re-run…</button>
                    </div>
                    {c.rerunOpen ? <RerunPanel card={c} onRun={(o) => rerun(c, o)} onClose={() => patch(c.key, { rerunOpen: false })} /> : null}
                  </div>
                </article>))}</div>
            )}
          </div>
        </section>
      </main>
      {touring ? <Tour steps={tourSteps} onClose={endTour} /> : null}
      {viewer ? <Viewer3D url={viewer.url} filename={viewer.filename} onClose={() => { URL.revokeObjectURL(viewer.url); setViewer(undefined); }} /> : null}
    </>
  );
}
