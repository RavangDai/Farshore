import { json } from "../../../server/lib/http";
export const runtime = "nodejs";
export async function GET() { return json({ status: "ok" }); }
