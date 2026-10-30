// Verifies the access code before the app is shown (no Comfy call, nothing spent).
import { denied } from "@/lib/comfy";

export async function GET(req: Request) {
  return denied(req) ?? Response.json({ ok: true });
}
