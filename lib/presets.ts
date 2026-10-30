// Prompt presets. The user types a short idea; these write the full caption-style prompt the models follow best
// (medium first, concrete details, plain grey background so the cutout stays clean).

export type Preset = { id: string; label: string; text: string };

export const STYLES: Preset[] = [
  { id: "card", label: "90s trading card", text: "Flat cel-shaded cartoon illustration in the style of a 1990s collectible trading card, drawn with bold uniform black outlines, two-tone shading and solid saturated fills, with smooth clean surfaces and no texture." },
  { id: "comic", label: "Retro comic", text: "Retro 1960s comic book illustration with bold black ink outlines, flat printed colors and Ben-Day halftone dot shading, like a vintage newsprint comic panel." },
  { id: "airbrush", label: "80s airbrush chrome", text: "1980s airbrushed illustration with smooth color gradients, glossy chrome highlights and soft glowing edges, polished and saturated like a vintage T-shirt print." },
  { id: "vinyl", label: "Vinyl toy", text: "3D render of a glossy designer vinyl toy figure with soft rounded forms, smooth plastic surfaces and simple studio lighting, like a clean product shot." },
  { id: "graffiti", label: "Graffiti", text: "Graffiti spray-paint character illustration with thick outlines, bright fills, paint drips and spray highlights in a bold street-art style." },
  { id: "pixel", label: "Pixel art", text: "16-bit pixel art sprite illustration with a limited color palette, crisp square pixels, clear dark outlines and no anti-aliasing." },
  { id: "mascot", label: "Mascot logo", text: "Bold vector mascot illustration with thick clean outlines, flat colors, a limited palette and simple geometric shapes, like a sports team emblem." },
];

// How the character sits in the art window
export const FRAMINGS: Preset[] = [
  { id: "full", label: "Full body", text: "shown full body as a single character in the center of the frame, filling most of its height, in a dynamic pose." },
  { id: "hero", label: "Waist-up", text: "shown from the waist up as a single large character, centered and filling the whole frame, with the head in the upper third and the shoulders, arms and props reaching toward the edges, cropped by the bottom of the frame, in a confident dynamic pose." },
];

export const PALETTES: Preset[] = [
  { id: "any", label: "Any", text: "" },
  { id: "neon", label: "Neon", text: "neon green, hot pink, electric blue and bright yellow" },
  { id: "primary", label: "Primary", text: "bold primary red, blue and yellow with black and white" },
  { id: "pastel", label: "Pastel", text: "soft pastel pink, mint green, lavender and baby blue" },
  { id: "mono", label: "Mono + accent", text: "black, white and grey with one bright orange accent" },
  { id: "earth", label: "Earth", text: "warm earth tones of rust, ochre, olive green and cream" },
];

// Full-bleed wording matters: "art for a trading card" makes the model sometimes draw a card object on a plain field.
const FULL = "The artwork fills the entire image edge to edge, with no border, frame, card or object shape.";
const ABSTRACT = `${FULL} The image contains only abstract shapes, with no characters, letters or numbers.`;
export const BACKGROUNDS: Preset[] = [
  { id: "burst", label: "Energy burst", text: `Flat cel-shaded cartoon background art. A radial burst of electric blue lightning bolts and violet plasma energy explodes outward from the exact center of the frame, with forked bolts, round glowing sparks and small star-shaped particles spread evenly to the edges. Colors are solid electric blue, violet and white on a deep navy field that darkens to black at the corners. ${ABSTRACT}` },
  { id: "rays", label: "Halftone sun rays", text: `Flat retro background art. Bold sun rays in alternating orange and yellow stripes radiate from the exact center of the frame, overlaid with a coarse halftone dot texture that fades toward the edges. ${ABSTRACT}` },
  { id: "stars", label: "Starfield", text: `Flat cartoon background art. A deep purple and navy night sky filled with dozens of white and yellow four-point stars of different sizes, small round planets and soft nebula clouds in pink and teal, spread evenly across the frame. ${ABSTRACT}` },
  { id: "flames", label: "Flames", text: `Flat cel-shaded cartoon background art. Stylized flames in red, orange and yellow rise from the bottom of the frame and curl around the edges, with bold black outlines, on a deep crimson field that darkens toward the center. ${ABSTRACT}` },
  { id: "memphis", label: "90s Memphis shapes", text: `Flat 1990s Memphis-style background pattern. Scattered squiggles, triangles, zigzags, dots and confetti shapes in teal, magenta, yellow and black on a pale cream field, spread evenly across the frame. ${ABSTRACT}` },
  { id: "checker", label: "Checkerboard tunnel", text: `Flat retro background art. A black and white checkerboard floor and walls form a tunnel that recedes in perspective to a glowing point at the exact center of the frame, with bright purple and green light at the vanishing point. ${ABSTRACT}` },
  { id: "swirl", label: "Yin-yang swirl", text: `Flat cartoon background art. A large swirling vortex of interlocking black and white yin-yang curves fills the frame, rimmed with thin neon green and pink outlines, spiralling into the center. ${ABSTRACT}` },
  { id: "speed", label: "Comic speed lines", text: `Flat comic book background art. Bold radial speed lines and action streaks burst outward from just behind the exact center of the frame to the edges, in two tones of deep royal blue and navy with a few black streaks, like an action comic panel. ${ABSTRACT}` },
  { id: "skulls", label: "Skull pattern", text: `Flat cartoon background pattern. A repeating tiled pattern of small grinning cartoon skulls with crossbones in white and lime green on a solid purple field, evenly spaced across the frame. ${FULL} The image contains no characters other than the skull pattern, and no letters or numbers.` },
];

