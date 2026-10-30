import { comfy, denied } from "@/lib/comfy";

export async function GET(req: Request) {
  const no = denied(req);
  if (no) return no;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  const r = await comfy(`/api/job/${encodeURIComponent(id)}/status`);
  const body = await r.json().catch(() => ({}));
  return Response.json({ status: body.status ?? "unknown" });
}
