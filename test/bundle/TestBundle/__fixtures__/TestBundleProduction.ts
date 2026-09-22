if (process.env.NODE_ENV !== "production") {
  throw new Error("development-code-must-be-eliminated");
}

export default process.env.NODE_ENV;
