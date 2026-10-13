import { json } from "../../../server/http";
export const runtime = "nodejs";
export async function GET() { return json({ status: "ok" }); }
