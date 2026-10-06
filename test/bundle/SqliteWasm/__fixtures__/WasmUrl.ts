import { sqliteWasmUrl } from "../../../../packages/sqlite-wasm/src/index.ts";

// The URL as the bundle rewrote it, which the test reads the binary from.
export default (): string => sqliteWasmUrl.href;
