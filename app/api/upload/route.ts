// Forwards one image (already downsized in the browser, so it fits Vercel's request limit) to Comfy's input store.
import { comfy, denied } from "@/lib/comfy";

export async function POST(req: Request) {
  const no = denied(req);
  if (no) return no;
  const form = await req.formData();
  const file = form.get("image");
  if (!(file instanceof Blob)) return Response.json({ error: "No image" }, { status: 400 });
  const out = new FormData();
  out.append("image", file, (file as File).name || "upload.png");
  out.append("type", "input");
  out.append("overwrite", "true");
  const r = await comfy("/api/upload/image", { method: "POST", body: out });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return Response.json({ error: body.error ?? `Upload failed (${r.status})` }, { status: 502 });
  return Response.json({ name: body.name });
}
