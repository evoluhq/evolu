/**
 * Measures a Release build of one of Evolu's example apps for the React Native
 * app jobs, compares it with its entry in `baselines.json`, and reports the
 * differences without ever failing: `README.md` says what each value measures
 * and why.
 *
 * Usage: `node bench/app-size/measure.mts --key=<key> --image=<runner image>
 * --app=<.app> --link-map=<file> --out=<dir> --summary=<file>` for iOS, or with
 * `--apk=<file>` instead of `--app` and `--link-map` for Android. It writes the
 * entry to `<out>/<key>.json` as `{ "<key>": { ... } }`, appends the comparison
 * to the summary file, and prints a warning annotation when a size differs or
 * the key has no baseline.
 *
 * @module
 */
import {
  assert,
  getOrThrow,
  Number,
  type InferType,
  object,
  record,
  String,
  union,
  type ReadonlyRecord,
} from "@evolu/common";
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/**
 * Sizes in bytes of an iOS app built for the simulator with
 * `DEPLOYMENT_POSTPROCESSING=YES`, which strips the executable as an archive
 * does.
 */
export interface IosAppSize {
  /** Every file in the `.app`. */
  readonly app: number;
  readonly executable: number;
  /**
   * The executable's live symbols from each static library, and the groups
   * `app`, the app target's own files, `linkerSynthesized`, and `stubs`, every
   * other file. Headers, the symbol table and the signature count in none.
   */
  readonly executableByLibrary: ReadonlyRecord<string, number>;
  /** Each embedded framework's binary. */
  readonly frameworks: ReadonlyRecord<string, number>;
  readonly jsBundle: number;
  /** Evolu's static library and the code React Native generated for it. */
  readonly evolu: number;
}

/**
 * Measures an iOS app and attributes its executable with the link map that
 * `LD_GENERATE_MAP_FILE=YES` wrote.
 */
export const measureIosApp = ({
  app,
  linkMap,
}: {
  app: string;
  linkMap: string;
}): IosAppSize => {
  const sizeByFile = new Map(
    readdirSync(app, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const path = join(entry.parentPath, entry.name);
        return [relative(app, path), statSync(path).size] as const;
      }),
  );
  const executable = sizeByFile.get(basename(app, ".app"));
  const jsBundle = sizeByFile.get("main.jsbundle");
  assert(executable != null, `${app} has no executable.`);
  assert(jsBundle != null, `${app} has no main.jsbundle.`);

  // Symbol names hold raw C string bytes, which aren't always UTF-8.
  const text = readFileSync(linkMap, "latin1");
  const executablePath = /^# Path: (.*)$/mu.exec(text)?.[1];
  assert(executablePath != null, `${linkMap} has no executable path.`);
  const appTargetFiles = `/${basename(executablePath)}.build/`;
  const groupByFile = new Map<number, string>();
  const zeroFillSections: Array<readonly [start: number, end: number]> = [];
  const sizeByGroup = new Map<string, number>();
  let evoluCodegenFile: number | undefined;
  let evoluCodegen = 0;
  let part = "";

  // The symbols that follow "# Dead Stripped Symbols:" aren't in the
  // executable, so reading stops there.
  for (const line of text.split("\n")) {
    if (line === "# Dead Stripped Symbols:") break;
    // A table's heading, not its column names.
    if (line.startsWith("# ") && line.endsWith(":")) {
      part = line;
      continue;
    }
    if (part === "# Object files:") {
      const objectFile = /^\[ *(\d+)\] (.*)$/u.exec(line);
      assert(
        objectFile != null,
        `${linkMap} lists an unreadable file: ${line}`,
      );
      const [, file, path] = objectFile;
      const member = /\/([^/]+\.a)\(([^)]+)\)$/u.exec(path);
      if (
        member?.[1] === "libReactCodegen.a" &&
        member[2] === "EvoluReactNativeSpec-generated.o"
      )
        evoluCodegenFile = globalThis.Number(file);
      groupByFile.set(
        globalThis.Number(file),
        member?.[1] ??
          (path === "linker synthesized"
            ? "linkerSynthesized"
            : path.includes(appTargetFiles)
              ? "app"
              : "stubs"),
      );
    } else if (part === "# Sections:") {
      const section = /^0x([\dA-F]+)\t0x([\dA-F]+)\t\S+\t(\S+)$/u.exec(line);
      // Zero-fill sections take no space in the file.
      if (section == null || !zeroFill.has(section[3])) continue;
      const start = globalThis.Number.parseInt(section[1], 16);
      zeroFillSections.push([
        start,
        start + globalThis.Number.parseInt(section[2], 16),
      ]);
    } else if (part === "# Symbols:") {
      const symbol = /^0x([\dA-F]+)\t0x([\dA-F]+)\t\[ *(\d+)\]/u.exec(line);
      if (symbol == null) continue;
      const address = globalThis.Number.parseInt(symbol[1], 16);
      if (
        zeroFillSections.some(
          ([start, end]) => address >= start && address < end,
        )
      )
        continue;
      const file = globalThis.Number(symbol[3]);
      const group = groupByFile.get(file);
      assert(group != null, `${linkMap} lists a symbol of no file: ${line}`);
      const size = globalThis.Number.parseInt(symbol[2], 16);
      sizeByGroup.set(group, (sizeByGroup.get(group) ?? 0) + size);
      if (file === evoluCodegenFile) evoluCodegen += size;
    }
  }

  const evoluLibrary = sizeByGroup.get("libEvoluReactNative.a");
  assert(evoluLibrary != null, `${linkMap} has no libEvoluReactNative.a.`);
  assert(
    evoluCodegenFile != null,
    `${linkMap} has no libReactCodegen.a(EvoluReactNativeSpec-generated.o).`,
  );

  return {
    app: [...sizeByFile.values()].reduce((sum, size) => sum + size, 0),
    executable,
    executableByLibrary: sortedRecord(sizeByGroup),
    frameworks: sortedRecord(
      [...sizeByFile].flatMap(([path, size]) => {
        const name = /^Frameworks\/([^/]+)\.framework\/\1$/u.exec(path)?.[1];
        return name == null ? [] : [[`${name}.framework`, size] as const];
      }),
    ),
    jsBundle,
    evolu: evoluLibrary + evoluCodegen,
  };
};

