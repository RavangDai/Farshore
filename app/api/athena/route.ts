import { GET as get } from "../../../server/arcade";
import { POST as post } from "../../../server/athena";
import { modelApi } from "../../../server/lib/model-api";
export const dynamic = "force-dynamic";
export const GET = modelApi(get, post, { bucket: "athena", perMinute: 12 });
export const POST = GET;
