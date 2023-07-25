import { Brand, Context, Effect, Function, Layer, ReadonlyArray } from "effect";
import { Id } from "./Branded.js";
import { Config, ConfigLive } from "./Config.js";
import { Db, Query, Row, Table, Value } from "./Db.js";
import { EvoluError } from "./EvoluError.js";
import { MerkleTree } from "./MerkleTree.js";
import { Mnemonic } from "./Mnemonic.js";
import { Owner } from "./Owner.js";
import { SyncState } from "./SyncState.js";
import { TimestampString } from "./Timestamp.js";
import { runPromise } from "./run.js";

export interface DbWorker {
  readonly postMessage: (input: DbWorkerInput) => void;
  readonly onMessage: (callback: (output: DbWorkerOutput) => void) => void;
}

export const DbWorker = Context.Tag<DbWorker>();

export type DbWorkerInput =
  | {
      readonly _tag: "init";
      readonly config: Config;
      readonly tables: ReadonlyArray<Table>;
    }
  | {
      readonly _tag: "sendMessages";
      readonly newMessages: ReadonlyArray.NonEmptyReadonlyArray<NewMessage>;
      readonly onCompleteIds: ReadonlyArray<OnCompleteId>;
      readonly queries: ReadonlyArray<Query>;
    }
  | {
      readonly _tag: "query";
      readonly queries: ReadonlyArray.NonEmptyReadonlyArray<Query>;
    }
  | {
      readonly _tag: "sync";
      readonly queries: ReadonlyArray.NonEmptyReadonlyArray<Query> | null;
    }
  | {
      readonly _tag: "reset";
      readonly mnemonic?: Mnemonic;
    }
  | DbWorkerInputReceiveMessages;

export interface NewMessage {
  readonly table: string;
  readonly row: Id;
  readonly column: string;
  readonly value: Value;
}

export interface Message extends NewMessage {
  readonly timestamp: TimestampString;
}

export type OnCompleteId = string &
  Brand.Brand<"Id"> &
  Brand.Brand<"OnComplete">;

export type DbWorkerInputReceiveMessages = {
  readonly _tag: "receiveMessages";
  readonly messages: ReadonlyArray<Message>;
  readonly merkleTree: MerkleTree;
  readonly syncCount: number;
};

export type DbWorkerOutput =
  | { readonly _tag: "onError"; readonly error: EvoluError }
  | { readonly _tag: "onOwner"; readonly owner: Owner }
  | {
      readonly _tag: "onQuery";
      readonly queriesPatches: ReadonlyArray<QueryPatches>;
      readonly onCompleteIds: ReadonlyArray<OnCompleteId>;
    }
  | { readonly _tag: "onReceive" }
  | { readonly _tag: "onResetOrRestore" }
  | { readonly _tag: "onSyncState"; readonly state: SyncState };

export interface QueryPatches {
  readonly query: Query;
  readonly patches: ReadonlyArray<Patch>;
}

export type Patch = ReplaceAllPatch | ReplaceAtPatch;

export interface ReplaceAllPatch {
  readonly op: "replaceAll";
  readonly value: ReadonlyArray<Row>;
}

export interface ReplaceAtPatch {
  readonly op: "replaceAt";
  readonly index: number;
  readonly value: Row;
}

type OnMessageCallback = Parameters<DbWorker["onMessage"]>[0];
const OnMessageCallback = Context.Tag<OnMessageCallback>();

const init = (_tables: ReadonlyArray<Table>): Effect.Effect<Db, never, Owner> =>
  Effect.sync(() => {
    throw "";
  });

const foo: Effect.Effect<Db, never, void> = Effect.sync(() => {
  throw "";
});

const bar = Effect.sync(() => {
  throw "";
});

export const DbWorkerLive = Layer.effect(
  DbWorker,
  Effect.map(Db, (db) => {
    let onMessageCallback: OnMessageCallback = Function.constVoid;

    // let config: Partial<Config> | undefined = undefined;
    // // dokazuj vynutit prvni? neni nutne
    // const inputToEffect = (
    //   input: DbWorkerInput
    // ): Effect.Effect<Db | OnMessageCallback, never, undefined> => {
    //   switch (input._tag) {
    //     case "init":
    //       throw new self.Error("Init must be called once.");
    //     case "query":
    //     case "receiveMessages":
    //     case "reset":
    //     case "sendMessages":
    //     case "sync":
    //       return init;
    //   }
    // };

    const DbLive = Layer.succeed(Db, db);

    const run: <E>(effect: Effect.Effect<never, E, void>) => Promise<void> = (
      effect
    ) =>
      effect.pipe(
        // TODO: transaction,
        // TODO: Port previous logic.
        Effect.catchAllCause((_cause) => Effect.succeed(undefined)),
        runPromise
      );

    // jde to vubec?
    // const effects =

    let write: (input: DbWorkerInput) => Promise<void> = (input) => {
      if (input._tag !== "init")
        throw new self.Error("Init must be called first.");

      return init(input.tables).pipe(
        Effect.map((_owner) => {
          // input.config
          // expression v () a potom pipe?
          // hmm, hnus, ale nemusim typovat!
          // nemam pouzit match?
          // pockat, preci muzu mit objekt
          // a jit pres klic, a rovnou predat, ne?
          // nebo klidne map, hmm!
          // nebo ten match, o kolik navic by to melo? schvalne
          write = (input): Promise<void> =>
            (input._tag === "query" ? foo : bar).pipe(
              Effect.provideLayer(
                Layer.mergeAll(
                  Layer.succeed(Db, db),
                  ConfigLive(), // TODO: config
                  Layer.succeed(
                    OnMessageCallback,
                    OnMessageCallback.of(onMessageCallback)
                  )
                )
              ),
              run
            );
        }),
        Effect.provideLayer(DbLive),
        run
      );
    };

    const stream = new WritableStream<DbWorkerInput>({
      write: (input): Promise<void> => write(input),
      // write: (input): Promise<void> =>
      //   inputToEffect(input).pipe(
      //     Effect.provideLayer(
      //       Layer.mergeAll(
      //         Layer.succeed(Db, db),
      //         ConfigLive(), // TODO: config
      //         Layer.succeed(
      //           OnMessageCallback,
      //           OnMessageCallback.of(onMessageCallback)
      //         )
      //       )
      //     ),
      //     // TODO: transaction,
      //     // TODO: Port previous logic.
      //     Effect.catchAllCause((_cause) => Effect.succeed(undefined)),
      //     Effect.runPromise
      //   ),
    });

    const postMessage: DbWorker["postMessage"] = (input) => {
      const writer = stream.getWriter();
      // It can't fail because both expected and unexpected errors are handled.
      void writer.write(input);
      writer.releaseLock();
    };

    const onMessage: DbWorker["onMessage"] = (callback) => {
      onMessageCallback = callback;
    };

    return { postMessage, onMessage };
  })
);
