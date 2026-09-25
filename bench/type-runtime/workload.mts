import { deepStrictEqual, ok as assert, strictEqual } from "node:assert";
import {
  array,
  between,
  brand,
  Date,
  err,
  maxLength,
  minLength,
  nullOr,
  Number,
  object,
  ok,
  String,
  type TypeError,
  typeErrorToIssues,
  union,
} from "@evolu/common";

export const scenarioNames = [
  "create",
  "isValid",
  "isInvalid",
  "fromUnknownValid",
  "fromUnknownInvalidFirst",
  "fromUnknownInvalidAll",
  "standardValid",
  "standardInvalid",
] as const;
export type ScenarioName = (typeof scenarioNames)[number];

export const labelsByScenarioName = {
  create: "Create schema",
  isValid: "is, valid",
  isInvalid: "is, invalid",
  fromUnknownValid: "fromUnknown, valid",
  fromUnknownInvalidFirst: "fromUnknown, invalid, first error",
  fromUnknownInvalidAll: "fromUnknown, invalid, all errors",
  standardValid: "~standard.validate, valid",
  standardInvalid: "~standard.validate, invalid",
} satisfies Record<ScenarioName, string>;

/** Operations per measured callback, so timer overhead is negligible. */
export const batchSize = 100;

/**
 * One measured operation and a check of its last result.
 *
 * `run` stores its result, so the operation cannot be optimized away. `verify`
 * runs after measurement, so checking adds no JIT feedback before or during it.
 * It also checks every operation of the Product Type, including nested
 * validation that the measured data does not reach, so a faster but incorrect
 * implementation fails.
 */
export interface Scenario {
  readonly run: () => void;
  readonly verify: () => void;
}

export const createScenario = (name: ScenarioName): Scenario => {
  const Product = createProduct();

  switch (name) {
    case "create": {
      let result: ProductType | undefined;
      return {
        run: () => {
          result = createProduct();
        },
        verify: () => {
          assert(result);
          verifyProduct(result);
        },
      };
    }
    case "isValid":
    case "isInvalid": {
      const value = name === "isValid" ? validProduct : invalidProduct;
      let result: boolean | undefined;
      return {
        run: () => {
          result = Product.is(value);
        },
        verify: () => {
          strictEqual(result, name === "isValid");
          verifyProduct(Product);
        },
      };
    }
    case "fromUnknownValid": {
      let result: ReturnType<ProductType["fromUnknown"]> | undefined;
      return {
        run: () => {
          result = Product.fromUnknown(validProduct);
        },
        verify: () => {
          strictEqual(result?.ok && result.value, validProduct);
          verifyProduct(Product);
        },
      };
    }
    case "fromUnknownInvalidFirst":
    case "fromUnknownInvalidAll": {
      const options = {
        errors: name === "fromUnknownInvalidAll" ? "all" : "first",
      } as const;
      let result: ReturnType<ProductType["fromUnknown"]> | undefined;
      return {
        run: () => {
          result = Product.fromUnknown(invalidProduct, options);
        },
        verify: () => {
          assert(result && !result.ok);
          deepStrictEqual(
            typeErrorToIssues(Product, result.error),
            name === "fromUnknownInvalidAll"
              ? invalidProductIssues
              : invalidProductIssues.slice(0, 1),
          );
          verifyProduct(Product);
        },
      };
    }
    case "standardValid":
    case "standardInvalid": {
      const value = name === "standardValid" ? validProduct : invalidProduct;
      const validate = Product["~standard"].validate;
      let result: ReturnType<typeof validate> | undefined;
      return {
        run: () => {
          result = validate(value);
        },
        verify: () => {
          assert(result && !(result instanceof Promise));
          if (name === "standardValid") {
            strictEqual("value" in result && result.value, validProduct);
          } else {
            deepStrictEqual(
              result.issues?.map(({ path, message }) => ({ path, message })),
              invalidProductIssues,
            );
          }
          verifyProduct(Product);
        },
      };
    }
  }
};

