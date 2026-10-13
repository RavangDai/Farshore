import { MongoClient, type Db } from "mongodb";
import { runtimeConfig } from "./runtime-config.ts";

type Connection = { client: MongoClient; db: Db };
const shared = globalThis as typeof globalThis & { farshoreMongo?: Promise<Connection> };
export async function createIndexes(db: Db) {
  await Promise.all([
    db.collection("user").createIndex({ email: 1 }, { unique: true }),
    db.collection("session").createIndex({ token: 1 }, { unique: true }),
    db.collection("session").createIndex({ userId: 1 }),
    db.collection("session").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("account").createIndex({ providerId: 1, accountId: 1 }, { unique: true }),
    db.collection("account").createIndex({ userId: 1 }),
    db.collection("verification").createIndex({ identifier: 1 }),
    db.collection("verification").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("campaigns").createIndex({ userId: 1 }, { unique: true }),
    db.collection("saveRequests").createIndex({ userId: 1, requestId: 1 }, { unique: true }),
    db.collection("aiSettings").createIndex({ userId: 1 }, { unique: true }),
    db.collection("requestLimits").createIndex({ key: 1, bucket: 1 }, { unique: true }),
    db.collection("requestLimits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}
export async function database(): Promise<Connection | null> {
  const config = runtimeConfig();
  if (!config.mongoUri) return null;
  if (!shared.farshoreMongo) {
    const client = new MongoClient(config.mongoUri, { maxPoolSize: 10, serverSelectionTimeoutMS: 5000 });
    shared.farshoreMongo = (async () => {
      try {
        await client.connect();
        const db = client.db(config.mongoDatabase);
        const topology = await db.admin().command({ hello: 1 });
        if (!topology.setName && topology.msg !== "isdbgrid") throw new Error("MongoDB replica set required.");
        await createIndexes(db);
        return { client, db };
      } catch (error) {
        await client.close();
        shared.farshoreMongo = undefined;
        throw error;
      }
    })();
  }
  return shared.farshoreMongo;
}
