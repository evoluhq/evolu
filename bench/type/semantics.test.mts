import { expectTypeOf, test } from "vitest";
import type { Brand } from "../../packages/common/src/Brand.ts";
import type { InferErr, InferOk } from "../../packages/common/src/Result.ts";
import type {
  Errors as ArrayErrors,
  From32Input as ArrayDeepestFromInput,
  From32Result as ArrayDeepestFromResult,
  FromInput as ArraySelfFromInput,
  FromResult as ArraySelfFromResult,
  FromUnknownInput as ArrayFromUnknownInput,
  FromUnknownResult as ArrayFromUnknownResult,
  Output as ArrayOutput,
} from "./fixtures/array-all-32.mts";
import type {
  Errors as SemanticArrayErrors,
  From32Input as SemanticArrayDeepestFromInput,
  From32Result as SemanticArrayDeepestFromResult,
  FromResult as SemanticArrayFromResult,
  Output as SemanticArrayOutput,
} from "./fixtures/array-semantic-all-32.mts";
import type {
  Errors as SetErrors,
  From32Input as SetDeepestFromInput,
  From32Result as SetDeepestFromResult,
  FromInput as SetSelfFromInput,
  FromResult as SetSelfFromResult,
  FromUnknownInput as SetFromUnknownInput,
  FromUnknownResult as SetFromUnknownResult,
  Output as SetOutput,
} from "./fixtures/set-all-32.mts";
import type {
  Errors as SemanticSetErrors,
  From32Input as SemanticSetDeepestFromInput,
  From32Result as SemanticSetDeepestFromResult,
  FromResult as SemanticSetFromResult,
  Output as SemanticSetOutput,
} from "./fixtures/set-semantic-all-32.mts";
import type {
  Errors as ArrayChildErrors,
  From1Result as ArrayChildFrom1Result,
  From2Input as ArrayChildFrom2Input,
  From2Result as ArrayChildFrom2Result,
  From3Result as ArrayChildFrom3Result,
  From5Input as ArrayChildFrom5Input,
  From5Result as ArrayChildFrom5Result,
  From6Input as ArrayChildFrom6Input,
  From6Result as ArrayChildFrom6Result,
  FromResult as ArrayChildFromResult,
  FromUnknownResult as ArrayChildFromUnknownResult,
  Input as ArrayChildInput,
  Output as ArrayChildOutput,
  ToInput as ArrayChildToInput,
  ToResult as ArrayChildToResult,
} from "./fixtures/array-child-all.mts";
import type {
  DeepestFromResult as DirectBrandDeepestFromResult,
  DirectError,
  Errors as DirectBrandErrors,
  FromParentInput as DirectBrandFromParentInput,
  FromParentResult as DirectBrandFromParentResult,
  FromResult as DirectBrandFromResult,
  Output as DirectBrandOutput,
} from "./fixtures/brand-direct-all.mts";
import type {
  DeepestFromResult as BrandFactoryDeepestFromResult,
  Errors as BrandFactoryErrors,
  Factory as InferredBrandFactory,
  FromParentInput as BrandFactoryFromParentInput,
  FromParentResult as BrandFactoryFromParentResult,
  FromResult as BrandFactoryFromResult,
  Output as BrandFactoryOutput,
  ReusableError,
} from "./fixtures/brand-factory-all.mts";
import type {
  AgeErrors,
  AgeFromNumberResult,
  AgeFromPositiveIntInput,
  AgeFromPositiveIntResult,
  AgeFromResult,
  AgeOutput,
  LabelErrors,
  LabelFromStringResult,
  LabelFromResult,
  LabelFromTrimmedInput,
  LabelFromTrimmedResult,
  LabelOutput,
  PositiveIntOutput,
  TrimmedStringOutput,
} from "./fixtures/constraints-all.mts";
import type {
  ArrayElementsError,
  ArrayError,
  BrandFactory,
  DiscriminatedUnionError,
  DiscriminatedUnionMemberError,
  DiscriminatedUnionMemberIssue,
  FiniteError,
  InferErrors,
  IntError,
  LiteralError,
  LessThanOrEqualToError,
  MaxLengthError,
  MinLengthError,
  NonNegativeError,
  NonNaNError,
  ObjectError,
  ObjectPropertyAccessError,
  ObjectMissingPropertyError,
  ObjectPropertiesError,
  RecordCollisionIssue,
  RecordEntriesError,
  RecordError,
  SetElementsError,
  SetError,
  TransformError,
  TrimmedError,
  TypeOfError,
  UnionError,
  UnionMemberError,
} from "./fixtures/chains/api.mts";
import type {
  Errors as DeclarationErrors,
  From32Input as DeclarationDeepestFromInput,
  From32Result as DeclarationDeepestFromResult,
  FromInput as DeclarationSelfFromInput,
  FromResult as DeclarationSelfFromResult,
  Output as DeclarationOutput,
} from "./fixtures/declaration-all-32.mts";
import type {
  FromInput as SelfFromInput,
  FromResult as SelfFromResult,
} from "./fixtures/factory-all-32.mts";
import type {
  DeepestFromInput,
  DeepestFromResult,
} from "./fixtures/factory-deepest-32.mts";
import type { Errors } from "./fixtures/factory-errors-32.mts";
import type {
  FromUnknownInput,
  FromUnknownResult,
} from "./fixtures/factory-from-unknown-32.mts";
import type {
  OrNullInput,
  OrNullOutput,
} from "./fixtures/factory-or-null-32.mts";
import type {
  OrThrowInput,
  OrThrowOutput,
} from "./fixtures/factory-or-throw-32.mts";
import type { Output } from "./fixtures/factory-output-32.mts";
import type {
  Errors as SemanticErrors,
  From32Input as SemanticDeepestFromInput,
  From32Result as SemanticDeepestFromResult,
  FromResult as SemanticFromResult,
  Output as SemanticOutput,
} from "./fixtures/factory-semantic-all-32.mts";
import type {
  ArrayErrors as LiteralArrayErrors,
  ArrayFromParentResult as LiteralArrayFromParentResult,
  ArrayFromResult as LiteralArrayFromResult,
  ArrayOutput as LiteralArrayOutput,
  NumberErrors as LiteralNumberErrors,
  NumberFromParentResult as LiteralNumberFromParentResult,
  NumberFromResult as LiteralNumberFromResult,
  NumberOutput as LiteralNumberOutput,
  StringErrors as LiteralStringErrors,
  StringFromInput as LiteralStringFromInput,
  StringFromParentInput as LiteralStringFromParentInput,
  StringFromParentResult as LiteralStringFromParentResult,
  StringFromResult as LiteralStringFromResult,
  StringFromUnknownResult as LiteralStringFromUnknownResult,
  StringOutput as LiteralStringOutput,
} from "./fixtures/literal-all.mts";
import type {
  Errors as NestedArrayErrors,
  FromResult as NestedArrayFromResult,
  FromUnknownResult as NestedArrayFromUnknownResult,
  Output as NestedArrayOutput,
} from "./fixtures/nested-array-all-32.mts";
import type {
  Errors as NestedSetErrors,
  FromResult as NestedSetFromResult,
  FromUnknownResult as NestedSetFromUnknownResult,
  Output as NestedSetOutput,
} from "./fixtures/nested-set-all-32.mts";
import type {
  Errors as NestedObjectErrors,
  FromParentResult as NestedObjectFromParentResult,
  FromResult as NestedObjectFromResult,
  FromUnknownResult as NestedObjectFromUnknownResult,
  Input as NestedObjectInput,
  Output as NestedObjectOutput,
  Parent as NestedObjectParent,
  ToInput as NestedObjectToInput,
  ToResult as NestedObjectToResult,
} from "./fixtures/nested-object-all-32.mts";
import type {
  ElementErrors as ObjectArrayElementErrors,
  ElementNodeError as ObjectArrayElementNodeError,
  Errors as ObjectArrayErrors,
  FromResult as ObjectArrayFromResult,
  FromParentResult as ObjectArrayFromParentResult,
  FromUnknownResult as ObjectArrayFromUnknownResult,
  Input as ObjectArrayInput,
  NodeError as ObjectArrayNodeError,
  Output as ObjectArrayOutput,
  Parent as ObjectArrayParent,
  ToInput as ObjectArrayToInput,
  ToResult as ObjectArrayToResult,
} from "./fixtures/object-array-all.mts";
import type {
  Errors as ObjectErrors,
  FromParentResult as ObjectFromParentResult,
  FromResult as ObjectFromResult,
  FromUnknownResult as ObjectFromUnknownResult,
  Output as ObjectOutput,
} from "./fixtures/object-all-32.mts";
import type {
  Errors as RecordErrors,
  FromParentResult as RecordFromParentResult,
  FromResult as RecordFromResult,
  FromUnknownResult as RecordFromUnknownResult,
  Input as RecordInput,
  NodeError as RecordNodeError,
  Output as RecordOutput,
  Parent as RecordParent,
  ToResult as RecordToResult,
} from "./fixtures/record-all-32.mts";
import type {
  Errors as ObjectRecordErrors,
  FromParentResult as ObjectRecordFromParentResult,
  FromResult as ObjectRecordFromResult,
  FromUnknownResult as ObjectRecordFromUnknownResult,
  Input as ObjectRecordInput,
  NodeError as ObjectRecordNodeError,
  Output as ObjectRecordOutput,
  Parent as ObjectRecordParent,
  RecordType as ObjectRecordRecordType,
  ToInput as ObjectRecordToInput,
  ToResult as ObjectRecordToResult,
} from "./fixtures/object-record-all.mts";
import type {
  Errors as RecordTransformErrors,
  FromParentResult as RecordTransformFromParentResult,
  FromResult as RecordTransformFromResult,
  FromUnknownResult as RecordTransformFromUnknownResult,
  ImportedErrors as RecordTransformImportedErrors,
  ImportedFrom2Result as RecordTransformImportedFrom2Result,
  ImportedFromParentResult as RecordTransformImportedFromParentResult,
  ImportedFromResult as RecordTransformImportedFromResult,
  Input as RecordTransformInput,
  LowercaseKey as RecordTransformLowercaseKey,
  LowercaseKeyError as RecordTransformLowercaseKeyError,
  NodeError as RecordTransformNodeError,
  Output as RecordTransformOutput,
  Parent as RecordTransformParent,
  ToResult as RecordTransformToResult,
} from "./fixtures/record-transform-all.mts";
import type {
  CountError as ObjectChildCountError,
  Errors as ObjectChildErrors,
  From1Result as ObjectChildFrom1Result,
  From2Result as ObjectChildFrom2Result,
  From3Result as ObjectChildFrom3Result,
  FromResult as ObjectChildFromResult,
  FromUnknownResult as ObjectChildFromUnknownResult,
  ImportedError as ObjectChildImportedError,
  Input as ObjectChildInput,
  Model as ObjectChildModel,
  NodeError as ObjectChildNodeError,
  NonEmptyError as ObjectChildNonEmptyError,
  Output as ObjectChildOutput,
  ShortError as ObjectChildShortError,
  ToInput as ObjectChildToInput,
  ToResult as ObjectChildToResult,
} from "./fixtures/object-child-all.mts";
import type {
  EncodedModelErrors as ObjectTransformEncodedErrors,
  EncodedModelNodeError as ObjectTransformEncodedNodeError,
  Errors as ObjectTransformErrors,
  From1Result as ObjectTransformFrom1Result,
  From2Result as ObjectTransformFrom2Result,
  FromResult as ObjectTransformFromResult,
  FromUnknownResult as ObjectTransformFromUnknownResult,
  Input as ObjectTransformInput,
  NodeError as ObjectTransformNodeError,
  Output as ObjectTransformOutput,
  OutputModelErrors as ObjectTransformOutputErrors,
  OutputModelNodeError as ObjectTransformOutputNodeError,
  ToInput as ObjectTransformToInput,
  ToResult as ObjectTransformToResult,
} from "./fixtures/object-transform-all.mts";
import type {
  Errors as ObjectUnionErrors,
  FromParentResult as ObjectUnionFromParentResult,
  FromResult as ObjectUnionFromResult,
  FromUnknownResult as ObjectUnionFromUnknownResult,
  Input as ObjectUnionInput,
  Members as ObjectUnionMembers,
  Output as ObjectUnionOutput,
  Parent as ObjectUnionParent,
  ToInput as ObjectUnionToInput,
  ToResult as ObjectUnionToResult,
} from "./fixtures/object-union-all-32.mts";
import type {
  Errors as DiscriminatedUnionErrors,
  FromInput as DiscriminatedUnionFromInput,
  FromResult as DiscriminatedUnionFromResult,
  FromParentInput as DiscriminatedUnionFromParentInput,
  FromParentResult as DiscriminatedUnionFromParentResult,
  FromUnknownInput as DiscriminatedUnionFromUnknownInput,
  FromUnknownResult as DiscriminatedUnionFromUnknownResult,
  Input as DiscriminatedUnionInput,
  Key as DiscriminatedUnionKey,
  Members as DiscriminatedUnionMembers,
  NodeError as DiscriminatedUnionNodeError,
  Output as DiscriminatedUnionOutput,
  Parent as DiscriminatedUnionParent,
  ToInput as DiscriminatedUnionToInput,
  ToResult as DiscriminatedUnionToResult,
} from "./fixtures/discriminated-union-all-32.mts";
import type {
  Errors as WideObjectErrors,
  FromParentResult as WideObjectFromParentResult,
  FromResult as WideObjectFromResult,
  Output as WideObjectOutput,
} from "./fixtures/object-width-all-32.mts";
import type {
  Errors as UnionErrors,
  FromInput as UnionFromInput,
  FromResult as UnionFromResult,
  FromParentInput as UnionFromParentInput,
  FromParentResult as UnionFromParentResult,
  FromUnknownInput as UnionFromUnknownInput,
  FromUnknownResult as UnionFromUnknownResult,
  Members as UnionMembers,
  Output as UnionOutput,
  Parent as UnionParent,
} from "./fixtures/union-all-32.mts";
import type {
  Errors as LiteralUnionErrors,
  FromInput as LiteralUnionFromInput,
  FromResult as LiteralUnionFromResult,
  FromParentInput as LiteralUnionFromParentInput,
  FromParentResult as LiteralUnionFromParentResult,
  FromUnknownInput as LiteralUnionFromUnknownInput,
  FromUnknownResult as LiteralUnionFromUnknownResult,
  Members as LiteralUnionMembers,
  Output as LiteralUnionOutput,
  Parent as LiteralUnionParent,
} from "./fixtures/literal-union-all-32.mts";
import type {
  Errors as MixedUnionErrors,
  FromInput as MixedUnionFromInput,
  FromResult as MixedUnionFromResult,
  FromParentInput as MixedUnionFromParentInput,
  FromParentResult as MixedUnionFromParentResult,
  FromUnknownInput as MixedUnionFromUnknownInput,
  FromUnknownResult as MixedUnionFromUnknownResult,
  Members as MixedUnionMembers,
  Output as MixedUnionOutput,
  Parent as MixedUnionParent,
} from "./fixtures/mixed-union-all-32.mts";
import type {
  Errors as UnionArrayErrors,
  FromParentResult as UnionArrayFromParentResult,
  FromResult as UnionArrayFromResult,
  FromUnknownResult as UnionArrayFromUnknownResult,
  Output as UnionArrayOutput,
  Parent as UnionArrayParent,
} from "./fixtures/union-array-all.mts";
import type {
  Errors as TransformErrors,
  From3Result as TransformFrom3Result,
  From4Result as TransformFrom4Result,
  FromResult as TransformFromResult,
  Input as TransformInput,
  Output as TransformOutput,
  ToResult as TransformToResult,
} from "./fixtures/transform-all.mts";
import type {
  Errors as TransformObjectErrors,
  FromParentResult as TransformObjectFromParentResult,
  FromResult as TransformObjectFromResult,
  FromUnknownResult as TransformObjectFromUnknownResult,
  Input as TransformObjectInput,
  NodeError as TransformObjectNodeError,
  Output as TransformObjectOutput,
  Parent as TransformObjectParent,
  ToInput as TransformObjectToInput,
  ToResult as TransformObjectToResult,
} from "./fixtures/transform-object-all.mts";
import type {
  Errors as TypedErrors,
  FromInput as TypedFromInput,
  FromParentInput as TypedFromParentInput,
  FromParentResult as TypedFromParentResult,
  FromResult as TypedFromResult,
  FromUnknownInput as TypedFromUnknownInput,
  FromUnknownResult as TypedFromUnknownResult,
  Input as TypedInput,
  NodeError as TypedNodeError,
  Output as TypedOutput,
  Parent as TypedParent,
  Props as TypedProps,
  ToInput as TypedToInput,
  ToResult as TypedToResult,
} from "./fixtures/typed-all.mts";
import type {
  Errors as UnionObjectErrors,
  FromParentResult as UnionObjectFromParentResult,
  FromResult as UnionObjectFromResult,
  FromUnknownResult as UnionObjectFromUnknownResult,
  Input as UnionObjectInput,
  NodeError as UnionObjectNodeError,
  Output as UnionObjectOutput,
  Parent as UnionObjectParent,
  ToInput as UnionObjectToInput,
  ToResult as UnionObjectToResult,
} from "./fixtures/union-object-all.mts";
import type {
  Declaration as LazyDirectDeclaration,
  Errors as LazyDirectErrors,
  FromInput as LazyDirectFromInput,
  FromResult as LazyDirectFromResult,
  FromParentInput as LazyDirectFromParentInput,
  FromParentResult as LazyDirectFromParentResult,
  FromUnknownInput as LazyDirectFromUnknownInput,
  FromUnknownResult as LazyDirectFromUnknownResult,
  Input as LazyDirectInput,
  InputError as LazyDirectInputError,
  NodeError as LazyDirectNodeError,
  Output as LazyDirectOutput,
  Parent as LazyDirectParent,
  ToInput as LazyDirectToInput,
  ToResult as LazyDirectToResult,
  TreeError as LazyDirectTreeError,
  TreeFromError as LazyDirectTreeFromError,
  TreeInput as LazyDirectTreeInput,
  TreeInputError as LazyDirectTreeInputError,
  TreeOutput as LazyDirectTreeOutput,
} from "./fixtures/lazy-direct-all.mts";
import type {
  Left as LazyMutualLeft,
  LeftDeclaration as LazyMutualLeftDeclaration,
  LeftError as LazyMutualLeftError,
  LeftErrors as LazyMutualLeftErrors,
  LeftFromResult as LazyMutualLeftFromResult,
  LeftFromParentResult as LazyMutualLeftFromParentResult,
  LeftFromUnknownResult as LazyMutualLeftFromUnknownResult,
  LeftInput as LazyMutualLeftInput,
  LeftInputError as LazyMutualLeftInputError,
  LeftNodeError as LazyMutualLeftNodeError,
  LeftOutput as LazyMutualLeftOutput,
  LeftParent as LazyMutualLeftParent,
  LeftToResult as LazyMutualLeftToResult,
  Right as LazyMutualRight,
  RightDeclaration as LazyMutualRightDeclaration,
  RightError as LazyMutualRightError,
  RightErrors as LazyMutualRightErrors,
  RightFromResult as LazyMutualRightFromResult,
  RightFromParentResult as LazyMutualRightFromParentResult,
  RightFromUnknownResult as LazyMutualRightFromUnknownResult,
  RightInput as LazyMutualRightInput,
  RightInputError as LazyMutualRightInputError,
  RightNodeError as LazyMutualRightNodeError,
  RightOutput as LazyMutualRightOutput,
  RightParent as LazyMutualRightParent,
  RightToResult as LazyMutualRightToResult,
} from "./fixtures/lazy-mutual-all.mts";
import type {
  CzechTree as LocalizedDirectCzechTree,
  CzechTreeError as LocalizedDirectCzechTreeError,
  EnglishTree as LocalizedDirectEnglishTree,
  Locales as LocalizedDirectLocales,
  Tree as LocalizedDirectTree,
  TreeError as LocalizedDirectTreeError,
} from "./fixtures/localize-lazy-direct-all.mts";
import type {
  CzechLeft as LocalizedMutualCzechLeft,
  CzechRight as LocalizedMutualCzechRight,
  EnglishLeft as LocalizedMutualEnglishLeft,
  EnglishRight as LocalizedMutualEnglishRight,
  Left as LocalizedMutualLeft,
  Locales as LocalizedMutualLocales,
  Right as LocalizedMutualRight,
} from "./fixtures/localize-lazy-mutual-all.mts";
import type {
  CanonicalInput as TemplateLiteralCanonicalInput,
  Output as TemplateLiteralOutput,
  Parts as TemplateLiteralParts,
} from "./fixtures/template-literal-canonical-input-16.mts";
import type { ArrayChild1Error } from "./fixtures/chains/array-child-01.mts";
import type { ValidatedValues } from "./fixtures/chains/array-child-root.mts";
import type {
  NumberFromStringError,
  PositiveError,
} from "./fixtures/chains/number-from-string.mts";

