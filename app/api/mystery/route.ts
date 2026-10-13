import { GET as get, POST as post } from "../../../server/mystery";
import { modelApi } from "../../../lib/model-api";
export const dynamic = "force-dynamic";
export const GET = modelApi(get,post);
export const POST = GET;
