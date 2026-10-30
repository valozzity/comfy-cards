// A finished card as a 3D trading card (.glb), built in the browser from the card's layers. The holo areas (inside the
// foil mask) get a metallic, low-roughness, iridescent finish (KHR_materials_iridescence), so the rainbow shifts as the
// card turns in a glTF viewer such as <model-viewer>. No Comfy run, no credits.
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { CARD_IN, H, TRIM, W } from "./layers";

const M = 0.0254; // metres per inch
const CARD_W = CARD_IN.w * M;
const CARD_H = CARD_IN.h * M;
const RADIUS = (TRIM.r / TRIM.w) * CARD_W;
const THICKNESS = 0.00035; // a standard 0.35 mm card
const BLEED_W = (W / TRIM.w) * CARD_W; // the texture covers trim + bleed
const BLEED_H = (H / TRIM.h) * CARD_H;

async function layerCanvas(blobs: (Blob | undefined)[]) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  for (const b of blobs) if (b) g.drawImage(await createImageBitmap(b), 0, 0, W, H);
  return { c, g };
}

/** R = iridescence, G = roughness, B = metalness (glTF packs metal/rough the same way). Holo = the foil print mask. */
async function finishMap(files: Record<string, Blob>) {
  const mask = files.P1_foil ? (await layerCanvas([files.P1_foil])).g.getImageData(0, 0, W, H).data : null;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const og = out.getContext("2d")!;
  const img = og.createImageData(W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const holo = !!mask && mask[i] > 8;
    img.data[i] = holo ? 255 : 0;
    img.data[i + 1] = holo ? 30 : 150;
    img.data[i + 2] = holo ? 235 : 0;
    img.data[i + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  return out;
}

/** Iridescence thickness (G channel) from the card's own foil pattern: varying film thickness is what makes the
 *  rainbow break up and travel across the holo as the card turns, instead of one flat tint. */
async function thicknessMap(files: Record<string, Blob>) {
  const { c, g } = await layerCanvas([files.L6_foil]);
  const px = g.getImageData(0, 0, W, H);
  for (let i = 0; i < px.data.length; i += 4) {
    const lum = (px.data[i] * 0.3 + px.data[i + 1] * 0.59 + px.data[i + 2] * 0.11) * (px.data[i + 3] / 255);
    px.data[i] = 0;
    px.data[i + 1] = Math.round(60 + (lum / 255) * 195);
    px.data[i + 2] = 0;
    px.data[i + 3] = 255;
  }
  g.putImageData(px, 0, 0);
  return c;
}

function cardShape() {
  const w = CARD_W / 2, h = CARD_H / 2, r = RADIUS;
  const s = new THREE.Shape();
  s.moveTo(-w + r, -h);
  s.lineTo(w - r, -h);
  s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r);
  s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h);
  s.quadraticCurveTo(-w, h, -w, h - r);
  s.lineTo(-w, -h + r);
  s.quadraticCurveTo(-w, -h, -w + r, -h);
  return s;
}

// caps map shape x/y onto the bleed canvas, so the trim area of the art lands on the card face
const uv = (x: number, y: number) => new THREE.Vector2(x / BLEED_W + 0.5, y / BLEED_H + 0.5);
const UV_GENERATOR = {
  generateTopUV(_g: THREE.ExtrudeGeometry, v: number[], a: number, b: number, c: number) {
    return [a, b, c].map((k) => uv(v[k * 3], v[k * 3 + 1]));
  },
  generateSideWallUV() {
    return [0, 0, 0, 0].map(() => new THREE.Vector2(0, 0));
  },
};

export async function buildGlb(files: Record<string, Blob>): Promise<Blob> {
  const art = files.L1_fx
    ? await layerCanvas([files.L1_fx, files.L2_frame, files.L3_subject, files.L4_banner, files.L5_text])
    : await layerCanvas([files.composite]);

  const map = new THREE.CanvasTexture(art.c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.flipY = true;
  const finish = new THREE.CanvasTexture(await finishMap(files));
  const thickness = files.L6_foil ? new THREE.CanvasTexture(await thicknessMap(files)) : null;

  const front = new THREE.MeshPhysicalMaterial({
    name: "Front art + holo",
    map,
    metalness: 1, roughness: 1, metalnessMap: finish, roughnessMap: finish,
    iridescence: 1, iridescenceMap: finish, iridescenceIOR: 1.5, iridescenceThicknessRange: [100, 900],
    iridescenceThicknessMap: thickness,
  });
  const back = new THREE.MeshStandardMaterial({ name: "Back board", color: 0x2a2131, roughness: 0.7 });
  const edge = new THREE.MeshStandardMaterial({ name: "Edge board", color: 0xe9e4da, roughness: 0.9 });

  const geo = new THREE.ExtrudeGeometry(cardShape(), {
    depth: THICKNESS, bevelEnabled: false, curveSegments: 12, UVGenerator: UV_GENERATOR,
  });
  // ExtrudeGeometry puts both caps in group 0 (back cap first, then the front cap at z = depth) and the sides in
  // group 1; split the caps so the front and back get their own materials
  const [caps, sides] = geo.groups;
  geo.clearGroups();
  geo.addGroup(caps.start, caps.count / 2, 2);
  geo.addGroup(caps.start + caps.count / 2, caps.count / 2, 1);
  geo.addGroup(sides.start, sides.count, 0);
  geo.translate(0, 0, -THICKNESS / 2);
  const card = new THREE.Mesh(geo, [edge, front, back]);
  card.name = "Card";
  const scene = new THREE.Scene();
  scene.add(card);

  const buf = (await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer;
  map.dispose();
  finish.dispose();
  thickness?.dispose();
  geo.dispose();
  return new Blob([buf], { type: "model/gltf-binary" });
}
