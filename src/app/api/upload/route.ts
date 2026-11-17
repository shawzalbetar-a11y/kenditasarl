import { handleUpload } from "../../../lib/server/imageUpload";
import { authorize, sendImage, serverDb } from "../../../lib/server/cloudinaryServer";
import { activeAccount } from "../../../lib/server/activeCloudAccount";

import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleUpload(request, false, {
    authorize,
    upload: async (bytes, folder, uid) => {
      const account = await activeAccount();
      const result = await sendImage(bytes, folder, account);
      const key = createHash("sha256").update(result.url).digest("hex");
      await serverDb().doc(`upload_receipts/${key}/owners/${uid}`).set({ url: result.url });
      return result;
    },
  });
}
