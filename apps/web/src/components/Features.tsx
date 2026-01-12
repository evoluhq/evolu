"use client";

import {
  type MotionValue,
  motion,
  useMotionTemplate,
  useMotionValue,
} from "motion/react";

import { GridPattern } from "@/components/GridPattern";
import {
  IconBolt,
  IconBrandJavascript,
  IconBrandOpenSource,
  IconBrandTypescript,
  IconCode,
  IconDevices,
  IconFilter,
  IconLayersIntersect2,
  IconLibrary,
  IconLivePhoto,
  IconPackage,
  IconProps,
  IconShieldCheck,
  IconShieldLock,
  IconSql,
  IconSubtask,
  IconTrash,
} from "@tabler/icons-react";

interface Feature {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<IconProps>;
  pattern: Omit<
    React.ComponentPropsWithoutRef<typeof GridPattern>,
    "width" | "height"
  >;
}

const patterns: Array<Feature["pattern"]> = [
  {
    y: 16,
    x: 4,
    squares: [
      [0, 1],
      [1, 3],
    ],
  },
  {
    y: -6,
    x: -1,
    squares: [
      [-1, 2],
      [1, 3],
    ],
  },
  {
    y: 32,
    x: 10,
    squares: [
      [0, 2],
      [1, 4],
    ],
  },
  {
    y: 22,
    x: -14,
    squares: [
      [1, 1],
      [0, 4],
    ],
  },
  { y: -2, x: 8, squares: [[0, 1]] },
  {
    y: 14,
    x: -6,
    squares: [
      [1, 2],
      [0, 3],
    ],
  },
  {
    y: -10,
    x: 16,
    squares: [
      [-1, 1],
      [1, 2],
    ],
  },
  {
    y: 28,
    x: -2,
    squares: [
      [0, 3],
      [1, 1],
    ],
  },
  {
    y: 6,
    x: 12,
    squares: [
      [1, 4],
      [-1, 2],
    ],
  },
  { y: -14, x: -8, squares: [[0, 2]] },
  {
    y: 20,
    x: 6,
    squares: [
      [1, 1],
      [0, 3],
    ],
  },
  {
    y: 4,
    x: -12,
    squares: [
      [-1, 3],
      [1, 2],
    ],
  },
  {
    y: -8,
    x: 14,
    squares: [
      [0, 4],
      [1, 1],
    ],
  },
  { y: 18, x: -4, squares: [[1, 3]] },
  {
    y: 10,
    x: 8,
    squares: [
      [-1, 1],
      [0, 2],
    ],
  },
  {
    y: -4,
    x: -6,
    squares: [
      [1, 2],
      [0, 4],
    ],
  },
];

const features: Array<Feature> = [
  {
    id: "#standard-library",
    name: "Standard library",
    description: "A tree-shakable TypeScript library that fits in your head.",
    icon: IconLibrary,
    pattern: patterns[0],
  },
  {
    id: "#safe-async",
    name: "Safe async",
    description: "Structured concurrency built on JavaScript Promises.",
    icon: IconSubtask,
    pattern: patterns[1],
  },
  {
    id: "#automatic-cleanup",
    name: "Automatic cleanup",
    description: "Resource Management with the new JS using keyword.",
    icon: IconTrash,
    pattern: patterns[2],
  },
  {
    id: "#idiomatic-javascript",
    name: "Idiomatic JavaScript",
    description: "No runtime overhead, native stack traces, debug-friendly.",
    icon: IconBrandJavascript,
    pattern: patterns[3],
  },
  {
    id: "#batteries-included",
    name: "Batteries included",
    description: "Array, Set, and other helpers. Eq, Order, Time, and more.",
    icon: IconPackage,
    pattern: patterns[6],
  },
  {
    id: "#typed-errors",
    name: "Typed errors",
    description: "No try/catch needed, exhaustive error handling.",
    icon: IconShieldCheck,
    pattern: patterns[7],
  },
  {
    id: "#universal",
    name: "Universal",
    description: "Web, React Native, Electron, Solid, Vue, Svelte, and more.",
    icon: IconDevices,
    pattern: patterns[5],
  },
  {
    id: "#developer-experience",
    name: "Developer Experience",
    description: "Readable source code, tests, DX-first API.",
    icon: IconCode,
    pattern: patterns[4],
  },
  {
    id: "#runtime-validation",
    name: "Runtime validation",
    description: "Typed errors and formatters. All refinements branded.",
    icon: IconFilter,
    pattern: patterns[8],
  },
  {
    id: "#sqlite",
    name: "SQLite",
    description: "Local-first storage with SQLite on all platforms.",
    icon: IconSql,
    pattern: patterns[9],
  },
  {
    id: "#private-by-design",
    name: "Private by design",
    description: "E2E encrypted sync and backup. Post-quantum safe.",
    icon: IconShieldLock,
    pattern: patterns[10],
  },
  {
    id: "#reactive",
    name: "Reactive",
    description: "Reactive queries with React Suspense support.",
    icon: IconBolt,
    pattern: patterns[11],
  },
  {
    id: "#realtime",
    name: "Real-time",
    description: "WebSocket by default, other transports possible.",
    icon: IconLivePhoto,
    pattern: patterns[12],
  },
  {
    id: "#type-safe-sql",
    name: "Type-safe SQL",
    description: "Typed database schema and SQL with Kysely.",
    icon: IconBrandTypescript,
    pattern: patterns[13],
  },
  {
    id: "#crdt",
    name: "CRDT",
    description: "Merging changes without conflicts. History preserved.",
    icon: IconLayersIntersect2,
    pattern: patterns[14],
  },
  {
    id: "#free",
    name: "Free",
    description: "MIT License, self-hostable Relay server.",
    icon: IconBrandOpenSource,
    pattern: patterns[15],
  },
];

