import type { Db } from "mongodb";
export async function consumeLimit(db: Db, key: string, max: number, windowSeconds = 60, now = Date.now()) {
  const bucket = Math.floor(now / (windowSeconds * 1000));
  const collection = db.collection<{ key: string; bucket: number; count: number; expiresAt: Date }>("requestLimits");
  let row;
  try {
    row = await collection.findOneAndUpdate({ key, bucket }, {
      $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 2) * windowSeconds * 1000) },
    }, { upsert: true, returnDocument: "after" });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    row = await collection.findOneAndUpdate({ key, bucket }, { $inc: { count: 1 } }, { returnDocument: "after" });
  }
  return !!row && row.count <= max;
}
