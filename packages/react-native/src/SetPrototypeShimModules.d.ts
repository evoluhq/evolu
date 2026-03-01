interface SetPrototypeShimModule {
  shim: () => void;
}

declare module "set.prototype.difference" {
  const difference: SetPrototypeShimModule;
  export default difference;
}

declare module "set.prototype.intersection" {
  const intersection: SetPrototypeShimModule;
  export default intersection;
}

declare module "set.prototype.isdisjointfrom" {
  const isDisjointFrom: SetPrototypeShimModule;
  export default isDisjointFrom;
}

declare module "set.prototype.issubsetof" {
  const isSubsetOf: SetPrototypeShimModule;
  export default isSubsetOf;
}

declare module "set.prototype.issupersetof" {
  const isSupersetOf: SetPrototypeShimModule;
  export default isSupersetOf;
}

declare module "set.prototype.symmetricdifference" {
  const symmetricDifference: SetPrototypeShimModule;
  export default symmetricDifference;
}

declare module "set.prototype.union" {
  const union: SetPrototypeShimModule;
  export default union;
}
