"use client";

import { FC, useEffect, useRef, useState } from "react";

interface DatabaseResponse {
  readonly success: boolean;
  readonly action: "create" | "dispose";
  readonly message?: string;
  readonly data?: Array<Record<string, any>>;
}

export const EvoluMultitenantExample: FC = () => {
  const workerRef = useRef<Worker | null>(null);
  // Rotate through 3 stable tenant IDs to test multiple scenarios
  const [tenantIndex, setTenantIndex] = useState(0);
  const stableTenantIds = [
    "tenant-stable-1",
    "tenant-stable-2",
    "tenant-stable-3",
  ];
  const tenantId = stableTenantIds[tenantIndex];
  const [dbState, setDbState] = useState<{
    isCreated: boolean;
    isProcessing: boolean;
    lastResponse: DatabaseResponse | null;
  }>({
    isCreated: false,
    isProcessing: false,
    lastResponse: null,
  });

  useEffect(() => {
    // Initialize web worker
    // In Evolu, each instance has its own worker = one worker per Evolu instance
    workerRef.current = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });

    // Handle messages from worker
    workerRef.current.onmessage = (event: MessageEvent<DatabaseResponse>) => {
      const response = event.data;
      setDbState((_prev) => ({
        isCreated: response.action === "create" ? response.success : false,
        isProcessing: false,
        lastResponse: response,
      }));
    };

    // Cleanup: terminate worker when component unmounts
    // This ensures the database is closed and worker resources are released
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  const handleToggleDatabase = () => {
    if (!workerRef.current || dbState.isProcessing) return;

    setDbState((_prev) => ({
      ..._prev,
      isProcessing: true,
    }));

    const action = dbState.isCreated ? "dispose" : "create";
    workerRef.current.postMessage({
      action,
      ...(action === "create" && { tenantId }),
    });

    // On dispose, rotate to next tenant ID for next create
    if (dbState.isCreated) {
      setTenantIndex((prev) => (prev + 1) % stableTenantIds.length);
    }
  };

  const getButtonText = () => {
    if (dbState.isProcessing) {
      return dbState.isCreated
        ? "Disposing Database..."
        : "Creating Database...";
    }
    return dbState.isCreated ? "Dispose Database" : "Create Database";
  };

  const getButtonColor = () => {
    if (dbState.isProcessing) return "bg-gray-500";
    return dbState.isCreated
      ? "bg-red-500 hover:bg-red-600"
      : "bg-blue-500 hover:bg-blue-600";
  };

  return (
    <div className="min-h-screen px-8 py-8">
      <div className="max-w-2xl">
        <h1 className="mb-4 text-2xl font-bold">
          SQLite WASM Database Lifecycle Test
        </h1>

        <div className="mb-4 rounded bg-blue-50 p-3">
          <p className="text-sm text-blue-700">
            <strong>Tenant ID:</strong> {tenantId}
          </p>
        </div>

        <div className="mb-6">
          <button
            onClick={handleToggleDatabase}
            disabled={dbState.isProcessing}
            className={`rounded px-4 py-2 text-white disabled:opacity-50 ${getButtonColor()}`}
          >
            {getButtonText()}
          </button>
        </div>

        {dbState.lastResponse && (
          <div className="mb-6 rounded bg-gray-100 p-4">
            <div className="mb-2">
              <span
                className={`inline-block rounded px-2 py-1 text-sm font-semibold ${
                  dbState.lastResponse.success
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {dbState.lastResponse.success ? "SUCCESS" : "ERROR"}
              </span>
              <span className="ml-2 text-sm text-gray-600">
                Action: {dbState.lastResponse.action.toUpperCase()}
              </span>
            </div>

            {dbState.lastResponse.message && (
              <p className="mb-2 text-sm text-gray-700">
                <strong>Message:</strong> {dbState.lastResponse.message}
              </p>
            )}

            {dbState.lastResponse.data &&
              dbState.lastResponse.data.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-700">
                    Retrieved Data:
                  </p>
                  <div className="overflow-x-auto rounded border bg-white p-2 text-xs">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="px-2 py-1 text-left">ID</th>
                          <th className="px-2 py-1 text-left">Name</th>
                          <th className="px-2 py-1 text-left">Value</th>
                          <th className="px-2 py-1 text-left">Created At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbState.lastResponse.data.map((row, index) => (
                          <tr key={index} className="border-b">
                            <td className="px-2 py-1">{row.id}</td>
                            <td className="px-2 py-1">{row.name}</td>
                            <td className="px-2 py-1">{row.value}</td>
                            <td className="px-2 py-1">{row.created_at}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
          </div>
        )}

        <div className="rounded bg-blue-50 p-4">
          <h2 className="mb-2 text-lg font-semibold text-blue-800">
            Test Flow:
          </h2>
          <ol className="space-y-1 text-sm text-blue-700">
            <li>
              <strong>1st click:</strong> Creates fresh database for
              tenant-stable-1, inserts test data, shows retrieved rows
            </li>
            <li>
              <strong>2nd click:</strong> Completely disposes database and
              removes VFS directory from OPFS
            </li>
            <li>
              <strong>3rd click:</strong> Creates database for tenant-stable-2
              (rotated)
            </li>
            <li>
              <strong>Continue:</strong> Tenant IDs rotate: 1 → 2 → 3 → 1 → 2 →
              3...
            </li>
            <li>
              <strong>Benefit:</strong> Test multiple tenant instances and
              verify isolated cleanup per tenant
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
};