const FOIL_BASE = "Seamless full-frame holographic foil texture: an all-over pattern of iridescent light on pure black that fills the entire image edge to edge.";
const FOIL_END = "The pattern runs off all four edges of the image, with no border, frame, card, sheet or object shape. The black stays pure black between the shapes. The image contains only abstract light, with no objects, letters or numbers.";
export const FOILS: Preset[] = [
  { id: "streaks", label: "Rainbow streaks", text: `${FOIL_BASE} Thin radial light streaks in iridescent rainbow colors (cyan, magenta, yellow and violet) radiate from the center of the frame, overlaid with fine prismatic glitter and about a dozen small four-point starburst sparkles scattered evenly. ${FOIL_END}` },
  { id: "ice", label: "Cracked ice", text: `${FOIL_BASE} A shattered cracked-ice pattern of angular shards covers the whole frame. Every shard is filled with a different iridescent rainbow hue with bright white edges, separated only by thin black cracks. ${FOIL_END}` },
  { id: "starfoil", label: "Star foil", text: `${FOIL_BASE} Dozens of small iridescent four- and five-point stars of different sizes are scattered evenly across the frame, each glowing in shifting rainbow colors. ${FOIL_END}` },
  { id: "diamond", label: "Diamond plate", text: `${FOIL_BASE} A repeating diamond-plate pattern of small raised metallic diamonds covers the frame, each catching iridescent rainbow highlights. ${FOIL_END}` },
  { id: "spiral", label: "Spiral", text: `${FOIL_BASE} Concentric iridescent rainbow bands spiral outward from the exact center of the frame with fine prismatic glitter along each band. ${FOIL_END}` },
  { id: "checkfoil", label: "Checker", text: `${FOIL_BASE} A holographic checkerboard of small squares covers the frame, alternating between iridescent rainbow squares and black squares. ${FOIL_END}` },
];

export const RANDOM = "random";
export const CUSTOM = "custom";
export const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
/** Resolve a dropdown value to a preset: "random" draws a new one each call (so each variant differs). */
/** A preset from a dropdown, or the user's own text when "Custom…" is picked. */
export function choose(list: Preset[], id: string, customText: string): Preset {
  return id === CUSTOM ? { id: CUSTOM, label: "Custom", text: customText.trim() } : resolve(list, id);
}
export function resolve(list: Preset[], id: string) {
  return id === RANDOM ? pick(list) : list.find((p) => p.id === id) ?? list[0];
}

export function characterPrompt(idea: string, style: Preset, palette: Preset, framing: Preset = FRAMINGS[0]) {
  const subject = idea.trim().replace(/\.$/, "");
  return [
    style.text,
    `${subject.charAt(0).toUpperCase()}${subject.slice(1)}, ${framing.text}`,
    palette.text ? `The color palette is ${palette.text}.` : "",
    "The background is a plain flat light grey with nothing else in it. No text.",
  ].filter(Boolean).join(" ");
}

// Re-runs on an existing card (Qwen-Image-Edit 2511 edits that card's own character)
export const VARIATION_PROMPT =
  "Create a new variation of this character: a different dynamic pose and expression, with the same character design, outfit, accessories, colors and art style. Full body, centered, filling most of the frame, on a plain flat light grey background. No text.";

export function editPrompt(note: string) {
  return `Edit this character: ${note.trim().replace(/\.$/, "")}. Keep everything else the same: identity, pose, outfit, colors and art style. Plain flat light grey background. No text.`;
}

export function backgroundEditPrompt(note: string) {
  return `Edit this background artwork: ${note.trim().replace(/\.$/, "")}. Keep it a full-frame background in the same illustration style unless asked otherwise, with no characters, letters or numbers.`;
}

export function foilEditPrompt(note: string) {
  return `Edit this holographic foil texture: ${note.trim().replace(/\.$/, "")}. Keep it an abstract light texture on a pure black background, with no objects, letters or numbers.`;
}

export function restylePrompt(style: Preset | null, palette: Preset) {
  if (!style) {
    return "Enhance this artwork for print: clean, crisp, even black outlines, smooth flat color fills, sharper details and no noise or compression artifacts. Keep exactly the same character, pose, colors, proportions and composition. Plain flat light grey background. No text.";
  }
  return [
    style.id === CUSTOM ? `Redraw this character in this style: ${style.text}` : `Redraw this character as a ${style.label.toLowerCase()} illustration. ${style.text}`,
    "Keep the character's identity, face, outfit, pose and accessories.",
    palette.text ? `Use a color palette of ${palette.text}.` : "Keep its original colors.",
    "Center the character so it fills most of the frame, on a plain flat light grey background. No text.",
  ].join(" ");
}