const zeroFill = new Set(["__bss", "__common", "__thread_bss"]);

/** Sizes in bytes of an Android APK; parts count their entries uncompressed. */
export interface AndroidAppSize {
  /** The APK file, with every ABI it holds. */
  readonly apk: number;
  /** Each `lib/arm64-v8a/*.so`. */
  readonly libs: ReadonlyRecord<string, number>;
  /** Every `classes*.dex`. */
  readonly dex: number;
  readonly jsBundle: number;
  /** Every other file under `assets/`. */
  readonly assets: number;
  /** `resources.arsc` and every file under `res/`. */
  readonly resources: number;
}

/** Measures an APK from its zip central directory. */
export const measureAndroidApp = (apk: string): AndroidAppSize => {
  const zip = readFileSync(apk);
  const end = zip.lastIndexOf(endOfCentralDirectory);
  assert(end >= 0, `${apk} is not a zip file.`);
  const entries = zip.readUInt16LE(end + 10);
  const libs: Array<readonly [string, number]> = [];
  let dex = 0;
  let jsBundle: number | undefined;
  let assets = 0;
  let resources = 0;

  let offset = zip.readUInt32LE(end + 16);
  for (let index = 0; index < entries; index++) {
    assert(
      zip.readUInt32LE(offset) === centralDirectoryHeader,
      `${apk} has a malformed central directory.`,
    );
    const size = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const name = zip.toString("utf8", offset + 46, offset + 46 + nameLength);
    offset +=
      46 +
      nameLength +
      zip.readUInt16LE(offset + 30) +
      zip.readUInt16LE(offset + 32);

    const lib = /^lib\/arm64-v8a\/([^/]+\.so)$/u.exec(name)?.[1];
    if (lib != null) libs.push([lib, size]);
    else if (/^classes\d*\.dex$/u.test(name)) dex += size;
    else if (name === "assets/index.android.bundle") jsBundle = size;
    else if (name.startsWith("assets/")) assets += size;
    else if (name === "resources.arsc" || name.startsWith("res/"))
      resources += size;
  }
  assert(libs.length > 0, `${apk} has no arm64-v8a libraries.`);
  assert(jsBundle != null, `${apk} has no assets/index.android.bundle.`);

  return {
    apk: zip.length,
    libs: sortedRecord(libs),
    dex,
    jsBundle,
    assets,
    resources,
  };
};

const endOfCentralDirectory = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const centralDirectoryHeader = 0x02014b50;

/**
 * One build's sizes, as `baselines.json` holds them by key, with the runner
 * image that built it.
 */