type PositiveIndex = Exclude<Index, 0>;

type ExpectedStrictObject<
  Required,
  Optional = Readonly<Record<never, never>>,
> = {
  readonly [Key in keyof Required]: Required[Key];
} & {
  readonly [Key in keyof Optional]?: Optional[Key];
};

type OptionalKeys<T> = {
  readonly [Key in keyof T]-?: {} extends Pick<T, Key> ? Key : never;
}[keyof T];

type Index =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29
  | 30
  | 31
  | 32;

type MissingOutputBrands = {
  readonly [I in PositiveIndex]: Output extends Brand<`B${I}`> ? never : I;
}[PositiveIndex];

type FromOutput = InferOk<DeepestFromResult>;

type MissingFromOutputBrands = {
  readonly [I in PositiveIndex]: FromOutput extends Brand<`B${I}`>
    ? never
    : I;
}[PositiveIndex];

type FromUnknownOutput = InferOk<FromUnknownResult>;

type MissingFromUnknownOutputBrands = {
  readonly [I in PositiveIndex]:
    FromUnknownOutput extends Brand<`B${I}`> ? never : I;
}[PositiveIndex];

type MissingSemanticOutputBrands = {
  readonly [I in PositiveIndex]:
    SemanticOutput extends Brand<`S${I}`> ? never : I;
}[PositiveIndex];

type ExpectedErrors = {
  readonly [I in Index]: {
    readonly type: I extends 0 ? "E0" : `B${I}`;
    readonly index: I;
    readonly value: I extends 0 ? unknown : string;
  };
}[Index];

type ExpectedFromErrors = Extract<
  ExpectedErrors,
  { readonly index: Exclude<Index, 0> }
>;

type Depth32 = readonly [
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
];

type NestedArray<Value, Depth extends ReadonlyArray<unknown>> =
  Depth extends readonly [unknown, ...infer Rest]
    ? ReadonlyArray<NestedArray<Value, Rest>>
    : Value;

