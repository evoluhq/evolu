import type { RuleTester } from "oxlint/plugins-dev";

type Rule = Parameters<RuleTester["run"]>[1];

declare const plugin: {
  readonly rules: {
    readonly "require-pure-annotation": Rule;
  };
};

export default plugin;
