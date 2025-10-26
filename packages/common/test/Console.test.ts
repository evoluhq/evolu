import { expect, test, vi } from "vitest";
import { createConsole, createConsoleWithTime } from "../src/Console.js";

// Mock console to capture calls
const mockConsole = {
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  time: vi.fn(),
  timeEnd: vi.fn(),
  dir: vi.fn(),
  table: vi.fn(),
  count: vi.fn(),
  countReset: vi.fn(),
  assert: vi.fn(),
  timeLog: vi.fn(),
  trace: vi.fn(),
};

// Mock global console
vi.stubGlobal("console", mockConsole);

// Mock performance.now for deterministic timestamps
const mockPerformanceNow = vi.fn();
vi.stubGlobal("performance", { now: mockPerformanceNow });

// Mock Date for deterministic absolute timestamps
const mockDate = vi.fn();
vi.stubGlobal("Date", mockDate);

test("createConsole with enableLogging: false (default)", () => {
  const console = createConsole();

  expect(console.enabled).toBe(false);

  console.log("test message");
  console.info("test info");
  console.warn("test warning");
  console.debug("test debug");

  // Should not call underlying console methods when disabled
  expect(mockConsole.log).not.toHaveBeenCalled();
  expect(mockConsole.info).not.toHaveBeenCalled();
  expect(mockConsole.warn).not.toHaveBeenCalled();
  expect(mockConsole.debug).not.toHaveBeenCalled();
});

test("createConsole with enableLogging: true", () => {
  vi.clearAllMocks();
  const console = createConsole({ enableLogging: true });

  expect(console.enabled).toBe(true);

  console.log("test message", { data: "value" });
  console.info("test info");
  console.warn("test warning");
  console.debug("test debug");

  // Should call underlying console methods when enabled
  expect(mockConsole.log).toHaveBeenCalledWith("test message", {
    data: "value",
  });
  expect(mockConsole.info).toHaveBeenCalledWith("test info");
  expect(mockConsole.warn).toHaveBeenCalledWith("test warning");
  expect(mockConsole.debug).toHaveBeenCalledWith("test debug");
});

test("createConsole error method always logs", () => {
  vi.clearAllMocks();
  const console = createConsole({ enableLogging: false });

  console.error("critical error", { details: "something went wrong" });

  // Error should always log, even when disabled
  expect(mockConsole.error).toHaveBeenCalledWith("critical error", {
    details: "something went wrong",
  });
});

test("createConsole enabled property can be changed", () => {
  vi.clearAllMocks();
  const console = createConsole({ enableLogging: false });

  console.log("should not log");
  expect(mockConsole.log).not.toHaveBeenCalled();

  // Enable logging
  console.enabled = true;
  console.log("should log now");
  expect(mockConsole.log).toHaveBeenCalledWith("should log now");

  // Disable logging again
  console.enabled = false;
  console.log("should not log again");
  expect(mockConsole.log).toHaveBeenCalledTimes(1); // Still only one call
});

test("createConsole other methods", () => {
  vi.clearAllMocks();
  const console = createConsole({ enableLogging: true });

  console.time("timer");
  console.timeEnd("timer");
  console.dir({ obj: "value" });
  console.table([{ a: 1, b: 2 }]);
  console.count("counter");
  console.countReset("counter");
  console.assert(true, "assertion message");
  console.timeLog("timer", "data");
  console.trace("trace message");

  expect(mockConsole.time).toHaveBeenCalledWith("timer");
  expect(mockConsole.timeEnd).toHaveBeenCalledWith("timer");
  expect(mockConsole.dir).toHaveBeenCalledWith({ obj: "value" }, undefined);
  expect(mockConsole.table).toHaveBeenCalledWith([{ a: 1, b: 2 }], undefined);
  expect(mockConsole.count).toHaveBeenCalledWith("counter");
  expect(mockConsole.countReset).toHaveBeenCalledWith("counter");
  expect(mockConsole.assert).toHaveBeenCalledWith(true, "assertion message");
  expect(mockConsole.timeLog).toHaveBeenCalledWith("timer", "data");
  expect(mockConsole.trace).toHaveBeenCalledWith("trace message");
});

test("createConsoleWithTime default config", () => {
  mockPerformanceNow.mockReturnValue(1000); // Start time
  const console = createConsoleWithTime();

  expect(console.enabled).toBe(false); // Default is disabled

  // Enable for testing
  console.enabled = true;

  mockPerformanceNow.mockReturnValue(1234); // 234ms later
  vi.clearAllMocks();

  console.log("test message");

  // Should add relative timestamp by default
  expect(mockConsole.log).toHaveBeenCalledWith("[+0.234s]", "test message");
});