type NestedArrayError<Error extends ArrayError | ExpectedErrors, Depth extends ReadonlyArray<unknown>> =
  Depth extends readonly [unknown, ...infer Rest]
    ? ArrayError<NestedArrayError<Error, Rest>>
    : Error;

type NestedSet<Value, Depth extends ReadonlyArray<unknown>> =
  Depth extends readonly [unknown, ...infer Rest]
    ? ReadonlySet<NestedSet<Value, Rest>>
    : Value;

type NestedSetError<
  Error extends SetError | ExpectedErrors,
  Depth extends ReadonlyArray<unknown>,
> = Depth extends readonly [unknown, ...infer Rest]
  ? SetError<NestedSetError<Error, Rest>>
  : Error;

type NestedObject<Value, Depth extends ReadonlyArray<unknown>> =
  Depth extends readonly [unknown, ...infer Rest]
    ? ExpectedStrictObject<{ readonly value: NestedObject<Value, Rest> }>
    : Value;

type NumberFromStringErrors =
  | TypeOfError<"String">
  | NumberFromStringError;

type UnionValue = `V${PositiveIndex}`;

type ExpectedUnionMemberErrors = {
  readonly [I in PositiveIndex]: LiteralError<`V${I}`>;
}[PositiveIndex];

type ExpectedCorrelatedUnionMemberErrors = {
  readonly [MemberIndex in keyof UnionMembers]: MemberIndex extends `${infer NumericIndex extends number}`
    ? UnionMemberError<
        InferErrors<UnionMembers[MemberIndex]>,
        NumericIndex
      >
    : never;
}[keyof UnionMembers];

type ExpectedCorrelatedObjectUnionMemberErrors = {
  readonly [MemberIndex in keyof ObjectUnionMembers]:
    MemberIndex extends `${infer NumericIndex extends number}`
      ? UnionMemberError<
          InferErrors<ObjectUnionMembers[MemberIndex]>,
          NumericIndex
        >
      : never;
}[keyof ObjectUnionMembers];

type ExpectedObjectUnionErrors = UnionError<
  InferErrors<ObjectUnionMembers[number]>,
  ExpectedCorrelatedObjectUnionMemberErrors
>;

type ExpectedUnionErrors = UnionError<
  TypeOfError<"String"> | ExpectedUnionMemberErrors,
  ExpectedCorrelatedUnionMemberErrors
>;

test("the depth-32 fixture preserves its semantics", () => {
  expectTypeOf<Output>().not.toBeAny();
  expectTypeOf<Output>().not.toBeNever();
  expectTypeOf<Output>().toExtend<string>();
  expectTypeOf<MissingOutputBrands>().toEqualTypeOf<never>();
  expectTypeOf<Errors>().toEqualTypeOf<ExpectedErrors>();
  expectTypeOf<SelfFromInput>().toEqualTypeOf<Output>();
  expectTypeOf<InferOk<SelfFromResult>>().toEqualTypeOf<Output>();
  expectTypeOf<InferErr<SelfFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<DeepestFromInput>().toEqualTypeOf<string>();
  expectTypeOf<DeepestFromInput>().not.toExtend<Brand<"B1">>();
  expectTypeOf<DeepestFromInput>().not.toExtend<Brand<"B2">>();
  expectTypeOf<FromOutput>().not.toBeAny();
  expectTypeOf<FromOutput>().not.toBeNever();
  expectTypeOf<FromOutput>().toExtend<string>();
  expectTypeOf<MissingFromOutputBrands>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<DeepestFromResult>>().toEqualTypeOf<
    ExpectedFromErrors
  >();
  expectTypeOf<DeclarationOutput>().toEqualTypeOf<Output>();
  expectTypeOf<DeclarationErrors>().toEqualTypeOf<Errors>();
  expectTypeOf<DeclarationSelfFromInput>().toEqualTypeOf<DeclarationOutput>();
  expectTypeOf<InferOk<DeclarationSelfFromResult>>().toEqualTypeOf<
    DeclarationOutput
  >();
  expectTypeOf<InferErr<DeclarationSelfFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<DeclarationDeepestFromInput>().toEqualTypeOf<DeepestFromInput>();
  expectTypeOf<DeclarationDeepestFromResult>().toEqualTypeOf<DeepestFromResult>();
  expectTypeOf<FromUnknownInput>().toEqualTypeOf<unknown>();
  expectTypeOf<FromUnknownOutput>().toEqualTypeOf<Output>();
  expectTypeOf<MissingFromUnknownOutputBrands>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<FromUnknownResult>>().toEqualTypeOf<ExpectedErrors>();
  expectTypeOf<OrThrowInput>().toEqualTypeOf<string>();
  expectTypeOf<OrThrowOutput>().toEqualTypeOf<Output>();
  expectTypeOf<OrNullInput>().toEqualTypeOf<string>();
  expectTypeOf<OrNullOutput>().toEqualTypeOf<Output | null>();
  expectTypeOf<SemanticOutput>().not.toBeAny();
  expectTypeOf<SemanticOutput>().not.toBeNever();
  expectTypeOf<SemanticOutput>().toExtend<string>();
  expectTypeOf<MissingSemanticOutputBrands>().toEqualTypeOf<never>();
  expectTypeOf<SemanticErrors>().toEqualTypeOf<
    Extract<ExpectedErrors, { readonly type: "E0" }>
  >();
  expectTypeOf<InferOk<SemanticFromResult>>().toEqualTypeOf<SemanticOutput>();
  expectTypeOf<InferErr<SemanticFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<SemanticDeepestFromInput>().toEqualTypeOf<string>();
  expectTypeOf<InferOk<SemanticDeepestFromResult>>().toEqualTypeOf<
    SemanticOutput
  >();
  expectTypeOf<InferErr<SemanticDeepestFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<ArrayOutput>().toEqualTypeOf<ReadonlyArray<Output>>();
  expectTypeOf<ArrayErrors>().toEqualTypeOf<ArrayError<ExpectedErrors>>();
  expectTypeOf<ArrayFromUnknownInput>().toEqualTypeOf<unknown>();
  expectTypeOf<InferOk<ArrayFromUnknownResult>>().toEqualTypeOf<ArrayOutput>();
  expectTypeOf<InferErr<ArrayFromUnknownResult>>().toEqualTypeOf<
    ArrayError<ExpectedErrors>
  >();
  expectTypeOf<ArraySelfFromInput>().toEqualTypeOf<ArrayOutput>();
  expectTypeOf<InferOk<ArraySelfFromResult>>().toEqualTypeOf<ArrayOutput>();
  expectTypeOf<InferErr<ArraySelfFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<ArrayDeepestFromInput>().toEqualTypeOf<
    ReadonlyArray<DeepestFromInput>
  >();
  expectTypeOf<InferOk<ArrayDeepestFromResult>>().toEqualTypeOf<ArrayOutput>();
  expectTypeOf<InferErr<ArrayDeepestFromResult>>().toExtend<
    ArrayElementsError<ExpectedFromErrors>
  >();
  expectTypeOf<ArrayElementsError<ExpectedFromErrors>>().toExtend<
    InferErr<ArrayDeepestFromResult>
  >();
  expectTypeOf<SemanticArrayOutput>().toEqualTypeOf<
    ReadonlyArray<SemanticOutput>
  >();
  expectTypeOf<SemanticArrayErrors>().toEqualTypeOf<
    ArrayError<Extract<ExpectedErrors, { readonly type: "E0" }>>
  >();
  expectTypeOf<InferOk<SemanticArrayFromResult>>().toEqualTypeOf<
    SemanticArrayOutput
  >();
  expectTypeOf<InferErr<SemanticArrayFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<SemanticArrayDeepestFromInput>().toEqualTypeOf<
    ReadonlyArray<string>
  >();
  expectTypeOf<InferOk<SemanticArrayDeepestFromResult>>().toEqualTypeOf<
    SemanticArrayOutput
  >();
  expectTypeOf<InferErr<SemanticArrayDeepestFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<SetOutput>().toEqualTypeOf<ReadonlySet<Output>>();
  expectTypeOf<SetErrors>().toEqualTypeOf<SetError<ExpectedErrors>>();
  expectTypeOf<SetFromUnknownInput>().toEqualTypeOf<unknown>();
  expectTypeOf<InferOk<SetFromUnknownResult>>().toEqualTypeOf<SetOutput>();
  expectTypeOf<InferErr<SetFromUnknownResult>>().toEqualTypeOf<
    SetError<ExpectedErrors>
  >();
  expectTypeOf<SetSelfFromInput>().toEqualTypeOf<SetOutput>();
  expectTypeOf<InferOk<SetSelfFromResult>>().toEqualTypeOf<SetOutput>();
  expectTypeOf<InferErr<SetSelfFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<SetDeepestFromInput>().toEqualTypeOf<
    ReadonlySet<DeepestFromInput>
  >();
  expectTypeOf<InferOk<SetDeepestFromResult>>().toEqualTypeOf<SetOutput>();
  expectTypeOf<InferErr<SetDeepestFromResult>>().toEqualTypeOf<
    SetElementsError<ExpectedFromErrors>
  >();
  expectTypeOf<SemanticSetOutput>().toEqualTypeOf<ReadonlySet<SemanticOutput>>();
  expectTypeOf<SemanticSetErrors>().toEqualTypeOf<
    SetError<Extract<ExpectedErrors, { readonly type: "E0" }>>
  >();
  expectTypeOf<InferOk<SemanticSetFromResult>>().toEqualTypeOf<
    SemanticSetOutput
  >();
  expectTypeOf<InferErr<SemanticSetFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<SemanticSetDeepestFromInput>().toEqualTypeOf<
    ReadonlySet<string>
  >();
  expectTypeOf<InferOk<SemanticSetDeepestFromResult>>().toEqualTypeOf<
    SemanticSetOutput
  >();
  expectTypeOf<InferErr<SemanticSetDeepestFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<LiteralStringOutput>().toEqualTypeOf<"Hello">();
  expectTypeOf<LiteralStringErrors>().toEqualTypeOf<
    TypeOfError<"String"> | LiteralError<"Hello">
  >();
  expectTypeOf<LiteralStringFromInput>().toEqualTypeOf<"Hello">();
  expectTypeOf<InferOk<LiteralStringFromResult>>().toEqualTypeOf<"Hello">();
  expectTypeOf<InferErr<LiteralStringFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<LiteralStringFromParentInput>().toEqualTypeOf<string>();
  expectTypeOf<InferOk<LiteralStringFromParentResult>>().toEqualTypeOf<
    "Hello"
  >();
  expectTypeOf<InferErr<LiteralStringFromParentResult>>().toEqualTypeOf<
    LiteralError<"Hello">
  >();
  expectTypeOf<InferOk<LiteralStringFromUnknownResult>>().toEqualTypeOf<
    "Hello"
  >();
  expectTypeOf<InferErr<LiteralStringFromUnknownResult>>().toEqualTypeOf<
    TypeOfError<"String"> | LiteralError<"Hello">
  >();
  expectTypeOf<LiteralNumberOutput>().toEqualTypeOf<42>();
  expectTypeOf<LiteralNumberErrors>().toEqualTypeOf<
    TypeOfError<"Number"> | LiteralError<42>
  >();
  expectTypeOf<InferOk<LiteralNumberFromResult>>().toEqualTypeOf<42>();
  expectTypeOf<InferErr<LiteralNumberFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<LiteralNumberFromParentResult>>().toEqualTypeOf<
    LiteralError<42>
  >();
  expectTypeOf<LiteralArrayOutput>().toEqualTypeOf<ReadonlyArray<"Hello">>();
  expectTypeOf<LiteralArrayErrors>().toEqualTypeOf<
    ArrayError<TypeOfError<"String"> | LiteralError<"Hello">>
  >();
  expectTypeOf<InferOk<LiteralArrayFromResult>>().toEqualTypeOf<
    LiteralArrayOutput
  >();
  expectTypeOf<InferErr<LiteralArrayFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<LiteralArrayFromParentResult>>().toEqualTypeOf<
    ArrayElementsError<LiteralError<"Hello">>
  >();
  expectTypeOf<NestedArrayOutput>().toEqualTypeOf<
    NestedArray<string, Depth32>
  >();
  expectTypeOf<NestedArrayErrors>().toEqualTypeOf<
    NestedArrayError<Extract<ExpectedErrors, { readonly type: "E0" }>, Depth32>
  >();
  expectTypeOf<InferOk<NestedArrayFromUnknownResult>>().toEqualTypeOf<
    NestedArrayOutput
  >();
  expectTypeOf<InferErr<NestedArrayFromUnknownResult>>().toEqualTypeOf<
    NestedArrayErrors
  >();
  expectTypeOf<InferOk<NestedArrayFromResult>>().toEqualTypeOf<
    NestedArrayOutput
  >();
  expectTypeOf<InferErr<NestedArrayFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<NestedSetOutput>().toEqualTypeOf<NestedSet<string, Depth32>>();
  expectTypeOf<NestedSetErrors>().toEqualTypeOf<
    NestedSetError<Extract<ExpectedErrors, { readonly type: "E0" }>, Depth32>
  >();
  expectTypeOf<InferOk<NestedSetFromUnknownResult>>().toEqualTypeOf<
    NestedSetOutput
  >();
  expectTypeOf<InferErr<NestedSetFromUnknownResult>>().toEqualTypeOf<
    NestedSetErrors
  >();
  expectTypeOf<InferOk<NestedSetFromResult>>().toEqualTypeOf<NestedSetOutput>();
  expectTypeOf<InferErr<NestedSetFromResult>>().toEqualTypeOf<never>();
});

