import { installAbortSignalPolyfill } from "abort-signal-polyfill";
// @ts-expect-error Shimming Set prototype methods
import difference from "set.prototype.difference";
// @ts-expect-error Shimming Set prototype methods
import intersection from "set.prototype.intersection";
// @ts-expect-error Shimming Set prototype methods
import isDisjointFrom from "set.prototype.isdisjointfrom";
// @ts-expect-error Shimming Set prototype methods
import isSubsetOf from "set.prototype.issubsetof";
// @ts-expect-error Shimming Set prototype methods
import isSupersetOf from "set.prototype.issupersetof";
// @ts-expect-error Shimming Set prototype methods
import symmetricDifference from "set.prototype.symmetricdifference";
// @ts-expect-error Shimming Set prototype methods
import union from "set.prototype.union";

export const installPolyfills = (): void => {
  installAbortSignalPolyfill();

  difference.shim();
  intersection.shim();
  isDisjointFrom.shim();
  isSubsetOf.shim();
  isSupersetOf.shim();
  symmetricDifference.shim();
  union.shim();

  // @see https://github.com/facebook/hermes/pull/1452
  if (typeof Promise.withResolvers === "undefined") {
    // @ts-expect-error This is OK.
    Promise.withResolvers = () => {
      let resolve, reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }
};
