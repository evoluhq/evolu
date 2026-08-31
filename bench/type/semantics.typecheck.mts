import { assertType } from "../../packages/common/src/Type.ts";
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

type IsAny<T> = 0 extends 1 & T ? true : false;

type IsNever<T> = [T] extends [never] ? true : false;

type IsAssignableTo<Actual, Expected> =
  IsNever<Actual> extends true
    ? IsNever<Expected>
    : [Actual] extends [Expected]
      ? true
      : false;

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
  readonly [I in PositiveIndex]: FromOutput extends Brand<`B${I}`> ? never : I;
}[PositiveIndex];

type FromUnknownOutput = InferOk<FromUnknownResult>;

type MissingFromUnknownOutputBrands = {
  readonly [I in PositiveIndex]: FromUnknownOutput extends Brand<`B${I}`>
    ? never
    : I;
}[PositiveIndex];

type MissingSemanticOutputBrands = {
  readonly [I in PositiveIndex]: SemanticOutput extends Brand<`S${I}`>
    ? never
    : I;
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

type NestedArray<
  Value,
  Depth extends ReadonlyArray<unknown>,
> = Depth extends readonly [unknown, ...infer Rest]
  ? ReadonlyArray<NestedArray<Value, Rest>>
  : Value;

type NestedArrayError<
  Error extends ArrayError | ExpectedErrors,
  Depth extends ReadonlyArray<unknown>,
> = Depth extends readonly [unknown, ...infer Rest]
  ? ArrayError<NestedArrayError<Error, Rest>>
  : Error;

type NestedSet<
  Value,
  Depth extends ReadonlyArray<unknown>,
> = Depth extends readonly [unknown, ...infer Rest]
  ? ReadonlySet<NestedSet<Value, Rest>>
  : Value;

type NestedSetError<
  Error extends SetError | ExpectedErrors,
  Depth extends ReadonlyArray<unknown>,
> = Depth extends readonly [unknown, ...infer Rest]
  ? SetError<NestedSetError<Error, Rest>>
  : Error;

type NestedObject<
  Value,
  Depth extends ReadonlyArray<unknown>,
> = Depth extends readonly [unknown, ...infer Rest]
  ? ExpectedStrictObject<{ readonly value: NestedObject<Value, Rest> }>
  : Value;

type NumberFromStringErrors = TypeOfError<"String"> | NumberFromStringError;

type UnionValue = `V${PositiveIndex}`;

type ExpectedUnionMemberErrors = {
  readonly [I in PositiveIndex]: LiteralError<`V${I}`>;
}[PositiveIndex];

type ExpectedCorrelatedUnionMemberErrors = {
  readonly [
    MemberIndex in keyof UnionMembers
  ]: MemberIndex extends `${infer NumericIndex extends number}`
    ? UnionMemberError<InferErrors<UnionMembers[MemberIndex]>, NumericIndex>
    : never;
}[keyof UnionMembers];

type ExpectedCorrelatedObjectUnionMemberErrors = {
  readonly [
    MemberIndex in keyof ObjectUnionMembers
  ]: MemberIndex extends `${infer NumericIndex extends number}`
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

// The depth-32 fixture preserves its semantics.
{
  assertType<IsAny<Output>, false>();
  assertType<IsNever<Output>, false>();
  assertType<IsAssignableTo<Output, string>, true>();
  assertType<MissingOutputBrands, never>();
  assertType<Errors, ExpectedErrors>();
  assertType<SelfFromInput, Output>();
  assertType<InferOk<SelfFromResult>, Output>();
  assertType<InferErr<SelfFromResult>, never>();
  assertType<DeepestFromInput, string>();
  assertType<IsAssignableTo<DeepestFromInput, Brand<"B1">>, false>();
  assertType<IsAssignableTo<DeepestFromInput, Brand<"B2">>, false>();
  assertType<IsAny<FromOutput>, false>();
  assertType<IsNever<FromOutput>, false>();
  assertType<IsAssignableTo<FromOutput, string>, true>();
  assertType<MissingFromOutputBrands, never>();
  assertType<InferErr<DeepestFromResult>, ExpectedFromErrors>();
  assertType<DeclarationOutput, Output>();
  assertType<DeclarationErrors, Errors>();
  assertType<DeclarationSelfFromInput, DeclarationOutput>();
  assertType<InferOk<DeclarationSelfFromResult>, DeclarationOutput>();
  assertType<InferErr<DeclarationSelfFromResult>, never>();
  assertType<DeclarationDeepestFromInput, DeepestFromInput>();
  assertType<DeclarationDeepestFromResult, DeepestFromResult>();
  assertType<FromUnknownInput, unknown>();
  assertType<FromUnknownOutput, Output>();
  assertType<MissingFromUnknownOutputBrands, never>();
  assertType<InferErr<FromUnknownResult>, ExpectedErrors>();
  assertType<OrThrowInput, string>();
  assertType<OrThrowOutput, Output>();
  assertType<OrNullInput, string>();
  assertType<OrNullOutput, Output | null>();
  assertType<IsAny<SemanticOutput>, false>();
  assertType<IsNever<SemanticOutput>, false>();
  assertType<IsAssignableTo<SemanticOutput, string>, true>();
  assertType<MissingSemanticOutputBrands, never>();
  assertType<
    SemanticErrors,
    Extract<ExpectedErrors, { readonly type: "E0" }>
  >();
  assertType<InferOk<SemanticFromResult>, SemanticOutput>();
  assertType<InferErr<SemanticFromResult>, never>();
  assertType<SemanticDeepestFromInput, string>();
  assertType<InferOk<SemanticDeepestFromResult>, SemanticOutput>();
  assertType<InferErr<SemanticDeepestFromResult>, never>();
  assertType<ArrayOutput, ReadonlyArray<Output>>();
  assertType<ArrayErrors, ArrayError<ExpectedErrors>>();
  assertType<ArrayFromUnknownInput, unknown>();
  assertType<InferOk<ArrayFromUnknownResult>, ArrayOutput>();
  assertType<InferErr<ArrayFromUnknownResult>, ArrayError<ExpectedErrors>>();
  assertType<ArraySelfFromInput, ArrayOutput>();
  assertType<InferOk<ArraySelfFromResult>, ArrayOutput>();
  assertType<InferErr<ArraySelfFromResult>, never>();
  assertType<ArrayDeepestFromInput, ReadonlyArray<DeepestFromInput>>();
  assertType<InferOk<ArrayDeepestFromResult>, ArrayOutput>();
  assertType<
    IsAssignableTo<
      InferErr<ArrayDeepestFromResult>,
      ArrayElementsError<ExpectedFromErrors>
    >,
    true
  >();
  assertType<
    IsAssignableTo<
      ArrayElementsError<ExpectedFromErrors>,
      InferErr<ArrayDeepestFromResult>
    >,
    true
  >();
  assertType<SemanticArrayOutput, ReadonlyArray<SemanticOutput>>();
  assertType<
    SemanticArrayErrors,
    ArrayError<Extract<ExpectedErrors, { readonly type: "E0" }>>
  >();
  assertType<InferOk<SemanticArrayFromResult>, SemanticArrayOutput>();
  assertType<InferErr<SemanticArrayFromResult>, never>();
  assertType<SemanticArrayDeepestFromInput, ReadonlyArray<string>>();
  assertType<InferOk<SemanticArrayDeepestFromResult>, SemanticArrayOutput>();
  assertType<InferErr<SemanticArrayDeepestFromResult>, never>();
  assertType<SetOutput, ReadonlySet<Output>>();
  assertType<SetErrors, SetError<ExpectedErrors>>();
  assertType<SetFromUnknownInput, unknown>();
  assertType<InferOk<SetFromUnknownResult>, SetOutput>();
  assertType<InferErr<SetFromUnknownResult>, SetError<ExpectedErrors>>();
  assertType<SetSelfFromInput, SetOutput>();
  assertType<InferOk<SetSelfFromResult>, SetOutput>();
  assertType<InferErr<SetSelfFromResult>, never>();
  assertType<SetDeepestFromInput, ReadonlySet<DeepestFromInput>>();
  assertType<InferOk<SetDeepestFromResult>, SetOutput>();
  assertType<
    InferErr<SetDeepestFromResult>,
    SetElementsError<ExpectedFromErrors>
  >();
  assertType<SemanticSetOutput, ReadonlySet<SemanticOutput>>();
  assertType<
    SemanticSetErrors,
    SetError<Extract<ExpectedErrors, { readonly type: "E0" }>>
  >();
  assertType<InferOk<SemanticSetFromResult>, SemanticSetOutput>();
  assertType<InferErr<SemanticSetFromResult>, never>();
  assertType<SemanticSetDeepestFromInput, ReadonlySet<string>>();
  assertType<InferOk<SemanticSetDeepestFromResult>, SemanticSetOutput>();
  assertType<InferErr<SemanticSetDeepestFromResult>, never>();
  assertType<LiteralStringOutput, "Hello">();
  assertType<
    LiteralStringErrors,
    TypeOfError<"String"> | LiteralError<"Hello">
  >();
  assertType<LiteralStringFromInput, "Hello">();
  assertType<InferOk<LiteralStringFromResult>, "Hello">();
  assertType<InferErr<LiteralStringFromResult>, never>();
  assertType<LiteralStringFromParentInput, string>();
  assertType<InferOk<LiteralStringFromParentResult>, "Hello">();
  assertType<InferErr<LiteralStringFromParentResult>, LiteralError<"Hello">>();
  assertType<InferOk<LiteralStringFromUnknownResult>, "Hello">();
  assertType<
    InferErr<LiteralStringFromUnknownResult>,
    TypeOfError<"String"> | LiteralError<"Hello">
  >();
  assertType<LiteralNumberOutput, 42>();
  assertType<LiteralNumberErrors, TypeOfError<"Number"> | LiteralError<42>>();
  assertType<InferOk<LiteralNumberFromResult>, 42>();
  assertType<InferErr<LiteralNumberFromResult>, never>();
  assertType<InferErr<LiteralNumberFromParentResult>, LiteralError<42>>();
  assertType<LiteralArrayOutput, ReadonlyArray<"Hello">>();
  assertType<
    LiteralArrayErrors,
    ArrayError<TypeOfError<"String"> | LiteralError<"Hello">>
  >();
  assertType<InferOk<LiteralArrayFromResult>, LiteralArrayOutput>();
  assertType<InferErr<LiteralArrayFromResult>, never>();
  assertType<
    InferErr<LiteralArrayFromParentResult>,
    ArrayElementsError<LiteralError<"Hello">>
  >();
  assertType<NestedArrayOutput, NestedArray<string, Depth32>>();
  assertType<
    NestedArrayErrors,
    NestedArrayError<Extract<ExpectedErrors, { readonly type: "E0" }>, Depth32>
  >();
  assertType<InferOk<NestedArrayFromUnknownResult>, NestedArrayOutput>();
  assertType<InferErr<NestedArrayFromUnknownResult>, NestedArrayErrors>();
  assertType<InferOk<NestedArrayFromResult>, NestedArrayOutput>();
  assertType<InferErr<NestedArrayFromResult>, never>();
  assertType<NestedSetOutput, NestedSet<string, Depth32>>();
  assertType<
    NestedSetErrors,
    NestedSetError<Extract<ExpectedErrors, { readonly type: "E0" }>, Depth32>
  >();
  assertType<InferOk<NestedSetFromUnknownResult>, NestedSetOutput>();
  assertType<InferErr<NestedSetFromUnknownResult>, NestedSetErrors>();
  assertType<InferOk<NestedSetFromResult>, NestedSetOutput>();
  assertType<InferErr<NestedSetFromResult>, never>();
}

// The reusable Brand Factory preserves its parent and boundaries.
{
  assertType<
    InferredBrandFactory,
    BrandFactory<"Reusable", string, ReusableError>
  >();
  assertType<BrandFactoryOutput, Output & Brand<"Reusable">>();
  assertType<BrandFactoryErrors, Errors | ReusableError>();
  assertType<InferOk<BrandFactoryFromResult>, BrandFactoryOutput>();
  assertType<InferErr<BrandFactoryFromResult>, never>();
  assertType<
    InferErr<BrandFactoryDeepestFromResult>,
    Exclude<ExpectedErrors, { readonly index: 0 }> | ReusableError
  >();
  assertType<BrandFactoryFromParentInput, Output>();
  assertType<InferOk<BrandFactoryFromParentResult>, BrandFactoryOutput>();
  assertType<InferErr<BrandFactoryFromParentResult>, ReusableError>();
  assertType<DirectBrandOutput, Output & Brand<"Direct">>();
  assertType<DirectBrandErrors, Errors | DirectError>();
  assertType<InferOk<DirectBrandFromResult>, DirectBrandOutput>();
  assertType<InferErr<DirectBrandFromResult>, never>();
  assertType<
    InferErr<DirectBrandDeepestFromResult>,
    Exclude<ExpectedErrors, { readonly index: 0 }> | DirectError
  >();
  assertType<DirectBrandFromParentInput, Output>();
  assertType<InferOk<DirectBrandFromParentResult>, DirectBrandOutput>();
  assertType<InferErr<DirectBrandFromParentResult>, DirectError>();
}

// The constraint fixture preserves Label and Age boundaries.
{
  assertType<
    LabelOutput,
    string &
      Brand<"Trimmed"> &
      Brand<"MinLength1"> &
      Brand<"MaxLength50"> &
      Brand<"Label">
  >();
  assertType<
    LabelErrors,
    | TypeOfError<"String">
    | TrimmedError
    | MinLengthError<1>
    | MaxLengthError<50>
  >();
  assertType<InferOk<LabelFromResult>, LabelOutput>();
  assertType<InferErr<LabelFromResult>, never>();
  assertType<
    InferErr<LabelFromStringResult>,
    TrimmedError | MinLengthError<1> | MaxLengthError<50>
  >();
  assertType<LabelFromTrimmedInput, TrimmedStringOutput>();
  assertType<InferOk<LabelFromTrimmedResult>, LabelOutput>();
  assertType<
    InferErr<LabelFromTrimmedResult>,
    MinLengthError<1> | MaxLengthError<50>
  >();

  assertType<
    AgeOutput,
    number &
      Brand<"NonNaN"> &
      Brand<"Finite"> &
      Brand<"Int"> &
      Brand<"NonNegative"> &
      Brand<"Positive"> &
      Brand<"LessThanOrEqualTo99"> &
      Brand<"Age">
  >();
  assertType<
    AgeErrors,
    | TypeOfError<"Number">
    | NonNaNError
    | FiniteError
    | IntError
    | NonNegativeError
    | PositiveError
    | LessThanOrEqualToError<99>
  >();
  assertType<InferOk<AgeFromResult>, AgeOutput>();
  assertType<InferErr<AgeFromResult>, never>();
  assertType<
    InferErr<AgeFromNumberResult>,
    | NonNaNError
    | FiniteError
    | IntError
    | NonNegativeError
    | PositiveError
    | LessThanOrEqualToError<99>
  >();
  assertType<AgeFromPositiveIntInput, PositiveIntOutput>();
  assertType<InferOk<AgeFromPositiveIntResult>, AgeOutput>();
  assertType<InferErr<AgeFromPositiveIntResult>, LessThanOrEqualToError<99>>();
}

// The transformation fixture preserves decoding and encoding.
{
  assertType<TransformInput, string>();
  assertType<TransformOutput, string>();
  assertType<IsAny<TransformErrors>, false>();
  assertType<IsNever<TransformErrors>, false>();
  assertType<InferOk<TransformFromResult>, string>();
  assertType<InferErr<TransformFromResult>, never>();
  assertType<InferOk<TransformFrom3Result>, string>();
  assertType<IsNever<InferErr<TransformFrom3Result>>, false>();
  assertType<InferOk<TransformFrom4Result>, string>();
  assertType<IsNever<InferErr<TransformFrom4Result>>, false>();
  assertType<TransformToResult, string>();
}

// The width-32 Union fixture preserves its semantics.
{
  assertType<UnionOutput, UnionValue>();
  assertType<UnionErrors, ExpectedUnionErrors>();
  assertType<
    Extract<UnionErrors["errors"][number], { readonly index: 0 }>["error"],
    TypeOfError<"String"> | LiteralError<"V1">
  >();
  assertType<
    Extract<UnionErrors["errors"][number], { readonly index: 31 }>["error"],
    TypeOfError<"String"> | LiteralError<"V32">
  >();
  assertType<UnionFromUnknownInput, unknown>();
  assertType<InferOk<UnionFromUnknownResult>, UnionOutput>();
  assertType<InferErr<UnionFromUnknownResult>, UnionErrors>();
  assertType<UnionFromInput, UnionOutput>();
  assertType<InferOk<UnionFromResult>, UnionOutput>();
  assertType<InferErr<UnionFromResult>, never>();
  assertType<UnionFromParentInput, string>();
  assertType<InferOk<UnionFromParentResult>, UnionOutput>();
  assertType<InferErr<UnionFromParentResult>, UnionErrors>();
  assertType<UnionMembers["length"], 32>();
  assertType<UnionParent["name"], "Union">();
  assertType<LiteralUnionOutput, UnionOutput>();
  assertType<LiteralUnionErrors, UnionErrors>();
  assertType<LiteralUnionFromUnknownInput, unknown>();
  assertType<InferOk<LiteralUnionFromUnknownResult>, LiteralUnionOutput>();
  assertType<InferErr<LiteralUnionFromUnknownResult>, LiteralUnionErrors>();
  assertType<LiteralUnionFromInput, LiteralUnionOutput>();
  assertType<InferOk<LiteralUnionFromResult>, LiteralUnionOutput>();
  assertType<InferErr<LiteralUnionFromResult>, never>();
  assertType<LiteralUnionFromParentInput, string>();
  assertType<InferOk<LiteralUnionFromParentResult>, LiteralUnionOutput>();
  assertType<InferErr<LiteralUnionFromParentResult>, LiteralUnionErrors>();
  assertType<LiteralUnionMembers["length"], 32>();
  assertType<LiteralUnionMembers[0]["expected"], "V1">();
  assertType<LiteralUnionMembers[31]["expected"], "V32">();
  assertType<LiteralUnionParent["name"], "Union">();
  assertType<MixedUnionOutput, UnionOutput>();
  assertType<MixedUnionErrors, UnionErrors>();
  assertType<MixedUnionFromUnknownInput, unknown>();
  assertType<InferOk<MixedUnionFromUnknownResult>, MixedUnionOutput>();
  assertType<InferErr<MixedUnionFromUnknownResult>, MixedUnionErrors>();
  assertType<MixedUnionFromInput, MixedUnionOutput>();
  assertType<InferOk<MixedUnionFromResult>, MixedUnionOutput>();
  assertType<InferErr<MixedUnionFromResult>, never>();
  assertType<MixedUnionFromParentInput, string>();
  assertType<InferOk<MixedUnionFromParentResult>, MixedUnionOutput>();
  assertType<InferErr<MixedUnionFromParentResult>, MixedUnionErrors>();
  assertType<MixedUnionMembers["length"], 32>();
  assertType<MixedUnionMembers[0]["name"], "V1">();
  assertType<MixedUnionMembers[1]["name"], "Literal">();
  assertType<MixedUnionMembers[1]["expected"], "V2">();
  assertType<MixedUnionMembers[30]["name"], "V31">();
  assertType<MixedUnionMembers[31]["expected"], "V32">();
  assertType<MixedUnionParent["name"], "Union">();
  assertType<UnionArrayOutput, ReadonlyArray<UnionOutput>>();
  assertType<UnionArrayErrors, ArrayError<UnionErrors>>();
  assertType<InferOk<UnionArrayFromUnknownResult>, UnionArrayOutput>();
  assertType<InferErr<UnionArrayFromUnknownResult>, UnionArrayErrors>();
  assertType<InferOk<UnionArrayFromResult>, UnionArrayOutput>();
  assertType<InferErr<UnionArrayFromResult>, never>();
  assertType<
    InferErr<UnionArrayFromParentResult>,
    ArrayElementsError<UnionErrors>
  >();
  assertType<UnionArrayParent["Output"], ReadonlyArray<string>>();
}

// The 16-position TemplateLiteral fixture preserves its exact types.
{
  assertType<TemplateLiteralParts["length"], 16>();
  assertType<TemplateLiteralOutput["length"], 16>();
  assertType<
    IsAssignableTo<"0000000000000000", TemplateLiteralCanonicalInput>,
    true
  >();
  assertType<
    IsAssignableTo<"0101010101010101", TemplateLiteralCanonicalInput>,
    true
  >();
  assertType<
    IsAssignableTo<"1111111111111111", TemplateLiteralCanonicalInput>,
    true
  >();
  assertType<IsAssignableTo<string, TemplateLiteralCanonicalInput>, false>();
}

// The depth-32 Object fixture preserves its semantics.
{
  assertType<IsAssignableTo<"optional", OptionalKeys<ObjectOutput>>, true>();
  assertType<IsAssignableTo<"required", OptionalKeys<ObjectOutput>>, false>();
  assertType<ObjectOutput["required"], Output>();
  assertType<ObjectOutput["optional"], Output | undefined>();
  type PropertiesReason = Extract<
    ObjectErrors["reason"],
    { readonly kind: "Properties" }
  >;
  type PropertyErrors = PropertiesReason["errors"];

  assertType<
    NonNullable<PropertyErrors["required"]>,
    ObjectMissingPropertyError | ObjectPropertyAccessError | ExpectedErrors
  >();
  assertType<
    NonNullable<PropertyErrors["optional"]>,
    ObjectPropertyAccessError | ExpectedErrors
  >();
  assertType<InferOk<ObjectFromUnknownResult>, ObjectOutput>();

  assertType<InferErr<ObjectFromResult>, never>();

  type FromErrors = InferErr<ObjectFromParentResult>["reason"]["errors"];
  type ExpectedObjectFromErrors = Exclude<
    ExpectedErrors,
    { readonly index: 0 }
  >;

  assertType<NonNullable<FromErrors["required"]>, ExpectedObjectFromErrors>();
  assertType<NonNullable<FromErrors["optional"]>, ExpectedObjectFromErrors>();
}

// The depth-32 Record fixture preserves normalized entry errors.
{
  type ExpectedInput = Readonly<Partial<Record<string, string>>>;
  type ExpectedOutput = Readonly<Partial<Record<string, Output>>>;
  type ExpectedValueFromErrors = Exclude<ExpectedErrors, { readonly index: 0 }>;
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

  assertType<RecordInput, ExpectedInput>();
  assertType<RecordOutput, ExpectedOutput>();
  assertType<RecordNodeError, ExpectedNodeError>();
  assertType<RecordErrors, ExpectedRecordErrors>();
  assertType<InferOk<RecordFromUnknownResult>, ExpectedOutput>();
  assertType<InferErr<RecordFromUnknownResult>, ExpectedRecordErrors>();
  assertType<InferOk<RecordFromResult>, ExpectedOutput>();
  assertType<InferErr<RecordFromResult>, never>();
  assertType<InferErr<RecordFromParentResult>, ExpectedNodeError>();
  assertType<RecordParent["Output"], ExpectedInput>();
  assertType<RecordParent["parent"], null>();
  assertType<RecordToResult, ExpectedOutput>();
}

// The Object Record fixture preserves declared and dynamic properties.
{
  type ExpectedInput = {
    readonly total: string;
    readonly count?: string;
  } & Readonly<Partial<Record<string, string>>>;
  type ExpectedOutput = {
    readonly total: number;
    readonly count?: number;
  } & Readonly<Partial<Record<string, number>>>;
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
    RecordEntriesError<TypeOfError<"String">, NumberFromStringErrors, never>
  >;

  assertType<ObjectRecordInput, ExpectedInput>();
  assertType<ObjectRecordOutput, ExpectedOutput>();
  assertType<ObjectRecordNodeError, ExpectedNodeError>();
  assertType<ObjectRecordErrors, ExpectedObjectErrors>();
  assertType<InferOk<ObjectRecordFromUnknownResult>, ExpectedOutput>();
  assertType<InferErr<ObjectRecordFromUnknownResult>, ExpectedObjectErrors>();
  assertType<InferErr<ObjectRecordFromResult>, never>();
  assertType<InferErr<ObjectRecordFromParentResult>, ExpectedNodeError>();
  assertType<ObjectRecordParent["Output"], ExpectedInput>();
  assertType<ObjectRecordParent["parent"], null>();
  assertType<
    ObjectRecordRecordType["Output"],
    Readonly<Partial<Record<string, number>>>
  >();
  assertType<ObjectRecordToInput, ExpectedOutput>();
  assertType<ObjectRecordToResult, ExpectedInput>();
}

// The transformed Record fixture preserves collisions and child errors.
{
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
    NumberFromStringError
  >;
  type ExpectedRecordErrors = RecordError<
    TypeOfError<"String"> | ExpectedKeyNodeError,
    NumberFromStringErrors
  >;

  assertType<RecordTransformInput, ExpectedInput>();
  assertType<RecordTransformOutput, ExpectedOutput>();
  assertType<RecordTransformNodeError, ExpectedNodeError>();
  assertType<RecordTransformErrors, ExpectedRecordErrors>();
  assertType<
    InferErr<RecordTransformFromUnknownResult>,
    ExpectedRecordErrors
  >();
  assertType<InferErr<RecordTransformFromResult>, never>();
  assertType<InferErr<RecordTransformFromParentResult>, ExpectedNodeError>();
  assertType<RecordTransformParent["Output"], ExpectedInput>();
  assertType<
    RecordTransformToResult,
    Readonly<Partial<Record<RecordTransformLowercaseKey, string>>>
  >();
  assertType<RecordTransformImportedErrors, ExpectedRecordErrors>();
  assertType<InferErr<RecordTransformImportedFromResult>, never>();
  assertType<InferErr<RecordTransformImportedFrom2Result>, ExpectedNodeError>();
  assertType<InferErr<RecordTransformImportedFromParentResult>, never>();
}

// The width-32 Object fixture preserves its semantics.
{
  assertType<
    IsAssignableTo<"optional01", OptionalKeys<WideObjectOutput>>,
    true
  >();
  assertType<
    IsAssignableTo<"optional16", OptionalKeys<WideObjectOutput>>,
    true
  >();
  assertType<
    IsAssignableTo<"required01", OptionalKeys<WideObjectOutput>>,
    false
  >();
  assertType<
    IsAssignableTo<"required16", OptionalKeys<WideObjectOutput>>,
    false
  >();
  assertType<WideObjectOutput["required01"], string & Brand<"B1">>();
  assertType<WideObjectOutput["required16"], string & Brand<"B1">>();
  assertType<
    WideObjectOutput["optional01"],
    (string & Brand<"B1">) | undefined
  >();
  assertType<
    WideObjectOutput["optional16"],
    (string & Brand<"B1">) | undefined
  >();

  type PropertiesReason = Extract<
    WideObjectErrors["reason"],
    { readonly kind: "Properties" }
  >;
  type PropertyErrors = PropertiesReason["errors"];
  type RootAndB1Errors = Extract<ExpectedErrors, { readonly index: 0 | 1 }>;

  assertType<
    NonNullable<PropertyErrors["required01"]>,
    ObjectMissingPropertyError | ObjectPropertyAccessError | RootAndB1Errors
  >();
  assertType<
    NonNullable<PropertyErrors["required16"]>,
    ObjectMissingPropertyError | ObjectPropertyAccessError | RootAndB1Errors
  >();
  assertType<
    NonNullable<PropertyErrors["optional01"]>,
    ObjectPropertyAccessError | RootAndB1Errors
  >();
  assertType<
    NonNullable<PropertyErrors["optional16"]>,
    ObjectPropertyAccessError | RootAndB1Errors
  >();

  assertType<InferErr<WideObjectFromResult>, never>();

  type FromErrors = InferErr<WideObjectFromParentResult>["reason"]["errors"];
  type B1Error = Extract<ExpectedErrors, { readonly index: 1 }>;

  assertType<NonNullable<FromErrors["required01"]>, B1Error>();
  assertType<NonNullable<FromErrors["optional16"]>, B1Error>();
}

// The depth-32 nested Object fixture preserves its semantics.
{
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

  assertType<NestedObjectInput, ExpectedInput>();
  assertType<NestedObjectOutput, ExpectedOutput>();
  assertType<IsAny<OuterPropertyError>, false>();
  assertType<IsNever<OuterPropertyError>, false>();
  assertType<
    Extract<OuterPropertyError, ObjectMissingPropertyError>,
    ObjectMissingPropertyError
  >();
  assertType<
    Extract<OuterPropertyError, ObjectPropertyAccessError>,
    ObjectPropertyAccessError
  >();
  assertType<IsAny<OuterFromPropertyError>, false>();
  assertType<IsNever<OuterFromPropertyError>, false>();
  assertType<InferOk<NestedObjectFromUnknownResult>, ExpectedOutput>();
  assertType<InferErr<NestedObjectFromUnknownResult>, NestedObjectErrors>();
  assertType<InferOk<NestedObjectFromResult>, ExpectedOutput>();
  assertType<InferErr<NestedObjectFromResult>, never>();
  assertType<NestedObjectToInput, ExpectedOutput>();
  assertType<NestedObjectToResult, ExpectedInput>();
  assertType<NestedObjectParent["Output"], ExpectedInput>();
  assertType<NestedObjectParent["parent"], null>();
}

// The Array child fixture preserves specialized from operations.
{
  type ElementErrors = Extract<
    ExpectedErrors,
    { readonly index: 0 | 1 | 2 | 3 | 4 }
  >;
  type ElementFromErrors = Extract<
    ElementErrors,
    { readonly index: 1 | 2 | 3 | 4 }
  >;

  assertType<ArrayChildInput, ReadonlyArray<string>>();
  assertType<ArrayChildOutput, typeof ValidatedValues.Output>();
  assertType<ArrayChildErrors, ArrayChild1Error | ArrayError<ElementErrors>>();
  assertType<InferOk<ArrayChildFromUnknownResult>, ArrayChildOutput>();
  assertType<InferErr<ArrayChildFromUnknownResult>, ArrayChildErrors>();
  assertType<InferErr<ArrayChildFromResult>, never>();
  assertType<
    InferErr<ArrayChildFrom6Result>,
    ArrayChild1Error | ArrayElementsError<ElementFromErrors>
  >();
  assertType<InferErr<ArrayChildFrom1Result>, never>();
  assertType<ArrayChildFrom2Input, typeof ValidatedValues.Output>();
  assertType<InferErr<ArrayChildFrom2Result>, ArrayChild1Error>();
  assertType<
    InferErr<ArrayChildFrom3Result>,
    | ArrayChild1Error
    | ArrayElementsError<Extract<ElementErrors, { readonly index: 4 }>>
  >();
  assertType<ArrayChildFrom5Input, ReadonlyArray<string & Brand<"B1">>>();
  assertType<
    InferErr<ArrayChildFrom5Result>,
    | ArrayChild1Error
    | ArrayElementsError<Extract<ElementErrors, { readonly index: 2 | 3 | 4 }>>
  >();
  assertType<ArrayChildFrom6Input, ArrayDeepestFromInput>();
  assertType<ArrayChildToInput, ArrayChildOutput>();
  assertType<ArrayChildToResult, typeof ValidatedValues.Output>();
}

// The width-32 discriminated Object Union fixture preserves correlations.
{
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

  assertType<ObjectUnionInput, ExpectedInput>();
  assertType<ObjectUnionOutput, ExpectedOutput>();
  assertType<ObjectUnionErrors, ExpectedObjectUnionErrors>();
  assertType<InferOk<ObjectUnionFromUnknownResult>, ExpectedOutput>();
  assertType<
    InferErr<ObjectUnionFromUnknownResult>,
    ExpectedObjectUnionErrors
  >();
  assertType<InferErr<ObjectUnionFromResult>, never>();
  assertType<
    InferErr<ObjectUnionFromParentResult>,
    ExpectedObjectUnionErrors
  >();
  assertType<ObjectUnionMembers["length"], 32>();
  assertType<
    ObjectUnionMembers[0]["Output"],
    ExpectedStrictObject<{
      readonly kind: "O1";
      readonly value: number;
    }>
  >();
  assertType<
    ObjectUnionMembers[31]["Output"],
    ExpectedStrictObject<{
      readonly kind: "O32";
      readonly value: number;
    }>
  >();
  assertType<ObjectUnionParent["Output"], ExpectedInput>();
  assertType<ObjectUnionToInput, ExpectedOutput>();
  assertType<ObjectUnionToResult, ExpectedCanonicalInput>();
}

// The width-32 Discriminated Union fixture preserves routed correlations.
{
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
    readonly [
      MemberIndex in keyof DiscriminatedUnionMembers
    ]: MemberIndex extends `${number}`
      ? DiscriminatedUnionMemberIssue<
          MemberDiscriminator<DiscriminatedUnionMembers[MemberIndex]>,
          DiscriminatedUnionMembers[MemberIndex]["Error"]
        >
      : never;
  }[keyof DiscriminatedUnionMembers];
  type ExpectedParentMemberIssues = {
    readonly [
      MemberIndex in keyof DiscriminatedUnionMembers
    ]: MemberIndex extends `${number}`
      ? DiscriminatedUnionMemberIssue<
          MemberDiscriminator<DiscriminatedUnionMembers[MemberIndex]>,
          InferErrors<
            NonNullable<DiscriminatedUnionMembers[MemberIndex]["parent"]>
          >
        >
      : never;
  }[keyof DiscriminatedUnionMembers];
  type ExpectedCompleteMemberIssues = {
    readonly [
      MemberIndex in keyof DiscriminatedUnionMembers
    ]: MemberIndex extends `${number}`
      ? DiscriminatedUnionMemberIssue<
          MemberDiscriminator<DiscriminatedUnionMembers[MemberIndex]>,
          InferErrors<DiscriminatedUnionMembers[MemberIndex]>
        >
      : never;
  }[keyof DiscriminatedUnionMembers];
  type ExpectedNodeError =
    DiscriminatedUnionMemberError<ExpectedNodeMemberIssues>;
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
  type CompleteMemberIssue = ReasonByKind<DiscriminatedUnionErrors, "Member">;

  assertType<DiscriminatedUnionKey, "kind">();
  assertType<DiscriminatedUnionInput, ExpectedInput>();
  assertType<DiscriminatedUnionOutput, ExpectedOutput>();
  assertType<DiscriminatedUnionNodeError, ExpectedNodeError>();
  assertType<DiscriminatedUnionErrors["type"], "DiscriminatedUnion">();
  assertType<
    ErrorReason<DiscriminatedUnionErrors>["kind"],
    "Object" | "PropertyAccess" | "Discriminator" | "Member"
  >();
  assertType<
    ReasonByKind<DiscriminatedUnionErrors, "Object">,
    ReasonByKind<ExpectedErrors, "Object">
  >();
  assertType<
    ReasonByKind<DiscriminatedUnionErrors, "PropertyAccess">,
    ReasonByKind<ExpectedErrors, "PropertyAccess">
  >();
  assertType<
    ReasonByKind<DiscriminatedUnionErrors, "Discriminator">,
    ReasonByKind<ExpectedErrors, "Discriminator">
  >();
  assertType<
    ReasonByKind<DiscriminatedUnionErrors, "Member">,
    ReasonByKind<ExpectedErrors, "Member">
  >();
  assertType<
    Extract<CompleteMemberIssue, { readonly discriminator: "O1" }>,
    DiscriminatedUnionMemberIssue<
      "O1",
      InferErrors<DiscriminatedUnionMembers[0]>
    >
  >();
  assertType<
    Extract<CompleteMemberIssue, { readonly discriminator: "O32" }>,
    DiscriminatedUnionMemberIssue<
      "O32",
      InferErrors<DiscriminatedUnionMembers[31]>
    >
  >();
  assertType<
    ReasonByKind<DiscriminatedUnionErrors, "Discriminator">["expected"][number],
    ExpectedDiscriminator
  >();
  assertType<DiscriminatedUnionMembers["length"], 32>();
  assertType<MemberDiscriminator<DiscriminatedUnionMembers[0]>, "O1">();
  assertType<MemberDiscriminator<DiscriminatedUnionMembers[31]>, "O32">();
  assertType<DiscriminatedUnionFromUnknownInput, unknown>();
  assertType<InferOk<DiscriminatedUnionFromUnknownResult>, ExpectedOutput>();
  assertType<
    InferErr<DiscriminatedUnionFromUnknownResult>,
    DiscriminatedUnionErrors
  >();
  assertType<DiscriminatedUnionFromInput, ExpectedOutput>();
  assertType<InferOk<DiscriminatedUnionFromResult>, ExpectedOutput>();
  assertType<InferErr<DiscriminatedUnionFromResult>, never>();
  assertType<DiscriminatedUnionFromParentInput, ExpectedInput>();
  assertType<InferOk<DiscriminatedUnionFromParentResult>, ExpectedOutput>();
  assertType<InferErr<DiscriminatedUnionFromParentResult>, ExpectedNodeError>();
  assertType<DiscriminatedUnionToInput, ExpectedOutput>();
  assertType<DiscriminatedUnionToResult, ExpectedCanonicalInput>();
  assertType<DiscriminatedUnionParent["Input"], ExpectedInput>();
  assertType<DiscriminatedUnionParent["Output"], ExpectedInput>();
  assertType<
    DiscriminatedUnionParent["Error"],
    InferErrors<DiscriminatedUnionParent>
  >();
  assertType<
    ErrorReason<DiscriminatedUnionParent["Error"]>["kind"],
    "Object" | "PropertyAccess" | "Discriminator" | "Member"
  >();
  assertType<
    ReasonByKind<DiscriminatedUnionParent["Error"], "Object">,
    ReasonByKind<ExpectedParentError, "Object">
  >();
  assertType<
    ReasonByKind<DiscriminatedUnionParent["Error"], "PropertyAccess">,
    ReasonByKind<ExpectedParentError, "PropertyAccess">
  >();
  assertType<
    ReasonByKind<DiscriminatedUnionParent["Error"], "Discriminator">,
    ReasonByKind<ExpectedParentError, "Discriminator">
  >();
  assertType<
    ReasonByKind<DiscriminatedUnionParent["Error"], "Member">,
    ReasonByKind<ExpectedParentError, "Member">
  >();
  assertType<DiscriminatedUnionParent["parent"], null>();
}

// The width-32 Union Object-property fixture preserves optionality and errors.
{
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

  assertType<UnionObjectInput, ExpectedInput>();
  assertType<UnionObjectOutput, ExpectedOutput>();
  assertType<UnionObjectNodeError, ExpectedNodeError>();
  assertType<UnionObjectErrors, ExpectedErrors>();
  assertType<InferErr<UnionObjectFromUnknownResult>, ExpectedErrors>();
  assertType<InferErr<UnionObjectFromResult>, never>();
  assertType<InferErr<UnionObjectFromParentResult>, ExpectedNodeError>();
  assertType<UnionObjectParent["Output"], ExpectedInput>();
  assertType<UnionObjectToInput, ExpectedOutput>();
  assertType<UnionObjectToResult, ExpectedOutput>();
}

// The transformed Object-property fixture preserves both representations.
{
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

  assertType<TransformObjectInput, ExpectedInput>();
  assertType<TransformObjectOutput, ExpectedOutput>();
  assertType<TransformObjectNodeError, ExpectedNodeError>();
  assertType<TransformObjectErrors, ExpectedErrors>();
  assertType<InferErr<TransformObjectFromUnknownResult>, ExpectedErrors>();
  assertType<InferErr<TransformObjectFromResult>, never>();
  assertType<InferErr<TransformObjectFromParentResult>, ExpectedNodeError>();
  assertType<TransformObjectParent["Output"], ExpectedInput>();
  assertType<TransformObjectToInput, ExpectedOutput>();
  assertType<TransformObjectToResult, ExpectedInput>();
}

// The typed fixture preserves its discriminator and Object semantics.
{
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

  assertType<TypedInput, ExpectedInput>();
  assertType<TypedOutput, ExpectedOutput>();
  assertType<TypedNodeError, ExpectedNodeError>();
  assertType<TypedErrors, ExpectedErrors>();
  assertType<TypedFromUnknownInput, unknown>();
  assertType<InferOk<TypedFromUnknownResult>, ExpectedOutput>();
  assertType<InferErr<TypedFromUnknownResult>, ExpectedErrors>();
  assertType<TypedFromInput, ExpectedOutput>();
  assertType<InferOk<TypedFromResult>, ExpectedOutput>();
  assertType<InferErr<TypedFromResult>, never>();
  assertType<TypedFromParentInput, ExpectedInput>();
  assertType<InferOk<TypedFromParentResult>, ExpectedOutput>();
  assertType<InferErr<TypedFromParentResult>, ExpectedNodeError>();
  assertType<TypedParent["Output"], ExpectedInput>();
  assertType<TypedToInput, ExpectedOutput>();
  assertType<TypedToResult, ExpectedCanonicalInput>();
  assertType<TypedProps["type"]["expected"], "Model">();
}

// The Object transformation fixture preserves parent and output errors.
{
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

  assertType<ObjectTransformInput, ExpectedInput>();
  assertType<ObjectTransformOutput, ExpectedOutput>();
  assertType<ObjectTransformEncodedNodeError, ExpectedEncodedNodeError>();
  assertType<ObjectTransformEncodedErrors, ExpectedEncodedErrors>();
  assertType<ObjectTransformOutputNodeError, ExpectedOutputNodeError>();
  assertType<ObjectTransformOutputErrors, ExpectedOutputErrors>();
  assertType<ObjectTransformNodeError, ExpectedNodeError>();
  assertType<
    ObjectTransformErrors,
    ExpectedEncodedErrors | ExpectedNodeError
  >();
  assertType<
    InferErr<ObjectTransformFromUnknownResult>,
    ExpectedEncodedErrors | ExpectedNodeError
  >();
  assertType<InferErr<ObjectTransformFromResult>, never>();
  assertType<
    InferErr<ObjectTransformFrom2Result>,
    ExpectedEncodedNodeError | ExpectedNodeError
  >();
  assertType<InferErr<ObjectTransformFrom1Result>, ExpectedNodeError>();
  assertType<ObjectTransformToInput, ExpectedOutput>();
  assertType<ObjectTransformToResult, ExpectedInput>();
}

// The Object Array fixture preserves nested container errors.
{
  type ExpectedInput = ReadonlyArray<
    ExpectedStrictObject<{ readonly value: string }, { readonly note: string }>
  >;
  type ExpectedOutput = ReadonlyArray<
    ExpectedStrictObject<{ readonly value: number }, { readonly note: string }>
  >;
  type ExpectedElementNodeError = ObjectPropertiesError<{
    readonly value: NumberFromStringError;
    readonly note: never;
  }>;
  type ExpectedElementErrors = ObjectError<{
    readonly value: NumberFromStringErrors;
    readonly note?: TypeOfError<"String">;
  }>;

  assertType<ObjectArrayInput, ExpectedInput>();
  assertType<ObjectArrayOutput, ExpectedOutput>();
  assertType<ObjectArrayElementNodeError, ExpectedElementNodeError>();
  assertType<ObjectArrayElementErrors, ExpectedElementErrors>();
  assertType<
    ObjectArrayNodeError,
    ArrayElementsError<ExpectedElementNodeError>
  >();
  assertType<ObjectArrayErrors, ArrayError<ExpectedElementErrors>>();
  assertType<
    InferErr<ObjectArrayFromUnknownResult>,
    ArrayError<ExpectedElementErrors>
  >();
  assertType<InferErr<ObjectArrayFromResult>, never>();
  assertType<
    InferErr<ObjectArrayFromParentResult>,
    ArrayElementsError<ExpectedElementNodeError>
  >();
  assertType<ObjectArrayParent["Output"], ExpectedInput>();
  assertType<ObjectArrayToInput, ExpectedOutput>();
  assertType<ObjectArrayToResult, ExpectedInput>();
}

// The Object child fixture keeps own errors outside property errors.
{
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
      TypeOfError<"String"> | ObjectChildNonEmptyError | ObjectChildShortError;
    readonly count: TypeOfError<"Number"> | ObjectChildCountError;
    readonly note?: TypeOfError<"String">;
  }>;

  assertType<ObjectChildInput, ExpectedInput>();
  assertType<
    ObjectChildOutput,
    ObjectChildModel["Output"] & Brand<"ReimportedModel">
  >();
  assertType<ObjectChildNodeError, never>();
  assertType<
    ObjectChildErrors,
    ExpectedModelErrors | ObjectChildImportedError
  >();
  assertType<
    InferErr<ObjectChildFromUnknownResult>,
    ExpectedModelErrors | ObjectChildImportedError
  >();
  assertType<InferErr<ObjectChildFromResult>, never>();
  assertType<
    InferErr<ObjectChildFrom3Result>,
    ExpectedModelNodeError | ObjectChildImportedError
  >();
  assertType<InferErr<ObjectChildFrom1Result>, never>();
  assertType<InferErr<ObjectChildFrom2Result>, ObjectChildImportedError>();
  assertType<ObjectChildToInput, ObjectChildOutput>();
  assertType<ObjectChildToResult, ObjectChildOutput>();
}

