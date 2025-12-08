import sqlite3InitModule, { Database } from "@evolu/sqlite-wasm";

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

interface WorkerMessage {
  readonly tenantId?: string;
  readonly action?: "close";
}

interface WorkerResponse {
  readonly success: boolean;
  readonly message: string;
  readonly data?: Array<Record<string, any>>;
  readonly rowCount?: number;
}

const initDb = async (tenantId: string): Promise<WorkerResponse> => {
  try {
    const sqlite3 = await sqlite3Promise;
    // @ts-expect-error Missing types
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    sqlite3.capi.sqlite3mc_vfs_create("opfs", 1);

    // Install pool if not already done
    const currentPool = await sqlite3.installOpfsSAHPoolVfs({
      directory: `.${tenantId}`,
    });

    // Open or create database
    currentDb = new currentPool.OpfsSAHPoolDb(`/evolu.db`);

    // Create table if it doesn't exist
    currentDb.exec(`
      CREATE TABLE IF NOT EXISTS test_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert test data
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

    // Select to verify
    const rows = currentDb.exec(`SELECT * FROM test_data ORDER BY id;`, {
      returnValue: "resultRows",
      rowMode: "object",
    });

    return {
      success: true,
      message: "Database initialized and data inserted",
      data: rows as Array<Record<string, any>>,
      rowCount: (rows as Array<Record<string, any>>).length,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to initialize database: ${String(error)}`,
    };
  }
};

const _closeDb = (): WorkerResponse => {
  try {
    if (!currentDb) {
      return {
        success: true,
        message: "No database to close",
      };
    }

    // Just close the database, keep VFS and data intact
    // Data persists in OPFS for next worker instance
    currentDb.close();
    currentDb = null;

    return {
      success: true,
      message: "Database closed successfully (data persists in OPFS)",
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to close database: ${String(error)}`,
    };
  }
};

const selectData = (): WorkerResponse => {
  try {
    if (!currentDb) {
      return {
        success: false,
        message: "No database connection",
      };
    }

    const rows = currentDb.exec(`SELECT * FROM test_data ORDER BY id;`, {
      returnValue: "resultRows",
      rowMode: "object",
    });

    return {
      success: true,
      message: "Data retrieved successfully",
      data: rows as Array<Record<string, any>>,
      rowCount: (rows as Array<Record<string, any>>).length,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to select data: ${String(error)}`,
    };
  }
};

// Handle messages from main thread
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { tenantId, action } = event.data;

  let response: WorkerResponse;

  if (action === "close") {
    response = _closeDb();
  } else if (!currentDb && tenantId) {
    // Auto-initialize on first message with tenantId
    response = await initDb(tenantId);
  } else {
    // If already initialized, just select data
    response = selectData();
  }

  self.postMessage(response);
};