test("createConsoleWithTime relative timestamps", () => {
  mockPerformanceNow.mockReturnValue(0); // Start time
  const console = createConsoleWithTime({
    enableLogging: true,
    timestampType: "relative",
  });

  vi.clearAllMocks();

  // Test different time scales
  mockPerformanceNow.mockReturnValue(1234); // 1.234 seconds
  console.log("message 1");
  expect(mockConsole.log).toHaveBeenCalledWith("[+1.234s]", "message 1");

  mockPerformanceNow.mockReturnValue(65000); // 1 minute 5 seconds
  console.info("message 2");
  expect(mockConsole.info).toHaveBeenCalledWith("[+1m5.000s]", "message 2");

  mockPerformanceNow.mockReturnValue(3665000); // 1 hour 1 minute 5 seconds
  console.warn("message 3");
  expect(mockConsole.warn).toHaveBeenCalledWith("[+1h1m5.000s]", "message 3");
});

test("createConsoleWithTime absolute timestamps", () => {
  const mockDateInstance = {
    getHours: vi.fn().mockReturnValue(14),
    getMinutes: vi.fn().mockReturnValue(32),
    getSeconds: vi.fn().mockReturnValue(15),
    getMilliseconds: vi.fn().mockReturnValue(234),
  };
  mockDate.mockReturnValue(mockDateInstance);

  const console = createConsoleWithTime({
    enableLogging: true,
    timestampType: "absolute",
  });

  vi.clearAllMocks();

  console.log("test message");

  expect(mockConsole.log).toHaveBeenCalledWith(
    "[14:32:15.234]",
    "test message",
  );
});

test("createConsoleWithTime enabled property synchronization", () => {
  mockPerformanceNow.mockReturnValue(0);
  const console = createConsoleWithTime({
    enableLogging: false,
    timestampType: "relative",
  });

  vi.clearAllMocks();
  mockPerformanceNow.mockReturnValue(1000);

  // Should not log when disabled
  console.log("should not log");
  expect(mockConsole.log).not.toHaveBeenCalled();

  // Enable and test
  console.enabled = true;
  console.log("should log");
  expect(mockConsole.log).toHaveBeenCalledWith("[+1.000s]", "should log");

  // Disable and test
  console.enabled = false;
  console.log("should not log again");
  expect(mockConsole.log).toHaveBeenCalledTimes(1); // Still only one call
});

test("createConsoleWithTime error always logs with timestamp", () => {
  mockPerformanceNow.mockReturnValue(0);
  const console = createConsoleWithTime({
    enableLogging: false, // Disabled
    timestampType: "relative",
  });

  vi.clearAllMocks();
  mockPerformanceNow.mockReturnValue(500);

  console.error("critical error");

  // Error should always log with timestamp, even when disabled
  expect(mockConsole.error).toHaveBeenCalledWith("[+0.500s]", "critical error");
});

test("createConsoleWithTime preserves non-timestamped methods", () => {
  const console = createConsoleWithTime({
    enableLogging: true,
    timestampType: "relative",
  });

  vi.clearAllMocks();

  // These methods should not get timestamps
  console.time("timer");
  console.timeEnd("timer");
  console.dir({ obj: "value" });
  console.table([{ a: 1 }]);
  console.count("counter");
  console.countReset("counter");
  console.assert(true, "assertion");
  console.timeLog("timer", "data");

  expect(mockConsole.time).toHaveBeenCalledWith("timer");
  expect(mockConsole.timeEnd).toHaveBeenCalledWith("timer");
  expect(mockConsole.dir).toHaveBeenCalledWith({ obj: "value" }, undefined);
  expect(mockConsole.table).toHaveBeenCalledWith([{ a: 1 }], undefined);
  expect(mockConsole.count).toHaveBeenCalledWith("counter");
  expect(mockConsole.countReset).toHaveBeenCalledWith("counter");
  expect(mockConsole.assert).toHaveBeenCalledWith(true, "assertion");
  expect(mockConsole.timeLog).toHaveBeenCalledWith("timer", "data");
});

test("createConsoleWithTime trace gets timestamp", () => {
  mockPerformanceNow.mockReturnValue(0);
  const console = createConsoleWithTime({
    enableLogging: true,
    timestampType: "relative",
  });

  vi.clearAllMocks();
  mockPerformanceNow.mockReturnValue(1500);

  console.trace("trace message", { extra: "data" });

  expect(mockConsole.trace).toHaveBeenCalledWith("[+1.500s]", "trace message", {
    extra: "data",
  });
});