// The direct Lazy fixture preserves every manually declared channel.
{
  assertType<LazyDirectDeclaration["name"], "Lazy">();
  assertType<LazyDirectInput, LazyDirectTreeInput>();
  assertType<LazyDirectOutput, LazyDirectTreeOutput>();
  assertType<LazyDirectNodeError, LazyDirectTreeFromError>();
  assertType<LazyDirectInputError, LazyDirectTreeInputError>();
  assertType<LazyDirectErrors, LazyDirectTreeError>();
  assertType<LazyDirectFromUnknownInput, unknown>();
  assertType<InferOk<LazyDirectFromUnknownResult>, LazyDirectTreeOutput>();
  assertType<InferErr<LazyDirectFromUnknownResult>, LazyDirectTreeError>();
  assertType<LazyDirectFromInput, LazyDirectTreeOutput>();
  assertType<InferOk<LazyDirectFromResult>, LazyDirectTreeOutput>();
  assertType<InferErr<LazyDirectFromResult>, never>();
  assertType<LazyDirectFromParentInput, LazyDirectTreeInput>();
  assertType<InferOk<LazyDirectFromParentResult>, LazyDirectTreeOutput>();
  assertType<InferErr<LazyDirectFromParentResult>, LazyDirectTreeFromError>();
  assertType<LazyDirectParent["Input"], LazyDirectTreeInput>();
  assertType<LazyDirectParent["Output"], LazyDirectTreeInput>();
  assertType<LazyDirectParent["parent"], null>();
  assertType<LazyDirectToInput, LazyDirectTreeOutput>();
  assertType<LazyDirectToResult, LazyDirectTreeInput>();
}

