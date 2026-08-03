const scenario = process.env.EVOLU_TEST_BUNDLE_SCENARIO;

if (scenario === "evaluation-error") throw new Error("evaluation failed");

export default (): unknown => {
  switch (scenario) {
    case "rejected-return-value":
      return Promise.reject(new Error("return rejected"));
    case "unhandled-rejection":
      void Promise.reject(new Error("unhandled rejection"));
      return 42;
    case "uncaught-asynchronous-error":
      setImmediate(() => {
        throw new Error("uncaught error");
      });
      return new Promise(() => undefined);
    case "non-cloneable-return-value":
      return () => undefined;
    case "early-worker-exit":
      return process.exit(0);
    case "timeout":
      return new Promise(() => setInterval(() => undefined, 1000));
    default:
      return 42;
  }
};
