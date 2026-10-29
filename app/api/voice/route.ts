import { GET as get, POST as post } from "../../../server/voice";
import { canonicalRequest, checkWriteRequest } from "../../../server/lib/http";
export const dynamic = "force-dynamic";
export const GET = () => get();
export async function POST(request: Request) {
  request = canonicalRequest(request);
  return checkWriteRequest(request) || post(request);
}