// The mutual Lazy fixture preserves both recursive declarations.
{
  assertType<LazyMutualLeftDeclaration["name"], "Lazy">();
  assertType<LazyMutualRightDeclaration["name"], "Lazy">();
  assertType<LazyMutualLeftInput, LazyMutualLeft>();
  assertType<LazyMutualLeftOutput, LazyMutualLeft>();
  assertType<LazyMutualLeftNodeError, never>();
  assertType<LazyMutualLeftInputError, LazyMutualLeftError>();
  assertType<LazyMutualLeftErrors, LazyMutualLeftError>();
  assertType<InferOk<LazyMutualLeftFromUnknownResult>, LazyMutualLeft>();
  assertType<InferErr<LazyMutualLeftFromUnknownResult>, LazyMutualLeftError>();
  assertType<InferOk<LazyMutualLeftFromResult>, LazyMutualLeft>();
  assertType<InferErr<LazyMutualLeftFromResult>, never>();
  assertType<InferErr<LazyMutualLeftFromParentResult>, never>();
  assertType<LazyMutualLeftToResult, LazyMutualLeft>();
  assertType<LazyMutualLeftParent["parent"], null>();

  assertType<LazyMutualRightInput, LazyMutualRight>();
  assertType<LazyMutualRightOutput, LazyMutualRight>();
  assertType<LazyMutualRightNodeError, never>();
  assertType<LazyMutualRightInputError, LazyMutualRightError>();
  assertType<LazyMutualRightErrors, LazyMutualRightError>();
  assertType<InferOk<LazyMutualRightFromUnknownResult>, LazyMutualRight>();
  assertType<
    InferErr<LazyMutualRightFromUnknownResult>,
    LazyMutualRightError
  >();
  assertType<InferOk<LazyMutualRightFromResult>, LazyMutualRight>();
  assertType<InferErr<LazyMutualRightFromResult>, never>();
  assertType<InferErr<LazyMutualRightFromParentResult>, never>();
  assertType<LazyMutualRightToResult, LazyMutualRight>();
  assertType<LazyMutualRightParent["parent"], null>();

  assertType<LazyMutualLeft["right"], LazyMutualRight | undefined>();
  assertType<LazyMutualRight["left"], LazyMutualLeft | undefined>();
}

// Direct Lazy localization preserves every selected Type.
{
  assertType<LocalizedDirectLocales, "cs" | "en">();
  assertType<LocalizedDirectCzechTree, LocalizedDirectEnglishTree>();
  assertType<LocalizedDirectCzechTree["Output"], LocalizedDirectTree>();
  assertType<LocalizedDirectCzechTreeError, LocalizedDirectTreeError>();
}

// Mutual Lazy localization preserves both selected Types.
{
  assertType<LocalizedMutualLocales, "cs" | "en">();
  assertType<LocalizedMutualCzechLeft, LocalizedMutualEnglishLeft>();
  assertType<LocalizedMutualCzechRight, LocalizedMutualEnglishRight>();
  assertType<LocalizedMutualCzechLeft["Output"], LocalizedMutualLeft>();
  assertType<LocalizedMutualCzechRight["Output"], LocalizedMutualRight>();
}
