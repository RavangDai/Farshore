import { GET as get } from "../../../server/arcade";
import { POST as post } from "../../../server/commentary";
import { modelApi } from "../../../server/lib/model-api";
export const dynamic = "force-dynamic";
export const GET = modelApi(get, post, { bucket: "commentary", perMinute: 24 });
export const POST = GET;