test("the reusable Brand Factory preserves its parent and boundaries", () => {
  expectTypeOf<InferredBrandFactory>().toEqualTypeOf<
    BrandFactory<"Reusable", string, ReusableError>
  >();
  expectTypeOf<BrandFactoryOutput>().toEqualTypeOf<
    Output & Brand<"Reusable">
  >();
  expectTypeOf<BrandFactoryErrors>().toEqualTypeOf<
    Errors | ReusableError
  >();
  expectTypeOf<InferOk<BrandFactoryFromResult>>().toEqualTypeOf<
    BrandFactoryOutput
  >();
  expectTypeOf<InferErr<BrandFactoryFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<BrandFactoryDeepestFromResult>>().toEqualTypeOf<
    Exclude<ExpectedErrors, { readonly index: 0 }> | ReusableError
  >();
  expectTypeOf<BrandFactoryFromParentInput>().toEqualTypeOf<Output>();
  expectTypeOf<InferOk<BrandFactoryFromParentResult>>().toEqualTypeOf<
    BrandFactoryOutput
  >();
  expectTypeOf<InferErr<BrandFactoryFromParentResult>>().toEqualTypeOf<
    ReusableError
  >();
  expectTypeOf<DirectBrandOutput>().toEqualTypeOf<Output & Brand<"Direct">>();
  expectTypeOf<DirectBrandErrors>().toEqualTypeOf<Errors | DirectError>();
  expectTypeOf<InferOk<DirectBrandFromResult>>().toEqualTypeOf<
    DirectBrandOutput
  >();
  expectTypeOf<InferErr<DirectBrandFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<DirectBrandDeepestFromResult>>().toEqualTypeOf<
    Exclude<ExpectedErrors, { readonly index: 0 }> | DirectError
  >();
  expectTypeOf<DirectBrandFromParentInput>().toEqualTypeOf<Output>();
  expectTypeOf<InferOk<DirectBrandFromParentResult>>().toEqualTypeOf<
    DirectBrandOutput
  >();
  expectTypeOf<InferErr<DirectBrandFromParentResult>>().toEqualTypeOf<
    DirectError
  >();
});

test("the constraint fixture preserves Label and Age boundaries", () => {
  expectTypeOf<LabelOutput>().toEqualTypeOf<
    string &
      Brand<"Trimmed"> &
      Brand<"MinLength1"> &
      Brand<"MaxLength50"> &
      Brand<"Label">
  >();
  expectTypeOf<LabelErrors>().toEqualTypeOf<
    | TypeOfError<"String">
    | TrimmedError
    | MinLengthError<1>
    | MaxLengthError<50>
  >();
  expectTypeOf<InferOk<LabelFromResult>>().toEqualTypeOf<LabelOutput>();
  expectTypeOf<InferErr<LabelFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<LabelFromStringResult>>().toEqualTypeOf<
    TrimmedError | MinLengthError<1> | MaxLengthError<50>
  >();
  expectTypeOf<LabelFromTrimmedInput>().toEqualTypeOf<TrimmedStringOutput>();
  expectTypeOf<InferOk<LabelFromTrimmedResult>>().toEqualTypeOf<LabelOutput>();
  expectTypeOf<InferErr<LabelFromTrimmedResult>>().toEqualTypeOf<
    MinLengthError<1> | MaxLengthError<50>
  >();

  expectTypeOf<AgeOutput>().toEqualTypeOf<
    number &
      Brand<"NonNaN"> &
      Brand<"Finite"> &
      Brand<"Int"> &
      Brand<"NonNegative"> &
      Brand<"Positive"> &
      Brand<"LessThanOrEqualTo99"> &
      Brand<"Age">
  >();
  expectTypeOf<AgeErrors>().toEqualTypeOf<
    | TypeOfError<"Number">
    | NonNaNError
    | FiniteError
    | IntError
    | NonNegativeError
    | PositiveError
    | LessThanOrEqualToError<99>
  >();
  expectTypeOf<InferOk<AgeFromResult>>().toEqualTypeOf<AgeOutput>();
  expectTypeOf<InferErr<AgeFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<AgeFromNumberResult>>().toEqualTypeOf<
    | NonNaNError
    | FiniteError
    | IntError
    | NonNegativeError
    | PositiveError
    | LessThanOrEqualToError<99>
  >();
  expectTypeOf<AgeFromPositiveIntInput>().toEqualTypeOf<PositiveIntOutput>();
  expectTypeOf<InferOk<AgeFromPositiveIntResult>>().toEqualTypeOf<AgeOutput>();
  expectTypeOf<InferErr<AgeFromPositiveIntResult>>().toEqualTypeOf<
    LessThanOrEqualToError<99>
  >();
});

test("the transformation fixture preserves decoding and encoding", () => {
  expectTypeOf<TransformInput>().toEqualTypeOf<string>();
  expectTypeOf<TransformOutput>().toEqualTypeOf<string>();
  expectTypeOf<TransformErrors>().not.toBeAny();
  expectTypeOf<TransformErrors>().not.toBeNever();
  expectTypeOf<InferOk<TransformFromResult>>().toEqualTypeOf<string>();
  expectTypeOf<InferErr<TransformFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferOk<TransformFrom3Result>>().toEqualTypeOf<string>();
  expectTypeOf<InferErr<TransformFrom3Result>>().not.toBeNever();
  expectTypeOf<InferOk<TransformFrom4Result>>().toEqualTypeOf<string>();
  expectTypeOf<InferErr<TransformFrom4Result>>().not.toBeNever();
  expectTypeOf<TransformToResult>().toEqualTypeOf<string>();
});

test("the width-32 Union fixture preserves its semantics", () => {
  expectTypeOf<UnionOutput>().toEqualTypeOf<UnionValue>();
  expectTypeOf<UnionErrors>().toEqualTypeOf<ExpectedUnionErrors>();
  expectTypeOf<
    Extract<UnionErrors["errors"][number], { readonly index: 0 }>["error"]
  >().toEqualTypeOf<TypeOfError<"String"> | LiteralError<"V1">>();
  expectTypeOf<
    Extract<UnionErrors["errors"][number], { readonly index: 31 }>["error"]
  >().toEqualTypeOf<TypeOfError<"String"> | LiteralError<"V32">>();
  expectTypeOf<UnionFromUnknownInput>().toEqualTypeOf<unknown>();
  expectTypeOf<InferOk<UnionFromUnknownResult>>().toEqualTypeOf<UnionOutput>();
  expectTypeOf<InferErr<UnionFromUnknownResult>>().toEqualTypeOf<UnionErrors>();
  expectTypeOf<UnionFromInput>().toEqualTypeOf<UnionOutput>();
  expectTypeOf<InferOk<UnionFromResult>>().toEqualTypeOf<UnionOutput>();
  expectTypeOf<InferErr<UnionFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<UnionFromParentInput>().toEqualTypeOf<string>();
  expectTypeOf<InferOk<UnionFromParentResult>>().toEqualTypeOf<UnionOutput>();
  expectTypeOf<InferErr<UnionFromParentResult>>().toEqualTypeOf<UnionErrors>();
  expectTypeOf<UnionMembers["length"]>().toEqualTypeOf<32>();
  expectTypeOf<UnionParent["name"]>().toEqualTypeOf<"Union">();
  expectTypeOf<LiteralUnionOutput>().toEqualTypeOf<UnionOutput>();
  expectTypeOf<LiteralUnionErrors>().toEqualTypeOf<UnionErrors>();
  expectTypeOf<LiteralUnionFromUnknownInput>().toEqualTypeOf<unknown>();
  expectTypeOf<
    InferOk<LiteralUnionFromUnknownResult>
  >().toEqualTypeOf<LiteralUnionOutput>();
  expectTypeOf<
    InferErr<LiteralUnionFromUnknownResult>
  >().toEqualTypeOf<LiteralUnionErrors>();
  expectTypeOf<LiteralUnionFromInput>().toEqualTypeOf<LiteralUnionOutput>();
  expectTypeOf<InferOk<LiteralUnionFromResult>>().toEqualTypeOf<
    LiteralUnionOutput
  >();
  expectTypeOf<InferErr<LiteralUnionFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<LiteralUnionFromParentInput>().toEqualTypeOf<string>();
  expectTypeOf<InferOk<LiteralUnionFromParentResult>>().toEqualTypeOf<
    LiteralUnionOutput
  >();
  expectTypeOf<InferErr<LiteralUnionFromParentResult>>().toEqualTypeOf<
    LiteralUnionErrors
  >();
  expectTypeOf<LiteralUnionMembers["length"]>().toEqualTypeOf<32>();
  expectTypeOf<LiteralUnionMembers[0]["expected"]>().toEqualTypeOf<"V1">();
  expectTypeOf<LiteralUnionMembers[31]["expected"]>().toEqualTypeOf<"V32">();
  expectTypeOf<LiteralUnionParent["name"]>().toEqualTypeOf<"Union">();
  expectTypeOf<MixedUnionOutput>().toEqualTypeOf<UnionOutput>();
  expectTypeOf<MixedUnionErrors>().toEqualTypeOf<UnionErrors>();
  expectTypeOf<MixedUnionFromUnknownInput>().toEqualTypeOf<unknown>();
  expectTypeOf<
    InferOk<MixedUnionFromUnknownResult>
  >().toEqualTypeOf<MixedUnionOutput>();
  expectTypeOf<
    InferErr<MixedUnionFromUnknownResult>
  >().toEqualTypeOf<MixedUnionErrors>();
  expectTypeOf<MixedUnionFromInput>().toEqualTypeOf<MixedUnionOutput>();
  expectTypeOf<InferOk<MixedUnionFromResult>>().toEqualTypeOf<
    MixedUnionOutput
  >();
  expectTypeOf<InferErr<MixedUnionFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<MixedUnionFromParentInput>().toEqualTypeOf<string>();
  expectTypeOf<InferOk<MixedUnionFromParentResult>>().toEqualTypeOf<
    MixedUnionOutput
  >();
  expectTypeOf<InferErr<MixedUnionFromParentResult>>().toEqualTypeOf<
    MixedUnionErrors
  >();
  expectTypeOf<MixedUnionMembers["length"]>().toEqualTypeOf<32>();
  expectTypeOf<MixedUnionMembers[0]["name"]>().toEqualTypeOf<"V1">();
  expectTypeOf<MixedUnionMembers[1]["name"]>().toEqualTypeOf<"Literal">();
  expectTypeOf<MixedUnionMembers[1]["expected"]>().toEqualTypeOf<"V2">();
  expectTypeOf<MixedUnionMembers[30]["name"]>().toEqualTypeOf<"V31">();
  expectTypeOf<MixedUnionMembers[31]["expected"]>().toEqualTypeOf<"V32">();
  expectTypeOf<MixedUnionParent["name"]>().toEqualTypeOf<"Union">();
  expectTypeOf<UnionArrayOutput>().toEqualTypeOf<ReadonlyArray<UnionOutput>>();
  expectTypeOf<UnionArrayErrors>().toEqualTypeOf<ArrayError<UnionErrors>>();
  expectTypeOf<InferOk<UnionArrayFromUnknownResult>>().toEqualTypeOf<
    UnionArrayOutput
  >();
  expectTypeOf<InferErr<UnionArrayFromUnknownResult>>().toEqualTypeOf<
    UnionArrayErrors
  >();
  expectTypeOf<InferOk<UnionArrayFromResult>>().toEqualTypeOf<
    UnionArrayOutput
  >();
  expectTypeOf<InferErr<UnionArrayFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<UnionArrayFromParentResult>>().toEqualTypeOf<
    ArrayElementsError<UnionErrors>
  >();
  expectTypeOf<UnionArrayParent["Output"]>().toEqualTypeOf<
    ReadonlyArray<string>
  >();
});

