// Lists a finished card's files by layer. Comfy Cloud names outputs by content hash, so the layer comes from the node id.
import { comfy, denied, OUTPUT_NODES } from "@/lib/comfy";

type Out = { images?: { filename: string; subfolder?: string; type?: string }[] };

export async function GET(req: Request) {
  const no = denied(req);
  if (no) return no;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  const r = await comfy(`/api/history_v2/${encodeURIComponent(id)}`);
  if (!r.ok) return Response.json({ error: `History failed (${r.status})` }, { status: 502 });
  const hist = await r.json();
  const outputs: Record<string, Out> = (hist[id] ?? hist).outputs ?? {};
  const files: Record<string, { filename: string; subfolder: string }> = {};
  for (const [node, out] of Object.entries(outputs)) {
    const layer = OUTPUT_NODES[node];
    const f = out.images?.find((i) => (i.type ?? "output") === "output");
    if (layer && f) files[layer] = { filename: f.filename, subfolder: f.subfolder ?? "" };
  }
  return Response.json({ files });
}
