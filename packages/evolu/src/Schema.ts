import { ReadonlyRecord } from "effect";
import { Row } from "./Db.js";
import { Id } from "./Id.js";

/**
 * Schema defines database schema.
 */
export type Schema = ReadonlyRecord.ReadonlyRecord<{ id: Id } & Row>;