test("the 16-position TemplateLiteral fixture preserves its exact types", () => {
  expectTypeOf<TemplateLiteralParts["length"]>().toEqualTypeOf<16>();
  expectTypeOf<TemplateLiteralOutput["length"]>().toEqualTypeOf<16>();
  expectTypeOf<"0000000000000000">().toExtend<TemplateLiteralCanonicalInput>();
  expectTypeOf<"0101010101010101">().toExtend<TemplateLiteralCanonicalInput>();
  expectTypeOf<"1111111111111111">().toExtend<TemplateLiteralCanonicalInput>();
  expectTypeOf<string>().not.toExtend<TemplateLiteralCanonicalInput>();
});

test("the depth-32 Object fixture preserves its semantics", () => {
  expectTypeOf<"optional">().toExtend<OptionalKeys<ObjectOutput>>();
  expectTypeOf<"required">().not.toExtend<OptionalKeys<ObjectOutput>>();
  expectTypeOf<ObjectOutput["required"]>().toEqualTypeOf<Output>();
  expectTypeOf<ObjectOutput["optional"]>().toEqualTypeOf<
    Output | undefined
  >();
  type PropertiesReason = Extract<
    ObjectErrors["reason"],
    { readonly kind: "Properties" }
  >;
  type PropertyErrors = PropertiesReason["errors"];

  expectTypeOf<NonNullable<PropertyErrors["required"]>>().toEqualTypeOf<
    | ObjectMissingPropertyError
    | ObjectPropertyAccessError
    | ExpectedErrors
  >();
  expectTypeOf<NonNullable<PropertyErrors["optional"]>>().toEqualTypeOf<
    ObjectPropertyAccessError | ExpectedErrors
  >();
  expectTypeOf<InferOk<ObjectFromUnknownResult>>().toEqualTypeOf<ObjectOutput>();

  expectTypeOf<InferErr<ObjectFromResult>>().toEqualTypeOf<never>();

  type FromErrors = InferErr<ObjectFromParentResult>["reason"]["errors"];
  type ExpectedObjectFromErrors = Exclude<
    ExpectedErrors,
    { readonly index: 0 }
  >;

  expectTypeOf<NonNullable<FromErrors["required"]>>().toEqualTypeOf<
    ExpectedObjectFromErrors
  >();
  expectTypeOf<NonNullable<FromErrors["optional"]>>().toEqualTypeOf<
    ExpectedObjectFromErrors
  >();
});

test("the depth-32 Record fixture preserves normalized entry errors", () => {
  type ExpectedInput = Readonly<Partial<Record<string, string>>>;
  type ExpectedOutput = Readonly<Partial<Record<string, Output>>>;
  type ExpectedValueFromErrors = Exclude<
    ExpectedErrors,
    { readonly index: 0 }
  >;
  type ExpectedNodeError = RecordEntriesError<
    never,
    ExpectedValueFromErrors,
    never
  >;
  type ExpectedRecordErrors = RecordError<
    TypeOfError<"String">,
    ExpectedErrors,
    never
  >;

  expectTypeOf<RecordInput>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<RecordOutput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<RecordNodeError>().toEqualTypeOf<ExpectedNodeError>();
  expectTypeOf<RecordErrors>().toEqualTypeOf<ExpectedRecordErrors>();
  expectTypeOf<InferOk<RecordFromUnknownResult>>().toEqualTypeOf<
    ExpectedOutput
  >();
  expectTypeOf<InferErr<RecordFromUnknownResult>>().toEqualTypeOf<
    ExpectedRecordErrors
  >();
  expectTypeOf<InferOk<RecordFromResult>>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<InferErr<RecordFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<RecordFromParentResult>>().toEqualTypeOf<
    ExpectedNodeError
  >();
  expectTypeOf<RecordParent["Output"]>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<RecordParent["parent"]>().toEqualTypeOf<null>();
  expectTypeOf<RecordToResult>().toEqualTypeOf<ExpectedOutput>();
});

test("the Object Record fixture preserves declared and dynamic properties", () => {
  type ExpectedInput = {
    readonly total: string;
    readonly count?: string;
  } &
    Readonly<Partial<Record<string, string>>>;
  type ExpectedOutput = {
    readonly total: number;
    readonly count?: number;
  } &
    Readonly<Partial<Record<string, number>>>;
  type ExpectedNodeError = ObjectPropertiesError<
    {
      readonly total: NumberFromStringError;
      readonly count: NumberFromStringError;
    },
    RecordEntriesError<never, NumberFromStringError, never>
  >;
  type ExpectedObjectErrors = ObjectError<
    {
      readonly total: NumberFromStringErrors;
      readonly count?: NumberFromStringErrors;
    },
    RecordEntriesError<
      TypeOfError<"String">,
      NumberFromStringErrors,
      never
    >
  >;

  expectTypeOf<ObjectRecordInput>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<ObjectRecordOutput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<ObjectRecordNodeError>().toEqualTypeOf<ExpectedNodeError>();
  expectTypeOf<ObjectRecordErrors>().toEqualTypeOf<ExpectedObjectErrors>();
  expectTypeOf<InferOk<ObjectRecordFromUnknownResult>>().toEqualTypeOf<
    ExpectedOutput
  >();
  expectTypeOf<InferErr<ObjectRecordFromUnknownResult>>().toEqualTypeOf<
    ExpectedObjectErrors
  >();
  expectTypeOf<InferErr<ObjectRecordFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<ObjectRecordFromParentResult>>().toEqualTypeOf<
    ExpectedNodeError
  >();
  expectTypeOf<ObjectRecordParent["Output"]>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<ObjectRecordParent["parent"]>().toEqualTypeOf<null>();
  expectTypeOf<ObjectRecordRecordType["Output"]>().toEqualTypeOf<
    Readonly<Partial<Record<string, number>>>
  >();
  expectTypeOf<ObjectRecordToInput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<ObjectRecordToResult>().toEqualTypeOf<ExpectedInput>();
});

test("the transformed Record fixture preserves collisions and child errors", () => {
  type ExpectedInput = Readonly<Partial<Record<string, string>>>;
  type ExpectedOutput = Readonly<
    Partial<Record<RecordTransformLowercaseKey, number>>
  >;
  type ExpectedKeyNodeError = TransformError<
    "LowercaseFromString",
    never,
    RecordTransformLowercaseKeyError
  >;
  type ExpectedNodeError = RecordEntriesError<
    ExpectedKeyNodeError,
    NumberFromStringError,
    RecordCollisionIssue
  >;
  type ExpectedRecordErrors = RecordError<
    TypeOfError<"String"> | ExpectedKeyNodeError,
    NumberFromStringErrors,
    RecordCollisionIssue
  >;

  expectTypeOf<RecordTransformInput>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<RecordTransformOutput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<RecordTransformNodeError>().toEqualTypeOf<ExpectedNodeError>();
  expectTypeOf<RecordTransformErrors>().toEqualTypeOf<ExpectedRecordErrors>();
  expectTypeOf<InferErr<RecordTransformFromUnknownResult>>().toEqualTypeOf<
    ExpectedRecordErrors
  >();
  expectTypeOf<InferErr<RecordTransformFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<RecordTransformFromParentResult>>().toEqualTypeOf<
    ExpectedNodeError
  >();
  expectTypeOf<RecordTransformParent["Output"]>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<RecordTransformToResult>().toEqualTypeOf<
    Readonly<Partial<Record<RecordTransformLowercaseKey, string>>>
  >();
  expectTypeOf<RecordTransformImportedErrors>().toEqualTypeOf<
    ExpectedRecordErrors
  >();
  expectTypeOf<InferErr<RecordTransformImportedFromResult>>().toEqualTypeOf<
    never
  >();
  expectTypeOf<InferErr<RecordTransformImportedFrom2Result>>().toEqualTypeOf<
    ExpectedNodeError
  >();
  expectTypeOf<
    InferErr<RecordTransformImportedFromParentResult>
  >().toEqualTypeOf<never>();
});

