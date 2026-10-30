// Streams one output file. /api/view answers with a redirect to a signed URL, which is fetched WITHOUT the API key.
import { comfy, denied } from "@/lib/comfy";

export async function GET(req: Request) {
  const no = denied(req);
  if (no) return no;
  const q = new URL(req.url).searchParams;
  const params = new URLSearchParams({ filename: q.get("filename") ?? "", subfolder: q.get("subfolder") ?? "", type: "output" });
  let r = await comfy(`/api/view?${params}`, { redirect: "manual" });
  const location = r.headers.get("location");
  if (r.status >= 300 && r.status < 400 && location) r = await fetch(location, { cache: "no-store" });
  if (!r.ok || !r.body) return Response.json({ error: `File failed (${r.status})` }, { status: 502 });
  return new Response(r.body, {
    headers: { "Content-Type": r.headers.get("content-type") ?? "image/png", "Cache-Control": "private, max-age=3600" },
  });
}
