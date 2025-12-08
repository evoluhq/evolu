"use client";

import { FC, useRef, useState } from "react";

interface WorkerResponse {
  readonly success: boolean;
  readonly message: string;
  readonly data?: Array<Record<string, any>>;
  readonly rowCount?: number;
}

export const EvoloDatabaseWorkerLifecycleTest: FC = () => {
  const workerRef = useRef<Worker | null>(null);
  const [tenantId] = useState(() => "tenant-lifecycle-test");
  const [status, setStatus] = useState<"idle" | "active">(`idle`);
  const [lastResponse, setLastResponse] = useState<WorkerResponse | null>(null);
  const [clickCount, setClickCount] = useState(0);

  const createAndUseWorker = () => {
    // Terminate previous worker if exists
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    // Create new worker
    const worker = new Worker(
      new URL("./db-worker-lifecycle.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      setLastResponse(response);

      // If we got "db closed" response, then terminate the worker
      if (response.message.includes("closed successfully")) {
        worker.terminate();
        workerRef.current = null;
        setStatus("idle");
      } else {
        // Database initialized or data retrieved
        setStatus("active");
      }
    };

    worker.onerror = (error) => {
      setLastResponse({
        success: false,
        message: `Worker error: ${error.message}`,
      });
      worker.terminate();
      workerRef.current = null;
      setStatus("idle");
    };

    workerRef.current = worker;

    // Initialize DB
    worker.postMessage({ tenantId });
    setClickCount((prev) => prev + 1);
  };

  const closeDbAndTerminateWorker = () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ action: "close" });
    }
  };

  return (
    <div className="min-h-screen px-8 py-8">
      <div className="max-w-3xl">
        <h1 className="mb-4 text-2xl font-bold">
          SQLite WASM Worker Lifecycle Test
        </h1>

        <div className="mb-4 rounded bg-amber-50 p-4 text-sm text-amber-800">
          <p className="mb-2">
            <strong>Purpose:</strong> Tests the WebKit bug fix scenario
          </p>
          <p>
            Each click: Create worker → Initialize DB → Close DB → Terminate
            worker → Repeat with persisted data
          </p>
        </div>

        <div className="mb-4 rounded bg-blue-50 p-3">
          <p className="text-sm text-blue-700">
            <strong>Tenant ID:</strong> {tenantId}
          </p>
          <p className="text-sm text-blue-700">
            <strong>Click Count:</strong> {clickCount}
          </p>
          <p className="text-sm text-blue-700">
            <strong>Worker Status:</strong>{" "}
            <span
              className={
                status === "active"
                  ? "font-semibold text-green-600"
                  : "font-semibold text-gray-600"
              }
            >
              {status}
            </span>
          </p>
        </div>

        <button
          onClick={createAndUseWorker}
          disabled={status === "active"}
          className={`rounded px-6 py-3 text-white disabled:opacity-50 ${
            status === "active"
              ? "bg-gray-500"
              : "bg-blue-500 hover:bg-blue-600"
          }`}
        >
          {status === "active"
            ? "Processing..."
            : "Create Worker → Initialize DB"}
        </button>

        {status === "active" && (
          <button
            onClick={closeDbAndTerminateWorker}
            className="ml-3 rounded bg-red-500 px-6 py-3 text-white hover:bg-red-600"
          >
            Close DB & Terminate Worker
          </button>
        )}

        {lastResponse && (
          <div className="mt-6 mb-6 rounded bg-gray-100 p-4">
            <div className="mb-3">
              <span
                className={`inline-block rounded px-2 py-1 text-sm font-semibold ${
                  lastResponse.success
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {lastResponse.success ? "SUCCESS" : "ERROR"}
              </span>
            </div>

            <p className="mb-3 text-sm text-gray-700">
              <strong>Message:</strong> {lastResponse.message}
            </p>

            {lastResponse.rowCount !== undefined && (
              <p className="mb-3 text-sm text-gray-700">
                <strong>Row Count:</strong> {lastResponse.rowCount}
              </p>
            )}

            {lastResponse.data && lastResponse.data.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-gray-700">
                  Data:
                </p>
                <div className="overflow-x-auto rounded border bg-white">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="px-2 py-1 text-left">ID</th>
                        <th className="px-2 py-1 text-left">Name</th>
                        <th className="px-2 py-1 text-left">Value</th>
                        <th className="px-2 py-1 text-left">Created At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastResponse.data.map((row, index) => (
                        <tr key={index} className="border-b">
                          <td className="px-2 py-1">{row.id}</td>
                          <td className="px-2 py-1">{row.name}</td>
                          <td className="px-2 py-1">{row.value}</td>
                          <td className="px-2 py-1 text-xs">
                            {row.created_at}
                          </td>
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
            Test Sequence:
          </h2>
          <ol className="space-y-2 text-sm text-blue-700">
            <li>
              <strong>Click "Create Worker":</strong> Create worker, initialize
              DB, insert data, select
            </li>
            <li>
              <strong>Click "Close DB & Terminate":</strong> Explicitly close DB
              (worker responds with "db closed successfully")
            </li>
            <li>
              <strong>Auto:</strong> Main thread receives confirmation and
              terminates worker
            </li>
            <li>
              <strong>Click "Create Worker" again:</strong> Create worker #2,
              same DB opens (data persists)
            </li>
            <li>
              <strong>Repeat:</strong> Each new worker opens same DB with
              persisted data
            </li>
            <li>
              <strong>Tests:</strong> Explicit close flow, no unreliable unload
              handlers, proper lifecycle control
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
};
