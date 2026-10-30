// Submits one card and returns its id right away; the browser polls /api/status (no long-running functions).
import { buildGraph, comfy, denied, placeholderName, type RunParams } from "@/lib/comfy";

export async function POST(req: Request) {
  const no = denied(req);
  if (no) return no;
  try {
    const params = (await req.json()) as RunParams;
    const jobId = crypto.randomUUID().slice(0, 8);
    const r = await comfy("/api/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: buildGraph(params, jobId, await placeholderName()) }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.error) {
      return Response.json({ error: body.error?.message ?? body.error ?? `Submit failed (${r.status})` }, { status: 502 });
    }
    return Response.json({ id: body.prompt_id, jobId });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