test("the width-32 Object fixture preserves its semantics", () => {
  expectTypeOf<"optional01">().toExtend<OptionalKeys<WideObjectOutput>>();
  expectTypeOf<"optional16">().toExtend<OptionalKeys<WideObjectOutput>>();
  expectTypeOf<"required01">().not.toExtend<
    OptionalKeys<WideObjectOutput>
  >();
  expectTypeOf<"required16">().not.toExtend<
    OptionalKeys<WideObjectOutput>
  >();
  expectTypeOf<WideObjectOutput["required01"]>().toEqualTypeOf<
    string & Brand<"B1">
  >();
  expectTypeOf<WideObjectOutput["required16"]>().toEqualTypeOf<
    string & Brand<"B1">
  >();
  expectTypeOf<WideObjectOutput["optional01"]>().toEqualTypeOf<
    (string & Brand<"B1">) | undefined
  >();
  expectTypeOf<WideObjectOutput["optional16"]>().toEqualTypeOf<
    (string & Brand<"B1">) | undefined
  >();

  type PropertiesReason = Extract<
    WideObjectErrors["reason"],
    { readonly kind: "Properties" }
  >;
  type PropertyErrors = PropertiesReason["errors"];
  type RootAndB1Errors = Extract<ExpectedErrors, { readonly index: 0 | 1 }>;

  expectTypeOf<NonNullable<PropertyErrors["required01"]>>().toEqualTypeOf<
    | ObjectMissingPropertyError
    | ObjectPropertyAccessError
    | RootAndB1Errors
  >();
  expectTypeOf<NonNullable<PropertyErrors["required16"]>>().toEqualTypeOf<
    | ObjectMissingPropertyError
    | ObjectPropertyAccessError
    | RootAndB1Errors
  >();
  expectTypeOf<NonNullable<PropertyErrors["optional01"]>>().toEqualTypeOf<
    ObjectPropertyAccessError | RootAndB1Errors
  >();
  expectTypeOf<NonNullable<PropertyErrors["optional16"]>>().toEqualTypeOf<
    ObjectPropertyAccessError | RootAndB1Errors
  >();

  expectTypeOf<InferErr<WideObjectFromResult>>().toEqualTypeOf<never>();

  type FromErrors = InferErr<WideObjectFromParentResult>["reason"]["errors"];
  type B1Error = Extract<ExpectedErrors, { readonly index: 1 }>;

  expectTypeOf<NonNullable<FromErrors["required01"]>>().toEqualTypeOf<B1Error>();
  expectTypeOf<NonNullable<FromErrors["optional16"]>>().toEqualTypeOf<B1Error>();
});

test("the depth-32 nested Object fixture preserves its semantics", () => {
  type ExpectedInput = NestedObject<string, Depth32>;
  type ExpectedOutput = NestedObject<number, Depth32>;
  type OuterPropertiesReason = Extract<
    NestedObjectErrors["reason"],
    { readonly kind: "Properties" }
  >;
  type OuterPropertyError = NonNullable<
    OuterPropertiesReason["errors"]["value"]
  >;
  type OuterFromPropertyError = NonNullable<
    InferErr<NestedObjectFromParentResult>["reason"]["errors"]["value"]
  >;

  expectTypeOf<NestedObjectInput>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<NestedObjectOutput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<OuterPropertyError>().not.toBeAny();
  expectTypeOf<OuterPropertyError>().not.toBeNever();
  expectTypeOf<
    Extract<OuterPropertyError, ObjectMissingPropertyError>
  >().toEqualTypeOf<ObjectMissingPropertyError>();
  expectTypeOf<
    Extract<OuterPropertyError, ObjectPropertyAccessError>
  >().toEqualTypeOf<ObjectPropertyAccessError>();
  expectTypeOf<OuterFromPropertyError>().not.toBeAny();
  expectTypeOf<OuterFromPropertyError>().not.toBeNever();
  expectTypeOf<InferOk<NestedObjectFromUnknownResult>>().toEqualTypeOf<
    ExpectedOutput
  >();
  expectTypeOf<InferErr<NestedObjectFromUnknownResult>>().toEqualTypeOf<
    NestedObjectErrors
  >();
  expectTypeOf<InferOk<NestedObjectFromResult>>().toEqualTypeOf<
    ExpectedOutput
  >();
  expectTypeOf<InferErr<NestedObjectFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<NestedObjectToInput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<NestedObjectToResult>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<NestedObjectParent["Output"]>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<NestedObjectParent["parent"]>().toEqualTypeOf<null>();
});

test("the Array child fixture preserves specialized from operations", () => {
  type ElementErrors = Extract<ExpectedErrors, { readonly index: 0 | 1 | 2 | 3 | 4 }>;
  type ElementFromErrors = Extract<ElementErrors, { readonly index: 1 | 2 | 3 | 4 }>;

  expectTypeOf<ArrayChildInput>().toEqualTypeOf<ReadonlyArray<string>>();
  expectTypeOf<ArrayChildOutput>().toEqualTypeOf<
    typeof ValidatedValues.Output
  >();
  expectTypeOf<ArrayChildErrors>().toEqualTypeOf<
    ArrayChild1Error | ArrayError<ElementErrors>
  >();
  expectTypeOf<InferOk<ArrayChildFromUnknownResult>>().toEqualTypeOf<
    ArrayChildOutput
  >();
  expectTypeOf<InferErr<ArrayChildFromUnknownResult>>().toEqualTypeOf<
    ArrayChildErrors
  >();
  expectTypeOf<InferErr<ArrayChildFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<ArrayChildFrom6Result>>().toEqualTypeOf<
    ArrayChild1Error | ArrayElementsError<ElementFromErrors>
  >();
  expectTypeOf<InferErr<ArrayChildFrom1Result>>().toEqualTypeOf<never>();
  expectTypeOf<ArrayChildFrom2Input>().toEqualTypeOf<
    typeof ValidatedValues.Output
  >();
  expectTypeOf<InferErr<ArrayChildFrom2Result>>().toEqualTypeOf<
    ArrayChild1Error
  >();
  expectTypeOf<InferErr<ArrayChildFrom3Result>>().toEqualTypeOf<
    | ArrayChild1Error
    | ArrayElementsError<Extract<ElementErrors, { readonly index: 4 }>>
  >();
  expectTypeOf<ArrayChildFrom5Input>().toEqualTypeOf<
    ReadonlyArray<string & Brand<"B1">>
  >();
  expectTypeOf<InferErr<ArrayChildFrom5Result>>().toEqualTypeOf<
    | ArrayChild1Error
    | ArrayElementsError<
        Extract<ElementErrors, { readonly index: 2 | 3 | 4 }>
      >
  >();
  expectTypeOf<ArrayChildFrom6Input>().toEqualTypeOf<
    ArrayDeepestFromInput
  >();
  expectTypeOf<ArrayChildToInput>().toEqualTypeOf<ArrayChildOutput>();
  expectTypeOf<ArrayChildToResult>().toEqualTypeOf<
    typeof ValidatedValues.Output
  >();
});

test("the width-32 discriminated Object Union fixture preserves correlations", () => {
  type ExpectedInput = ExpectedStrictObject<{
    readonly kind: string;
    readonly value: string;
  }>;
  type ExpectedOutput = {
    readonly [I in PositiveIndex]: ExpectedStrictObject<{
      readonly kind: `O${I}`;
      readonly value: number;
    }>;
  }[PositiveIndex];
  type ExpectedCanonicalInput = {
    readonly [I in PositiveIndex]: ExpectedStrictObject<{
      readonly kind: `O${I}`;
      readonly value: string;
    }>;
  }[PositiveIndex];

  expectTypeOf<ObjectUnionInput>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<ObjectUnionOutput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<ObjectUnionErrors>().toEqualTypeOf<
    ExpectedObjectUnionErrors
  >();
  expectTypeOf<InferOk<ObjectUnionFromUnknownResult>>().toEqualTypeOf<
    ExpectedOutput
  >();
  expectTypeOf<InferErr<ObjectUnionFromUnknownResult>>().toEqualTypeOf<
    ExpectedObjectUnionErrors
  >();
  expectTypeOf<InferErr<ObjectUnionFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<ObjectUnionFromParentResult>>().toEqualTypeOf<
    ExpectedObjectUnionErrors
  >();
  expectTypeOf<ObjectUnionMembers["length"]>().toEqualTypeOf<32>();
  expectTypeOf<ObjectUnionMembers[0]["Output"]>().toEqualTypeOf<
    ExpectedStrictObject<{
      readonly kind: "O1";
      readonly value: number;
    }>
  >();
  expectTypeOf<ObjectUnionMembers[31]["Output"]>().toEqualTypeOf<
    ExpectedStrictObject<{
      readonly kind: "O32";
      readonly value: number;
    }>
  >();
  expectTypeOf<ObjectUnionParent["Output"]>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<ObjectUnionToInput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<ObjectUnionToResult>().toEqualTypeOf<
    ExpectedCanonicalInput
  >();
});

