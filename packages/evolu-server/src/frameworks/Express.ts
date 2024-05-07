import SQLite from "better-sqlite3";
import bodyParser from "body-parser";
import cors from "cors";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import * as Exit from "effect/Exit";
import { flow } from "effect/Function";
import * as Match from "effect/Match";
import express from "express";
import { Kysely, SqliteDialect } from "kysely";
import path from "path";
import { Server, ServerLive } from "../Server.js";
import { Database, Db } from "../Types.js";

const createDb = (fileName: string) =>
  new Kysely<Database>({
    dialect: new SqliteDialect({
      database: new SQLite(path.join(process.cwd(), "/", fileName)),
    }),
  });

export const createExpressApp = Effect.gen(function* (_) {
  const server = yield* _(
    Server.pipe(
      Effect.provide(ServerLive),
      Effect.provideService(Db, createDb("db.sqlite")),
    ),
  );

  yield* _(server.initDatabase);

  const app = express();
  app.use(cors());
  app.use(bodyParser.raw({ limit: "20mb", type: "application/x-protobuf" }));

  app.post("/", (req, res) => {
    Effect.runCallback(server.sync(req.body as Uint8Array), {
      onExit: Exit.match({
        onFailure: flow(
          Cause.failureOrCause,
          Either.match({
            onLeft: flow(
              Match.value,
              Match.tagsExhaustive({
                BadRequestError: ({ error }) => {
                  res.status(400).send(JSON.stringify(error));
                },
              }),
            ),
            onRight: (error) => {
              // eslint-disable-next-line no-console
              console.log(error);
              res.status(500);
            },
          }),
        ),
        onSuccess: (buffer) => {
          res.setHeader("Content-Type", "application/x-protobuf");
          res.send(buffer);
        },
      }),
    });
  });

  return app;
});
