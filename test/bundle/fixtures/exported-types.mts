import {
  array,
  Int64FromInt64String,
  json,
  map,
  minLength,
  Number,
  object,
  record,
  set,
  String,
  templateLiteral,
  tuple,
  union,
} from "@evolu/common";

// Declaration emit must name every Type, error, and operation reachable from
// these inferred exports through the package entry point. Local Types are
// inlined into the declarations that use them.

const Label = minLength(1)(String);
const Labels = array(Label);
const Kind = union("physical", "digital");
const LabelSet = set(Label);
const LabelCounts = map(Label, Number);
const LabelAndId = tuple(Label, Int64FromInt64String);
const ItemId = templateLiteral("item-", Int64FromInt64String);
const Rest = record(String, String);
const LabelByName = record(String, Label);

export const Product = /*#__PURE__*/ object({ tags: Labels, kind: Kind });
export const [ProductJson] = /*#__PURE__*/ json(Product, "ProductJson");
export const Inventory = /*#__PURE__*/ object({ labels: LabelSet });
export const Attributes = /*#__PURE__*/ object({ id: String }, Rest);

export const productFrom = Product.from;
export const labelsFrom = Labels.from;
export const labelSetFrom = LabelSet.from;
export const labelCountsFrom = LabelCounts.from;
export const labelAndIdFrom = LabelAndId.from;
export const labelByNameFrom = LabelByName.from;
export const itemIdTo = ItemId.to;
