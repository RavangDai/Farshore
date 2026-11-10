import { GET as get } from "../../../server/arcade";
import { POST as post } from "../../../server/decide";
import { modelApi } from "../../../server/lib/model-api";
export const dynamic = "force-dynamic";
export const GET = modelApi(get, post, { bucket: "decide", perMinute: 30 });
export const POST = GET;
