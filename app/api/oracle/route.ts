import { GET as get } from "../../../server/arcade";
import { POST as post } from "../../../server/oracle/oracle";
import { modelApi } from "../../../server/lib/model-api";
export const dynamic = "force-dynamic";
// The Oracle's Key: a retrieval-augmented question before an encounter (server/oracle).
export const GET = modelApi(get, post, { bucket: "oracle", perMinute: 10 });
export const POST = GET;
