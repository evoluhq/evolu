import sqlite3InitModule, { Database, SAHPoolUtil } from "@evolu/sqlite-wasm";

// @ts-expect-error Missing types.
globalThis.sqlite3ApiConfig = {
  warn: (arg: unknown) => {
    // Ignore irrelevant warning.
    // https://github.com/sqlite/sqlite-wasm/issues/62
    if (
      typeof arg === "string" &&
      arg.startsWith("Ignoring inability to install OPFS sqlite3_vfs")
    )
      return;
    // eslint-disable-next-line no-console
    console.warn(arg);
  },
};

// Init ASAP.
const sqlite3Promise = sqlite3InitModule();

// Database state
let currentDb: Database | null = null;
let currentPool: SAHPoolUtil | null = null;
let _currentTenantId: string | null = null;

interface DatabaseMessage {
  readonly action: "create" | "dispose";
  readonly tenantId?: string;
}

interface DatabaseResponse {
  readonly success: boolean;
  readonly action: "create" | "dispose";
  readonly message?: string;
  readonly data?: Array<Record<string, any>>;
}

const createDb = async (tenantId: string): Promise<DatabaseResponse> => {
  try {
    // If already exists, dispose first
    if (currentDb) {
      await disposeDb();
    }

    const sqlite3 = await sqlite3Promise;
    // This is used to make OPFS default vfs for multipleciphers
    // @ts-expect-error Missing types (update @evolu/sqlite-wasm types)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    sqlite3.capi.sqlite3mc_vfs_create("opfs", 1);

    // Use tenant ID for both directory and VFS name to ensure complete separation
    currentPool = await sqlite3.installOpfsSAHPoolVfs({
      directory: `.${tenantId}`,
    });
    currentDb = new currentPool.OpfsSAHPoolDb(`/evolu.db`);
    _currentTenantId = tenantId;

    // Create a test table
    currentDb.exec(`
      CREATE TABLE IF NOT EXISTS test_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert some test data
    const testData = [
      { name: "Test Item 1", value: 42 },
      { name: "Test Item 2", value: 84 },
      { name: "Test Item 3", value: 126 },
    ];

    for (const item of testData) {
      currentDb.exec(`
        INSERT INTO test_data (name, value) VALUES ('${item.name}', ${item.value});
      `);
    }

    // Select the data to verify
    const rows = currentDb.exec(
      `
      SELECT * FROM test_data ORDER BY id;
    `,
      { returnValue: "resultRows", rowMode: "object" },
    );

    return {
      success: true,
      action: "create",
      message: "Database created successfully",
      data: rows as Array<Record<string, any>>,
    };
  } catch (error) {
    return {
      success: false,
      action: "create",
      message: `Failed to create database: ${String(error)}`,
    };
  }
};

const disposeDb = async (): Promise<DatabaseResponse> => {
  try {
    if (!currentDb) {
      return {
        success: true,
        action: "dispose",
        message: "No database to dispose",
      };
    }

    // Proper disposal order:
    // 1. Close the database connection first
    currentDb.close();
    currentDb = null;

    // 2. Remove VFS to completely clean up and delete all files/directory
    // This ensures the next instance starts with a fresh state
    if (currentPool?.removeVfs) {
      await currentPool.removeVfs();
    }

    currentPool = null;
    _currentTenantId = null;

    return {
      success: true,
      action: "dispose",
      message: "Database disposed successfully and VFS cleaned up",
    };
  } catch (error) {
    return {
      success: false,
      action: "dispose",
      message: `Failed to dispose database: ${String(error)}`,
    };
  }
};

// Handle messages from main thread
self.onmessage = async (event: MessageEvent<DatabaseMessage>) => {
  const { action, tenantId } = event.data;

  let response: DatabaseResponse;

  switch (action) {
    case "create":
      if (!tenantId) {
        response = {
          success: false,
          action: "create",
          message: "tenantId is required for create action",
        };
      } else {
        response = await createDb(tenantId);
      }
      break;
    case "dispose":
      response = await disposeDb();
      break;
    default:
      response = {
        success: false,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        action: action as any,
        message: `Unknown action: ${action}`,
      };
  }

  self.postMessage(response);
};