const verifyProduct = (Product: ProductType): void => {
  strictEqual(Product.is(validProduct), true);
  strictEqual(Product.is(invalidProduct), false);
  strictEqual(Product.is(deepInvalidProduct), false);

  const valid = Product.fromUnknown(validProduct);
  strictEqual(valid.ok && valid.value, validProduct);
  for (const [value, errors, expectedIssues] of [
    [invalidProduct, "first", invalidProductIssues.slice(0, 1)],
    [invalidProduct, "all", invalidProductIssues],
    [deepInvalidProduct, "first", deepInvalidProductIssues],
    [deepInvalidProduct, "all", deepInvalidProductIssues],
  ] as const) {
    const result = Product.fromUnknown(value, { errors });
    assert(!result.ok);
    deepStrictEqual(typeErrorToIssues(Product, result.error), expectedIssues);
  }

  const validate = Product["~standard"].validate;
  const standardValid = validate(validProduct);
  assert(!(standardValid instanceof Promise));
  strictEqual("value" in standardValid && standardValid.value, validProduct);
  for (const [value, expectedIssues] of [
    [invalidProduct, invalidProductIssues],
    [deepInvalidProduct, deepInvalidProductIssues],
  ] as const) {
    const result = validate(value);
    assert(!(result instanceof Promise));
    deepStrictEqual(
      result.issues?.map(({ path, message }) => ({ path, message })),
      expectedIssues,
    );
  }
};