export function FeatureIcon({
  icon: Icon,
}: {
  icon: Feature["icon"];
}): React.ReactElement {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white ring-1 ring-zinc-900/25 backdrop-blur-[2px] transition duration-300 group-hover:bg-white/50 group-hover:ring-zinc-900/50 dark:bg-white/10 dark:ring-white/15 dark:group-hover:bg-zinc-300/10 dark:group-hover:ring-zinc-400">
      <Icon className="h-5 w-5 stroke-zinc-700 transition-colors duration-300 group-hover:stroke-zinc-900 dark:stroke-zinc-400 dark:group-hover:stroke-zinc-400" />
    </div>
  );
}

function FeaturePattern({
  mouseX,
  mouseY,
  ...gridProps
}: Feature["pattern"] & {
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
}) {
  const maskImage = useMotionTemplate`radial-gradient(180px at ${mouseX}px ${mouseY}px, white, transparent)`;
  const style = { maskImage, WebkitMaskImage: maskImage };

  return (
    <div className="pointer-events-none">
      <div className="absolute inset-0 rounded-2xl mask-[linear-gradient(white,transparent)] transition duration-300 group-hover:opacity-50">
        <GridPattern
          width={72}
          height={56}
          className="absolute inset-x-0 inset-y-[-30%] h-[160%] w-full skew-y-18 fill-black/2 stroke-black/5 dark:fill-white/1 dark:stroke-white/2.5"
          {...gridProps}
        />
      </div>
      <motion.div
        className="absolute inset-0 rounded-2xl bg-linear-to-r from-zinc-100 to-zinc-200 opacity-0 transition duration-300 group-hover:opacity-100 dark:from-zinc-900 dark:to-zinc-800"
        style={style}
      />
      <motion.div
        className="absolute inset-0 rounded-2xl opacity-0 mix-blend-overlay transition duration-300 group-hover:opacity-100"
        style={style}
      >
        <GridPattern
          width={72}
          height={56}
          className="absolute inset-x-0 inset-y-[-30%] h-[160%] w-full skew-y-18 fill-black/50 stroke-black/70 dark:fill-white/2.5 dark:stroke-white/10"
          {...gridProps}
        />
      </motion.div>
    </div>
  );
}

function Feature({ feature }: { feature: Feature }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function onMouseMove({
    currentTarget,
    clientX,
    clientY,
  }: React.MouseEvent<HTMLDivElement>) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  return (
    <div
      key={feature.id}
      onMouseMove={onMouseMove}
      className="group relative flex rounded-2xl bg-zinc-50 transition-shadow hover:shadow-md hover:shadow-zinc-900/5 dark:bg-white/2.5 dark:hover:shadow-black/5"
    >
      <FeaturePattern {...feature.pattern} mouseX={mouseX} mouseY={mouseY} />
      <div className="absolute inset-0 rounded-2xl ring-1 ring-zinc-900/7.5 ring-inset group-hover:ring-zinc-900/10 dark:ring-white/10 dark:group-hover:ring-white/20" />
      <div className="relative rounded-2xl p-4 pt-4 pb-4">
        <div className="mb-2 flex items-center gap-3">
          <FeatureIcon icon={feature.icon} />
          <h3 className="text-sm leading-7 font-semibold text-zinc-900 dark:text-white">
            <span>
              <span className="absolute inset-0 rounded-2xl" />
              {feature.name}
            </span>
          </h3>
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {feature.description}
        </p>
      </div>
    </div>
  );
}

export function Features(): React.ReactElement {
  return (
    <div className="xl:max-w-none">
      <div className="not-prose mt-4 grid grid-cols-1 gap-2 pt-10 sm:grid-cols-2 lg:gap-8 xl:grid-cols-4">
        {features.map((feature) => (
          <Feature key={feature.id} feature={feature} />
        ))}
      </div>
    </div>
  );
}