test("the width-32 Discriminated Union fixture preserves routed correlations", () => {
  type ExpectedDiscriminator = `O${PositiveIndex}`;
  type ExpectedInput = {
    readonly [I in PositiveIndex]: ExpectedStrictObject<{
      readonly kind: string;
      readonly value: string;
    }> &
      Readonly<Record<"kind", `O${I}`>>;
  }[PositiveIndex];
  type ExpectedOutput = {
    readonly [I in PositiveIndex]: ExpectedStrictObject<{
      readonly kind: `O${I}`;
      readonly value: number;
    }>;
  }[PositiveIndex];
  type ExpectedCanonicalInput = {
    readonly [I in PositiveIndex]: ExpectedStrictObject<{
      readonly kind: `O${I}`;
      readonly value: string;
    }>;
  }[PositiveIndex];
  type MemberDiscriminator<Member> = Member extends {
    readonly props: {
      readonly kind: { readonly expected: infer Expected extends string };
    };
  }
    ? Expected
    : never;
  type ExpectedNodeMemberIssues = {
    readonly [MemberIndex in keyof DiscriminatedUnionMembers]:
      MemberIndex extends `${number}`
        ? DiscriminatedUnionMemberIssue<
            MemberDiscriminator<DiscriminatedUnionMembers[MemberIndex]>,
            DiscriminatedUnionMembers[MemberIndex]["Error"]
          >
        : never;
  }[keyof DiscriminatedUnionMembers];
  type ExpectedParentMemberIssues = {
    readonly [MemberIndex in keyof DiscriminatedUnionMembers]:
      MemberIndex extends `${number}`
        ? DiscriminatedUnionMemberIssue<
            MemberDiscriminator<DiscriminatedUnionMembers[MemberIndex]>,
            InferErrors<
              NonNullable<DiscriminatedUnionMembers[MemberIndex]["parent"]>
            >
          >
        : never;
  }[keyof DiscriminatedUnionMembers];
  type ExpectedCompleteMemberIssues = {
    readonly [MemberIndex in keyof DiscriminatedUnionMembers]:
      MemberIndex extends `${number}`
        ? DiscriminatedUnionMemberIssue<
            MemberDiscriminator<DiscriminatedUnionMembers[MemberIndex]>,
            InferErrors<DiscriminatedUnionMembers[MemberIndex]>
          >
        : never;
  }[keyof DiscriminatedUnionMembers];
  type ExpectedNodeError = DiscriminatedUnionMemberError<
    ExpectedNodeMemberIssues
  >;
  type ExpectedParentError = DiscriminatedUnionError<
    "kind",
    ExpectedDiscriminator,
    ExpectedParentMemberIssues
  >;
  type ExpectedErrors = DiscriminatedUnionError<
    "kind",
    ExpectedDiscriminator,
    ExpectedCompleteMemberIssues
  >;
  type ErrorReason<Error> = Error extends {
    readonly reason: infer Reason;
  }
    ? Reason
    : never;
  type ReasonByKind<Error, Kind extends string> = Extract<
    ErrorReason<Error>,
    { readonly kind: Kind }
  >;
  type CompleteMemberIssue = ReasonByKind<
    DiscriminatedUnionErrors,
    "Member"
  >;

  expectTypeOf<DiscriminatedUnionKey>().toEqualTypeOf<"kind">();
  expectTypeOf<DiscriminatedUnionInput>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<DiscriminatedUnionOutput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<DiscriminatedUnionNodeError>().toEqualTypeOf<ExpectedNodeError>();
  expectTypeOf<DiscriminatedUnionErrors["type"]>().toEqualTypeOf<
    "DiscriminatedUnion"
  >();
  expectTypeOf<ErrorReason<DiscriminatedUnionErrors>["kind"]>().toEqualTypeOf<
    "Object" | "PropertyAccess" | "Discriminator" | "Member"
  >();
  expectTypeOf<
    ReasonByKind<DiscriminatedUnionErrors, "Object">
  >().toEqualTypeOf<ReasonByKind<ExpectedErrors, "Object">>();
  expectTypeOf<
    ReasonByKind<DiscriminatedUnionErrors, "PropertyAccess">
  >().toEqualTypeOf<ReasonByKind<ExpectedErrors, "PropertyAccess">>();
  expectTypeOf<
    ReasonByKind<DiscriminatedUnionErrors, "Discriminator">
  >().toEqualTypeOf<ReasonByKind<ExpectedErrors, "Discriminator">>();
  expectTypeOf<
    ReasonByKind<DiscriminatedUnionErrors, "Member">
  >().toEqualTypeOf<ReasonByKind<ExpectedErrors, "Member">>();
  expectTypeOf<
    Extract<CompleteMemberIssue, { readonly discriminator: "O1" }>
  >().toEqualTypeOf<
    DiscriminatedUnionMemberIssue<
      "O1",
      InferErrors<DiscriminatedUnionMembers[0]>
    >
  >();
  expectTypeOf<
    Extract<CompleteMemberIssue, { readonly discriminator: "O32" }>
  >().toEqualTypeOf<
    DiscriminatedUnionMemberIssue<
      "O32",
      InferErrors<DiscriminatedUnionMembers[31]>
    >
  >();
  expectTypeOf<
    ReasonByKind<DiscriminatedUnionErrors, "Discriminator">["expected"][number]
  >().toEqualTypeOf<ExpectedDiscriminator>();
  expectTypeOf<DiscriminatedUnionMembers["length"]>().toEqualTypeOf<32>();
  expectTypeOf<
    MemberDiscriminator<DiscriminatedUnionMembers[0]>
  >().toEqualTypeOf<"O1">();
  expectTypeOf<
    MemberDiscriminator<DiscriminatedUnionMembers[31]>
  >().toEqualTypeOf<"O32">();
  expectTypeOf<DiscriminatedUnionFromUnknownInput>().toEqualTypeOf<unknown>();
  expectTypeOf<InferOk<DiscriminatedUnionFromUnknownResult>>().toEqualTypeOf<
    ExpectedOutput
  >();
  expectTypeOf<InferErr<DiscriminatedUnionFromUnknownResult>>().toEqualTypeOf<
    DiscriminatedUnionErrors
  >();
  expectTypeOf<DiscriminatedUnionFromInput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<InferOk<DiscriminatedUnionFromResult>>().toEqualTypeOf<
    ExpectedOutput
  >();
  expectTypeOf<InferErr<DiscriminatedUnionFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<DiscriminatedUnionFromParentInput>().toEqualTypeOf<
    ExpectedInput
  >();
  expectTypeOf<InferOk<DiscriminatedUnionFromParentResult>>().toEqualTypeOf<
    ExpectedOutput
  >();
  expectTypeOf<InferErr<DiscriminatedUnionFromParentResult>>().toEqualTypeOf<
    ExpectedNodeError
  >();
  expectTypeOf<DiscriminatedUnionToInput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<DiscriminatedUnionToResult>().toEqualTypeOf<
    ExpectedCanonicalInput
  >();
  expectTypeOf<DiscriminatedUnionParent["Input"]>().toEqualTypeOf<
    ExpectedInput
  >();
  expectTypeOf<DiscriminatedUnionParent["Output"]>().toEqualTypeOf<
    ExpectedInput
  >();
  expectTypeOf<DiscriminatedUnionParent["Error"]>().toEqualTypeOf<
    InferErrors<DiscriminatedUnionParent>
  >();
  expectTypeOf<
    ErrorReason<DiscriminatedUnionParent["Error"]>["kind"]
  >().toEqualTypeOf<
    "Object" | "PropertyAccess" | "Discriminator" | "Member"
  >();
  expectTypeOf<
    ReasonByKind<DiscriminatedUnionParent["Error"], "Object">
  >().toEqualTypeOf<ReasonByKind<ExpectedParentError, "Object">>();
  expectTypeOf<
    ReasonByKind<DiscriminatedUnionParent["Error"], "PropertyAccess">
  >().toEqualTypeOf<
    ReasonByKind<ExpectedParentError, "PropertyAccess">
  >();
  expectTypeOf<
    ReasonByKind<DiscriminatedUnionParent["Error"], "Discriminator">
  >().toEqualTypeOf<ReasonByKind<ExpectedParentError, "Discriminator">>();
  expectTypeOf<
    ReasonByKind<DiscriminatedUnionParent["Error"], "Member">
  >().toEqualTypeOf<ReasonByKind<ExpectedParentError, "Member">>();
  expectTypeOf<DiscriminatedUnionParent["parent"]>().toEqualTypeOf<null>();
});

test("the width-32 Union Object-property fixture preserves optionality and errors", () => {
  type ExpectedInput = ExpectedStrictObject<
    { readonly required: string },
    { readonly optional: string }
  >;
  type ExpectedOutput = ExpectedStrictObject<
    { readonly required: UnionValue },
    { readonly optional: UnionValue }
  >;
  type ExpectedNodeError = ObjectPropertiesError<{
    readonly required: UnionErrors;
    readonly optional: UnionErrors;
  }>;
  type ExpectedErrors = ObjectError<{
    readonly required: UnionErrors;
    readonly optional?: UnionErrors;
  }>;

  expectTypeOf<UnionObjectInput>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<UnionObjectOutput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<UnionObjectNodeError>().toEqualTypeOf<ExpectedNodeError>();
  expectTypeOf<UnionObjectErrors>().toEqualTypeOf<ExpectedErrors>();
  expectTypeOf<InferErr<UnionObjectFromUnknownResult>>().toEqualTypeOf<
    ExpectedErrors
  >();
  expectTypeOf<InferErr<UnionObjectFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<UnionObjectFromParentResult>>().toEqualTypeOf<
    ExpectedNodeError
  >();
  expectTypeOf<UnionObjectParent["Output"]>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<UnionObjectToInput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<UnionObjectToResult>().toEqualTypeOf<ExpectedOutput>();
});

test("the transformed Object-property fixture preserves both representations", () => {
  type ExpectedInput = ExpectedStrictObject<
    { readonly required: string },
    { readonly optional: string }
  >;
  type ExpectedOutput = ExpectedStrictObject<
    { readonly required: number },
    { readonly optional: number }
  >;
  type ExpectedNodeError = ObjectPropertiesError<{
    readonly required: NumberFromStringError;
    readonly optional: NumberFromStringError;
  }>;
  type ExpectedErrors = ObjectError<{
    readonly required: NumberFromStringErrors;
    readonly optional?: NumberFromStringErrors;
  }>;

  expectTypeOf<TransformObjectInput>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<TransformObjectOutput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<TransformObjectNodeError>().toEqualTypeOf<ExpectedNodeError>();
  expectTypeOf<TransformObjectErrors>().toEqualTypeOf<ExpectedErrors>();
  expectTypeOf<InferErr<TransformObjectFromUnknownResult>>().toEqualTypeOf<
    ExpectedErrors
  >();
  expectTypeOf<InferErr<TransformObjectFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<TransformObjectFromParentResult>>().toEqualTypeOf<
    ExpectedNodeError
  >();
  expectTypeOf<TransformObjectParent["Output"]>().toEqualTypeOf<
    ExpectedInput
  >();
  expectTypeOf<TransformObjectToInput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<TransformObjectToResult>().toEqualTypeOf<ExpectedInput>();
});

test("the typed fixture preserves its discriminator and Object semantics", () => {
  type ExpectedInput = ExpectedStrictObject<
    { readonly type: string; readonly required: string },
    { readonly optional: string }
  >;
  type ExpectedOutput = ExpectedStrictObject<
    { readonly type: "Model"; readonly required: number },
    { readonly optional: number }
  >;
  type ExpectedCanonicalInput = ExpectedStrictObject<
    { readonly type: "Model"; readonly required: string },
    { readonly optional: string }
  >;
  type ExpectedNodeError = ObjectPropertiesError<{
    readonly type: LiteralError<"Model">;
    readonly required: NumberFromStringError;
    readonly optional: NumberFromStringError;
  }>;
  type ExpectedErrors = ObjectError<{
    readonly type: TypeOfError<"String"> | LiteralError<"Model">;
    readonly required: NumberFromStringErrors;
    readonly optional?: NumberFromStringErrors;
  }>;

  expectTypeOf<TypedInput>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<TypedOutput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<TypedNodeError>().toEqualTypeOf<ExpectedNodeError>();
  expectTypeOf<TypedErrors>().toEqualTypeOf<ExpectedErrors>();
  expectTypeOf<TypedFromUnknownInput>().toEqualTypeOf<unknown>();
  expectTypeOf<InferOk<TypedFromUnknownResult>>().toEqualTypeOf<
    ExpectedOutput
  >();
  expectTypeOf<InferErr<TypedFromUnknownResult>>().toEqualTypeOf<
    ExpectedErrors
  >();
  expectTypeOf<TypedFromInput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<InferOk<TypedFromResult>>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<InferErr<TypedFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<TypedFromParentInput>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<InferOk<TypedFromParentResult>>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<InferErr<TypedFromParentResult>>().toEqualTypeOf<
    ExpectedNodeError
  >();
  expectTypeOf<TypedParent["Output"]>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<TypedToInput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<TypedToResult>().toEqualTypeOf<ExpectedCanonicalInput>();
  expectTypeOf<TypedProps["type"]["expected"]>().toEqualTypeOf<"Model">();
});

test("the Object transformation fixture preserves parent and output errors", () => {
  type ExpectedInput = ExpectedStrictObject<
    { readonly value: string },
    { readonly note: string }
  >;
  type ExpectedOutput = ExpectedStrictObject<
    { readonly value: number & Brand<"Positive"> },
    { readonly note: string }
  >;
  type ExpectedEncodedNodeError = ObjectPropertiesError<{
    readonly value: NumberFromStringError;
    readonly note: never;
  }>;
  type ExpectedEncodedErrors = ObjectError<{
    readonly value: NumberFromStringErrors;
    readonly note?: TypeOfError<"String">;
  }>;
  type ExpectedOutputNodeError = ObjectPropertiesError<{
    readonly value: PositiveError;
    readonly note: never;
  }>;
  type ExpectedOutputErrors = ObjectError<{
    readonly value: TypeOfError<"Number"> | PositiveError;
    readonly note?: TypeOfError<"String">;
  }>;
  type ExpectedNodeError = TransformError<
    "ObjectTransform",
    never,
    ExpectedOutputNodeError
  >;

  expectTypeOf<ObjectTransformInput>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<ObjectTransformOutput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<ObjectTransformEncodedNodeError>().toEqualTypeOf<
    ExpectedEncodedNodeError
  >();
  expectTypeOf<ObjectTransformEncodedErrors>().toEqualTypeOf<
    ExpectedEncodedErrors
  >();
  expectTypeOf<ObjectTransformOutputNodeError>().toEqualTypeOf<
    ExpectedOutputNodeError
  >();
  expectTypeOf<ObjectTransformOutputErrors>().toEqualTypeOf<
    ExpectedOutputErrors
  >();
  expectTypeOf<ObjectTransformNodeError>().toEqualTypeOf<ExpectedNodeError>();
  expectTypeOf<ObjectTransformErrors>().toEqualTypeOf<
    ExpectedEncodedErrors | ExpectedNodeError
  >();
  expectTypeOf<InferErr<ObjectTransformFromUnknownResult>>().toEqualTypeOf<
    ExpectedEncodedErrors | ExpectedNodeError
  >();
  expectTypeOf<InferErr<ObjectTransformFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<ObjectTransformFrom2Result>>().toEqualTypeOf<
    ExpectedEncodedNodeError | ExpectedNodeError
  >();
  expectTypeOf<InferErr<ObjectTransformFrom1Result>>().toEqualTypeOf<
    ExpectedNodeError
  >();
  expectTypeOf<ObjectTransformToInput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<ObjectTransformToResult>().toEqualTypeOf<ExpectedInput>();
});