/*
 * The Product schema and data of schemabenchmarks.dev, adapted from
 * https://github.com/open-circle/schema-benchmarks/blob/f8dff47750d26244613d55725b0dc618f2f443d6/schemas/src/data.ts
 * Dates are fixed so the data is deterministic.
 *
 * MIT License
 *
 * Copyright (c) 2026 Open Circle
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

interface UrlError extends TypeError<"Url"> {
  readonly value: string;
}

// Like the other libraries on schemabenchmarks.dev, every field creates its
// own Types.
const createProduct = () => {
  // Evolu has no URL Type, so a brand checks it.
  const Url = brand(
    "Url",
    String,
    (value) =>
      URL.canParse(value) ? ok() : err<UrlError>({ type: "Url", value }),
    (error) => `The value ${error.value} is not a valid URL.`,
  );
  const Image = object({
    id: Number,
    created: Date,
    title: maxLength(100)(minLength(1)(String)),
    type: union("jpg", "png"),
    size: Number,
    url: Url,
  });
  const Rating = object({
    id: Number,
    stars: between(1, 5)(Number),
    title: maxLength(100)(minLength(1)(String)),
    text: maxLength(1000)(minLength(1)(String)),
    images: array(Image),
  });
  return object({
    id: Number,
    created: Date,
    title: maxLength(100)(minLength(1)(String)),
    brand: maxLength(30)(minLength(1)(String)),
    description: maxLength(500)(minLength(1)(String)),
    price: between(1, 10000)(Number),
    discount: nullOr(between(1, 100)(Number)),
    quantity: between(0, 10)(Number),
    tags: array(maxLength(30)(minLength(1)(String))),
    images: array(Image),
    ratings: array(Rating),
  });
};

type ProductType = ReturnType<typeof createProduct>;

const created = new globalThis.Date("2026-01-01T00:00:00.000Z");

const validProduct = {
  id: 252,
  created,
  title: "Apple",
  brand: "Sunny Backyard",
  description: "Red apple from Lake Constance",
  price: 89,
  discount: null,
  quantity: 5,
  tags: ["fruit", "red", "round", "sweet", "juicy", "healthy"],
  images: [
    {
      id: 248,
      created,
      title: "Close up of an apple on a tree",
      type: "jpg",
      size: 92357232,
      url: "https://www.example.com/images/248",
    },
    {
      id: 295,
      created,
      title: "Our apples in the final packaging",
      type: "jpg",
      size: 83247232,
      url: "https://www.example.com/images/295",
    },
    {
      id: 723,
      created,
      title: "Our fruit fields at Lake Constance",
      type: "jpg",
      size: 72356345,
      url: "https://www.example.com/images/723",
    },
  ],
  ratings: [
    {
      id: 315,
      stars: 4.5,
      title: "Tastes super delicious",
      text: "Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget dolor.",
      images: [
        {
          id: 835,
          created,
          title: "The result of our apple pie",
          type: "jpg",
          size: 8247493,
          url: "https://www.example.com/images/835",
        },
      ],
    },
    {
      id: 642,
      stars: 5,
      title: "Very tasty! I will buy them again!",
      text: "In enim justo, rhoncus ut, imperdiet a, venenatis vitae, justo. Nullam dictum felis eu pede mollis pretium. Integer tincidunt.",
      images: [
        {
          id: 352,
          created,
          title: "The fruit salad in a bowl",
          type: "jpg",
          size: 3582543,
          url: "https://www.example.com/images/352",
        },
        {
          id: 465,
          created,
          title: "The fruit salad on a plate",
          type: "jpg",
          size: 9824742,
          url: "https://www.example.com/images/465",
        },
      ],
    },
  ],
};

const invalidProduct: unknown = {
  id: 252,
  created,
  title: "",
  brand: "Sunny Backyard",
  description: "Red apple from Lake Constance",
  price: 0,
  discount: null,
  quantity: 1000,
  tags: ["fruit", null, "round", undefined, "juicy", "healthy"],
  images: [
    {
      created: null,
      title: "Close up of an apple on a tree",
      type: "mp4",
      size: 92357232,
      url: "https://www.example.com/images/248",
    },
    {
      id: 295,
      created,
      title: "Our apples in the final packaging",
      type: "jpg",
      size: 83247232,
    },
    {
      id: 723,
      created,
      title: "Our fruit fields at Lake Constance",
      type: "jpg",
      size: 72356345,
      url: "https://www.example.com/images/723",
    },
  ],
  ratings: [
    {
      id: 315,
      stars: 4.5,
      title:
        "Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget dolor.",
      text: "Tastes super delicious",
      images: [
        {
          id: 835,
          created,
          title: "The result of our apple pie",
          type: "jpg",
          size: 8247493,
          url: "https://www.example.com/images/835",
        },
      ],
    },
    {
      id: 642,
      stars: 5,
      title: "Very tasty! I will buy them again!",
      text: "In enim justo, rhoncus ut, imperdiet a, venenatis vitae, justo. Nullam dictum felis eu pede mollis pretium. Integer tincidunt.",
      images: [
        {
          id: "abc",
          created: undefined,
          title: "The fruit salad in a bowl",
          type: "jpg",
          size: 3582543,
          url: "INVALID_URL",
        },
        {
          id: 465,
          created,
          url: "https://www.example.com/images/465",
        },
      ],
    },
  ],
};

// The invalid Product has these 15 faults. The swapped title and text of its
// first rating both stay within their length limits.
const invalidProductIssues = [
  {
    path: ["title"],
    message: 'The value "" does not meet the minimum length of 1.',
  },
  {
    path: ["price"],
    message: "The value 0 must be between 1 and 10000, inclusive.",
  },
  {
    path: ["quantity"],
    message: "The value 1000 must be between 0 and 10, inclusive.",
  },
  { path: ["tags", 1], message: "A value null is not a string." },
  { path: ["tags", 3], message: "A value undefined is not a string." },
  {
    path: ["images", 0, "id"],
    message: 'The required property "id" is missing.',
  },
  {
    path: ["images", 0, "created"],
    message: 'A value null does not have the expected object tag "Date".',
  },
  {
    path: ["images", 0, "type"],
    message:
      'A value does not match any allowed variant.\n- 0: Literal: The value "mp4" is not strictly equal to the expected literal: jpg.\n- 1: Literal: The value "mp4" is not strictly equal to the expected literal: png.',
  },
  {
    path: ["images", 1, "url"],
    message: 'The required property "url" is missing.',
  },
  {
    path: ["ratings", 1, "images", 0, "id"],
    message: 'A value "abc" is not a number.',
  },
  {
    path: ["ratings", 1, "images", 0, "created"],
    message: 'A value undefined does not have the expected object tag "Date".',
  },
  {
    path: ["ratings", 1, "images", 0, "url"],
    message: "The value INVALID_URL is not a valid URL.",
  },
  {
    path: ["ratings", 1, "images", 1, "title"],
    message: 'The required property "title" is missing.',
  },
  {
    path: ["ratings", 1, "images", 1, "type"],
    message: 'The required property "type" is missing.',
  },
  {
    path: ["ratings", 1, "images", 1, "size"],
    message: 'The required property "size" is missing.',
  },
];

// Only the last element of the deepest array is invalid, so validation must
// visit every element to find it.
const deepInvalidProduct: unknown = {
  ...validProduct,
  ratings: [
    validProduct.ratings[0],
    {
      ...validProduct.ratings[1],
      images: [
        validProduct.ratings[1].images[0],
        { ...validProduct.ratings[1].images[1], url: "INVALID_URL" },
      ],
    },
  ],
};

const deepInvalidProductIssues = [
  {
    path: ["ratings", 1, "images", 1, "url"],
    message: "The value INVALID_URL is not a valid URL.",
  },
];
