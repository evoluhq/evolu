import {
  SyncRequest,
  SyncResponse,
  TimestampString,
  diffMerkleTrees,
  initialMerkleTree,
  insertIntoMerkleTree,
  makeSyncTimestamp,
  merkleTreeToString,
  timestampToString,
  unsafeMerkleTreeFromString,
  unsafeTimestampFromString,
} from "@evolu/common";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { sql } from "kysely";
import { BadRequestError, Db } from "./Types.js";
import WebSocket, { WebSocketServer } from "ws";

export interface Server {
  /** Create database tables and indexes if they do not exist. */
  readonly initDatabase: Effect.Effect<void>;

  /** Sync data. */
  readonly sync: (
    body: Uint8Array,
    socketUserMap: { [key: string]: WebSocket[] | undefined },
  ) => Effect.Effect<Buffer, BadRequestError>;
}
const broadcastByMap = (
  data: ArrayBufferLike,
  socketUserMap: { [key: string]: WebSocket[] | undefined },
  userId: string,
) => {
  socketUserMap[userId]?.map((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

export const Server = Context.GenericTag<Server>("@services/Server");

export const ServerLive = Layer.effect(
  Server,
  Effect.gen(function* () {
    const db = yield* Db;

    return Server.of({
      initDatabase: Effect.promise(async () => {
        await db.schema
          .createTable("message")
          .ifNotExists()
          .addColumn("timestamp", "text")
          .addColumn("userId", "text")
          .addColumn("content", "blob")
          .addPrimaryKeyConstraint("messagePrimaryKey", ["timestamp", "userId"])
          .execute();

        await db.schema
          .createTable("merkleTree")
          .ifNotExists()
          .addColumn("userId", "text", (col) => col.primaryKey())
          .addColumn("merkleTree", "text")
          .execute();

        await db.schema
          .createIndex("messageIndex")
          .ifNotExists()
          .on("message")
          .columns(["userId", "timestamp"])
          .execute();
      }),

      sync: (body, socketUserMap) =>
        Effect.gen(function* (_) {
          const request = yield* _(
            Effect.try({
              try: () => SyncRequest.fromBinary(body),
              catch: (error): BadRequestError => ({
                _tag: "BadRequestError",
                error,
              }),
            }),
          );
          broadcastByMap(body, socketUserMap, request.userId);
          const merkleTree = yield* _(
            Effect.promise(() =>
              db
                .transaction()
                .setIsolationLevel("serializable")
                .execute(async (trx) => {
                  let merkleTree = await trx
                    .selectFrom("merkleTree")
                    .select("merkleTree")
                    .where("userId", "=", request.userId)
                    .executeTakeFirst()
                    .then((row) => {
                      if (!row) return initialMerkleTree;
                      return unsafeMerkleTreeFromString(row.merkleTree);
                    });

                  if (request.messages.length === 0) return merkleTree;

                  for (const message of request.messages) {
                    const { numInsertedOrUpdatedRows } = await trx
                      .insertInto("message")
                      .values({
                        content: message.content,
                        timestamp: message.timestamp,
                        userId: request.userId,
                      })
                      .onConflict((oc) => oc.doNothing())
                      .executeTakeFirst();

                    if (numInsertedOrUpdatedRows === 1n) {
                      merkleTree = insertIntoMerkleTree(
                        merkleTree,
                        unsafeTimestampFromString(message.timestamp),
                      );
                    }
                  }

                  const merkleTreeString = merkleTreeToString(merkleTree);

                  await trx
                    .insertInto("merkleTree")
                    .values({
                      userId: request.userId,
                      merkleTree: merkleTreeString,
                    })
                    .onConflict((oc) =>
                      oc.doUpdateSet({ merkleTree: merkleTreeString }),
                    )
                    .execute();

                  return merkleTree;
                }),
            ),
          );
          const messages = yield* _(
            diffMerkleTrees(
              merkleTree,
              unsafeMerkleTreeFromString(request.merkleTree),
            ),
            Effect.map(makeSyncTimestamp),
            Effect.map(timestampToString),
            Effect.flatMap((timestamp) =>
              Effect.promise(() =>
                db
                  .selectFrom("message")
                  .select(["timestamp", "content"])
                  .where("userId", "=", request.userId)
                  .where("timestamp", ">=", timestamp)
                  .where(
                    "timestamp",
                    "not like",
                    sql<TimestampString>`'%' || ${request.nodeId}`,
                  )
                  .orderBy("timestamp")
                  .execute(),
              ),
            ),
            Effect.orElseSucceed(() => []),
          );

          const response = SyncResponse.toBinary({
            merkleTree: merkleTreeToString(merkleTree),
            messages,
          });

          return Buffer.from(response);
        }),
    });
  }),
);