test("the Object Array fixture preserves nested container errors", () => {
  type ExpectedInput = ReadonlyArray<
    ExpectedStrictObject<
      { readonly value: string },
      { readonly note: string }
    >
  >;
  type ExpectedOutput = ReadonlyArray<
    ExpectedStrictObject<
      { readonly value: number },
      { readonly note: string }
    >
  >;
  type ExpectedElementNodeError = ObjectPropertiesError<{
    readonly value: NumberFromStringError;
    readonly note: never;
  }>;
  type ExpectedElementErrors = ObjectError<{
    readonly value: NumberFromStringErrors;
    readonly note?: TypeOfError<"String">;
  }>;

  expectTypeOf<ObjectArrayInput>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<ObjectArrayOutput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<ObjectArrayElementNodeError>().toEqualTypeOf<
    ExpectedElementNodeError
  >();
  expectTypeOf<ObjectArrayElementErrors>().toEqualTypeOf<
    ExpectedElementErrors
  >();
  expectTypeOf<ObjectArrayNodeError>().toEqualTypeOf<
    ArrayElementsError<ExpectedElementNodeError>
  >();
  expectTypeOf<ObjectArrayErrors>().toEqualTypeOf<
    ArrayError<ExpectedElementErrors>
  >();
  expectTypeOf<InferErr<ObjectArrayFromUnknownResult>>().toEqualTypeOf<
    ArrayError<ExpectedElementErrors>
  >();
  expectTypeOf<InferErr<ObjectArrayFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<ObjectArrayFromParentResult>>().toEqualTypeOf<
    ArrayElementsError<ExpectedElementNodeError>
  >();
  expectTypeOf<ObjectArrayParent["Output"]>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<ObjectArrayToInput>().toEqualTypeOf<ExpectedOutput>();
  expectTypeOf<ObjectArrayToResult>().toEqualTypeOf<ExpectedInput>();
});

test("the Object child fixture keeps own errors outside property errors", () => {
  type ExpectedInput = ExpectedStrictObject<
    { readonly title: string; readonly count: number },
    { readonly note: string }
  >;
  type ExpectedModelNodeError = ObjectPropertiesError<{
    readonly title: ObjectChildNonEmptyError | ObjectChildShortError;
    readonly count: ObjectChildCountError;
    readonly note: never;
  }>;
  type ExpectedModelErrors = ObjectError<{
    readonly title:
      | TypeOfError<"String">
      | ObjectChildNonEmptyError
      | ObjectChildShortError;
    readonly count: TypeOfError<"Number"> | ObjectChildCountError;
    readonly note?: TypeOfError<"String">;
  }>;

  expectTypeOf<ObjectChildInput>().toEqualTypeOf<ExpectedInput>();
  expectTypeOf<ObjectChildOutput>().toEqualTypeOf<
    ObjectChildModel["Output"] & Brand<"ReimportedModel">
  >();
  expectTypeOf<ObjectChildNodeError>().toEqualTypeOf<never>();
  expectTypeOf<ObjectChildErrors>().toEqualTypeOf<
    ExpectedModelErrors | ObjectChildImportedError
  >();
  expectTypeOf<InferErr<ObjectChildFromUnknownResult>>().toEqualTypeOf<
    ExpectedModelErrors | ObjectChildImportedError
  >();
  expectTypeOf<InferErr<ObjectChildFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<ObjectChildFrom3Result>>().toEqualTypeOf<
    ExpectedModelNodeError | ObjectChildImportedError
  >();
  expectTypeOf<InferErr<ObjectChildFrom1Result>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<ObjectChildFrom2Result>>().toEqualTypeOf<
    ObjectChildImportedError
  >();
  expectTypeOf<ObjectChildToInput>().toEqualTypeOf<ObjectChildOutput>();
  expectTypeOf<ObjectChildToResult>().toEqualTypeOf<ObjectChildOutput>();
});

test("the direct Lazy fixture preserves every manually declared channel", () => {
  expectTypeOf<LazyDirectDeclaration["name"]>().toEqualTypeOf<"Lazy">();
  expectTypeOf<LazyDirectInput>().toEqualTypeOf<LazyDirectTreeInput>();
  expectTypeOf<LazyDirectOutput>().toEqualTypeOf<LazyDirectTreeOutput>();
  expectTypeOf<LazyDirectNodeError>().toEqualTypeOf<LazyDirectTreeFromError>();
  expectTypeOf<LazyDirectInputError>().toEqualTypeOf<LazyDirectTreeInputError>();
  expectTypeOf<LazyDirectErrors>().toEqualTypeOf<LazyDirectTreeError>();
  expectTypeOf<LazyDirectFromUnknownInput>().toEqualTypeOf<unknown>();
  expectTypeOf<InferOk<LazyDirectFromUnknownResult>>().toEqualTypeOf<
    LazyDirectTreeOutput
  >();
  expectTypeOf<InferErr<LazyDirectFromUnknownResult>>().toEqualTypeOf<
    LazyDirectTreeError
  >();
  expectTypeOf<LazyDirectFromInput>().toEqualTypeOf<LazyDirectTreeOutput>();
  expectTypeOf<InferOk<LazyDirectFromResult>>().toEqualTypeOf<
    LazyDirectTreeOutput
  >();
  expectTypeOf<InferErr<LazyDirectFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<LazyDirectFromParentInput>().toEqualTypeOf<
    LazyDirectTreeInput
  >();
  expectTypeOf<InferOk<LazyDirectFromParentResult>>().toEqualTypeOf<
    LazyDirectTreeOutput
  >();
  expectTypeOf<InferErr<LazyDirectFromParentResult>>().toEqualTypeOf<
    LazyDirectTreeFromError
  >();
  expectTypeOf<LazyDirectParent["Input"]>().toEqualTypeOf<
    LazyDirectTreeInput
  >();
  expectTypeOf<LazyDirectParent["Output"]>().toEqualTypeOf<
    LazyDirectTreeInput
  >();
  expectTypeOf<LazyDirectParent["parent"]>().toEqualTypeOf<null>();
  expectTypeOf<LazyDirectToInput>().toEqualTypeOf<LazyDirectTreeOutput>();
  expectTypeOf<LazyDirectToResult>().toEqualTypeOf<LazyDirectTreeInput>();
});

test("the mutual Lazy fixture preserves both recursive declarations", () => {
  expectTypeOf<LazyMutualLeftDeclaration["name"]>().toEqualTypeOf<"Lazy">();
  expectTypeOf<LazyMutualRightDeclaration["name"]>().toEqualTypeOf<"Lazy">();
  expectTypeOf<LazyMutualLeftInput>().toEqualTypeOf<LazyMutualLeft>();
  expectTypeOf<LazyMutualLeftOutput>().toEqualTypeOf<LazyMutualLeft>();
  expectTypeOf<LazyMutualLeftNodeError>().toEqualTypeOf<never>();
  expectTypeOf<LazyMutualLeftInputError>().toEqualTypeOf<LazyMutualLeftError>();
  expectTypeOf<LazyMutualLeftErrors>().toEqualTypeOf<LazyMutualLeftError>();
  expectTypeOf<InferOk<LazyMutualLeftFromUnknownResult>>().toEqualTypeOf<
    LazyMutualLeft
  >();
  expectTypeOf<InferErr<LazyMutualLeftFromUnknownResult>>().toEqualTypeOf<
    LazyMutualLeftError
  >();
  expectTypeOf<InferOk<LazyMutualLeftFromResult>>().toEqualTypeOf<
    LazyMutualLeft
  >();
  expectTypeOf<InferErr<LazyMutualLeftFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<LazyMutualLeftFromParentResult>>().toEqualTypeOf<never>();
  expectTypeOf<LazyMutualLeftToResult>().toEqualTypeOf<LazyMutualLeft>();
  expectTypeOf<LazyMutualLeftParent["parent"]>().toEqualTypeOf<null>();

  expectTypeOf<LazyMutualRightInput>().toEqualTypeOf<LazyMutualRight>();
  expectTypeOf<LazyMutualRightOutput>().toEqualTypeOf<LazyMutualRight>();
  expectTypeOf<LazyMutualRightNodeError>().toEqualTypeOf<never>();
  expectTypeOf<LazyMutualRightInputError>().toEqualTypeOf<LazyMutualRightError>();
  expectTypeOf<LazyMutualRightErrors>().toEqualTypeOf<LazyMutualRightError>();
  expectTypeOf<InferOk<LazyMutualRightFromUnknownResult>>().toEqualTypeOf<
    LazyMutualRight
  >();
  expectTypeOf<InferErr<LazyMutualRightFromUnknownResult>>().toEqualTypeOf<
    LazyMutualRightError
  >();
  expectTypeOf<InferOk<LazyMutualRightFromResult>>().toEqualTypeOf<
    LazyMutualRight
  >();
  expectTypeOf<InferErr<LazyMutualRightFromResult>>().toEqualTypeOf<never>();
  expectTypeOf<InferErr<LazyMutualRightFromParentResult>>().toEqualTypeOf<never>();
  expectTypeOf<LazyMutualRightToResult>().toEqualTypeOf<LazyMutualRight>();
  expectTypeOf<LazyMutualRightParent["parent"]>().toEqualTypeOf<null>();

  expectTypeOf<LazyMutualLeft["right"]>().toEqualTypeOf<
    LazyMutualRight | undefined
  >();
  expectTypeOf<LazyMutualRight["left"]>().toEqualTypeOf<
    LazyMutualLeft | undefined
  >();
});

test("direct Lazy localization preserves every selected Type", () => {
  expectTypeOf<LocalizedDirectLocales>().toEqualTypeOf<"cs" | "en">();
  expectTypeOf<LocalizedDirectCzechTree>().toEqualTypeOf<
    LocalizedDirectEnglishTree
  >();
  expectTypeOf<LocalizedDirectCzechTree["Output"]>().toEqualTypeOf<
    LocalizedDirectTree
  >();
  expectTypeOf<LocalizedDirectCzechTreeError>().toEqualTypeOf<
    LocalizedDirectTreeError
  >();
});

test("mutual Lazy localization preserves both selected Types", () => {
  expectTypeOf<LocalizedMutualLocales>().toEqualTypeOf<"cs" | "en">();
  expectTypeOf<LocalizedMutualCzechLeft>().toEqualTypeOf<
    LocalizedMutualEnglishLeft
  >();
  expectTypeOf<LocalizedMutualCzechRight>().toEqualTypeOf<
    LocalizedMutualEnglishRight
  >();
  expectTypeOf<LocalizedMutualCzechLeft["Output"]>().toEqualTypeOf<
    LocalizedMutualLeft
  >();
  expectTypeOf<LocalizedMutualCzechRight["Output"]>().toEqualTypeOf<
    LocalizedMutualRight
  >();
});
