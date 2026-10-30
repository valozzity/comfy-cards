// Submits a single-layer Qwen edit and returns its id; the browser polls /api/status and reads /api/outputs ("edited").
import { buildEditGraph, comfy, denied } from "@/lib/comfy";

export async function POST(req: Request) {
  const no = denied(req);
  if (no) return no;
  try {
    const { image, prompt, seed } = (await req.json()) as { image: string; prompt: string; seed: number };
    if (!image || !prompt) return Response.json({ error: "Missing image or prompt" }, { status: 400 });
    const jobId = crypto.randomUUID().slice(0, 8);
    const r = await comfy("/api/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: buildEditGraph(image, prompt, seed, jobId) }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.error) {
      return Response.json({ error: body.error?.message ?? body.error ?? `Submit failed (${r.status})` }, { status: 502 });
    }
    return Response.json({ id: body.prompt_id });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