export const AppSizeEntry = /*#__PURE__*/ object(
  { image: String },
  /*#__PURE__*/ record(
    String,
    /*#__PURE__*/ union(String, Number, /*#__PURE__*/ record(String, Number)),
  ),
);
export interface AppSizeEntry extends InferType<typeof AppSizeEntry> {}

/**
 * Compares a build's sizes with its baseline, which is missing when
 * `baselines.json` has no entry for the key, into a Markdown table for the job
 * summary and a warning when something differs.
 */
export const compareAppSize = ({
  key,
  baseline,
  entry,
}: {
  key: string;
  baseline: AppSizeEntry | undefined;
  entry: AppSizeEntry;
}): { readonly summary: string; readonly warning: string | null } => {
  const before =
    baseline == null ? new Map<string, number>() : flatten(baseline);
  const after = flatten(entry);
  const rows = [
    ...after.keys(),
    ...[...before.keys()].filter((name) => !after.has(name)),
  ].map((name) => {
    const was = before.get(name);
    const now = after.get(name);
    const difference =
      was == null
        ? "new"
        : now == null
          ? "removed"
          : now === was
            ? null
            : `${now > was ? "+" : "-"}${bytes(Math.abs(now - was))}`;
    return { name, was, now, difference };
  });
  const changed = rows.filter((row) => row.difference != null).length;

  return {
    summary: [
      `### App size: ${key}`,
      "",
      baseline == null
        ? `Measured on ${entry.image}. \`bench/app-size/baselines.json\` has no entry for it.`
        : `Measured on ${entry.image}, the baseline on ${baseline.image}.`,
      "",
      "| Size | Baseline | Now | Difference |",
      "| :--- | ---: | ---: | ---: |",
      ...rows.map(
        ({ name, was, now, difference }) =>
          `| ${name} | ${bytes(was)} | ${bytes(now)} | ${difference ?? ""} |`,
      ),
      "",
    ].join("\n"),
    warning:
      baseline == null
        ? `bench/app-size/baselines.json has no entry for ${key}.`
        : changed > 0
          ? `${changed} of ${key}'s sizes differ from bench/app-size/baselines.json.`
          : null,
  };
};

/** An entry's sizes by name, nested ones as `<name> / <part>`. */
const flatten = (entry: AppSizeEntry): ReadonlyMap<string, number> =>
  new Map(
    Object.entries(entry).flatMap(
      ([name, value]): ReadonlyArray<readonly [string, number]> =>
        typeof value === "number"
          ? [[name, value]]
          : typeof value === "object"
            ? Object.entries(value)
                // A Record Output's values are optional to TypeScript.
                .filter((part): part is [string, number] => part[1] != null)
                .map(([part, size]) => [`${name} / ${part}`, size])
            : [],
    ),
  );

const bytes = (value: number | undefined): string =>
  value?.toLocaleString("en-US") ?? "";

const sortedRecord = (
  entries: Iterable<readonly [string, number]>,
): ReadonlyRecord<string, number> =>
  Object.fromEntries([...entries].toSorted(([a], [b]) => (a < b ? -1 : 1)));

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      key: { type: "string" },
      image: { type: "string" },
      app: { type: "string" },
      "link-map": { type: "string" },
      apk: { type: "string" },
      baselines: {
        type: "string",
        default: fileURLToPath(new URL("baselines.json", import.meta.url)),
      },
      out: { type: "string" },
      summary: { type: "string" },
    },
  });
  const { key, image, app, apk, out, summary } = values;
  const linkMap = values["link-map"];
  assert(
    key != null && image != null && out != null && summary != null,
    "Pass --key, --image, --out and --summary.",
  );
  const size =
    apk != null && app == null && linkMap == null
      ? measureAndroidApp(apk)
      : apk == null && app != null && linkMap != null
        ? measureIosApp({ app, linkMap })
        : null;
  assert(size != null, "Pass either --apk, or --app and --link-map.");

  const entry: AppSizeEntry = { image, ...size };
  const baselines = getOrThrow(
    record(String, AppSizeEntry).fromUnknown(
      JSON.parse(readFileSync(values.baselines, "utf8")),
    ),
  );
  const { summary: table, warning } = compareAppSize({
    key,
    baseline: baselines[key],
    entry,
  });

  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, `${key}.json`),
    `${JSON.stringify({ [key]: entry }, null, 2)}\n`,
  );
  appendFileSync(summary, table);
  if (warning != null)
    process.stdout.write(`::warning title=App size::${warning}\n`);
}
