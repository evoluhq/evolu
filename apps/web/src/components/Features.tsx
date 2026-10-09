"use client";

import {
  type MotionValue,
  motion,
  useMotionTemplate,
  useMotionValue,
} from "motion/react";
import clsx from "clsx";
import Link from "next/link";

import { GridPattern } from "@/components/GridPattern";
import {
  IconArrowsSplit2,
  IconBook,
  IconBrandTypescript,
  IconBug,
  IconEye,
  IconFeather,
  IconFilter,
  IconPackage,
  type IconProps,
  IconShieldLock,
  IconSubtask,
  IconTrash,
} from "@tabler/icons-react";

interface Feature {
  name: string;
  description: string;
  href: string;
  icon: React.ComponentType<IconProps>;
}

interface Pattern {
  y: number;
  x: number;
  squares: Array<[number, number]>;
}

const patterns: Array<Pattern> = [
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
];

const features: Array<Feature> = [
  {
    name: "Simple",
    description:
      "Data lives in SQLite tables you query with type-safe SQL. No complex abstractions.",
    href: "/docs/local-first#query-data",
    icon: IconFeather,
  },
  {
    name: "Strict",
    description:
      "All constraints are branded types. Broken invariants throw before invalid state spreads.",
    href: "/docs/api-reference/common/Type",
    icon: IconFilter,
  },
  {
    name: "Secure",
    description: "End-to-end encrypted and post-quantum resistant by default.",
    href: "/docs/privacy#post-quantum-resistance",
    icon: IconShieldLock,
  },
  {
    name: "Honest",
    description:
      "Limits are documented: what relays can see, and the trade-offs behind design decisions.",
    href: "/docs/privacy#relay-blindness-by-design",
    icon: IconEye,
  },
];

const FeatureIcon = ({
  icon: Icon,
}: {
  icon: Feature["icon"];
}): React.ReactElement => (
  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white ring-1 ring-zinc-900/25 backdrop-blur-[2px] transition duration-300 group-hover:bg-white/50 group-hover:ring-zinc-900/50 dark:bg-white/10 dark:ring-white/15 dark:group-hover:bg-zinc-300/10 dark:group-hover:ring-zinc-400">
    <Icon className="h-5 w-5 stroke-zinc-700 transition-colors duration-300 group-hover:stroke-zinc-900 dark:stroke-zinc-400 dark:group-hover:stroke-zinc-400" />
  </div>
);

const FeaturePattern = ({
  mouseX,
  mouseY,
  pattern,
}: {
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
  pattern: (typeof patterns)[number];
}) => {
  const maskImage = useMotionTemplate`radial-gradient(180px at ${mouseX}px ${mouseY}px, white, transparent)`;
  const style = { maskImage, WebkitMaskImage: maskImage };

  return (
    <div className="pointer-events-none">
      <div className="absolute inset-0 rounded-2xl mask-[linear-gradient(white,transparent)] transition duration-300 group-hover:opacity-50">
        <GridPattern
          width={72}
          height={56}
          className="absolute inset-x-0 inset-y-[-30%] h-[160%] w-full skew-y-18 fill-black/2 stroke-black/5 dark:fill-white/1 dark:stroke-white/2.5"
          {...pattern}
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
          {...pattern}
        />
      </motion.div>
    </div>
  );
};

const Feature = ({ feature, index }: { feature: Feature; index: number }) => {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const onMouseMove = ({
    currentTarget,
    clientX,
    clientY,
  }: React.MouseEvent<HTMLDivElement>) => {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  };

  return (
    <div
      key={feature.name}
      onMouseMove={onMouseMove}
      className="group relative flex rounded-2xl bg-zinc-50 transition-shadow hover:shadow-md hover:shadow-zinc-900/5 dark:bg-white/2.5 dark:hover:shadow-black/5"
    >
      <FeaturePattern
        pattern={patterns[index]}
        mouseX={mouseX}
        mouseY={mouseY}
      />
      <div className="absolute inset-0 rounded-2xl ring-1 ring-zinc-900/7.5 ring-inset group-hover:ring-zinc-900/10 dark:ring-white/10 dark:group-hover:ring-white/20" />
      <div className="relative w-full rounded-2xl p-4 pt-4 pb-4">
        <div className="mb-2 flex items-center gap-3">
          <FeatureIcon icon={feature.icon} />
          <h3 className="text-sm leading-7 font-semibold text-zinc-900 dark:text-white">
            <Link href={feature.href}>
              <span className="absolute inset-0 rounded-2xl" />
              {feature.name}
            </Link>
          </h3>
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {feature.description}
        </p>
      </div>
    </div>
  );
};

const FeatureGrid = ({
  features,
  columns,
}: {
  features: ReadonlyArray<Feature>;
  columns: 2 | 4;
}): React.ReactElement => (
  <div
    className={clsx(
      "not-prose grid grid-cols-1 gap-2 sm:grid-cols-2 lg:gap-8",
      columns === 4 && "xl:grid-cols-4",
    )}
  >
    {features.map((feature, index) => (
      <Feature key={feature.name} feature={feature} index={index} />
    ))}
  </div>
);

export const Features = (): React.ReactElement => (
  <FeatureGrid features={features} columns={4} />
);

/** Evolu Library features. The bundle size comes from the bundle snapshot. */
export const LibraryFeatures = ({
  bundleSize,
}: {
  bundleSize: string;
}): React.ReactElement => (
  <FeatureGrid
    columns={2}
    features={[
      {
        name: "Result",
        description: "Typed errors. No try/catch. Exhaustive error handling.",
        href: "/docs/api-reference/common/Result",
        icon: IconArrowsSplit2,
      },
      {
        name: "Type",
        description:
          "Runtime types with typed errors and formatters. All constraints are branded.",
        href: "/docs/api-reference/common/Type",
        icon: IconBrandTypescript,
      },
      {
        name: "Task",
        description:
          "Structured concurrency with dependency injection. Plain async functions, no generators.",
        href: "/docs/api-reference/common/Task",
        icon: IconSubtask,
      },
      {
        name: "Batteries included",
        description:
          "Helpers for Array, Object, Set, String, Eq, Order, Time, and more.",
        href: "/docs/library",
        icon: IconPackage,
      },
      {
        name: "Automatic cleanup",
        description: "Resource management with the JavaScript using keyword.",
        href: "/docs/resource-management",
        icon: IconTrash,
      },
      {
        name: "Assertions",
        description:
          "Invariants types can't express are asserted at runtime. Use them in your tests too.",
        href: "/docs/api-reference/common/Assert",
        icon: IconBug,
      },
      {
        name: "Conventions",
        description:
          "One documented style for names, errors, and dependencies, so every module reads the same.",
        href: "/docs/conventions",
        icon: IconBook,
      },
      {
        name: "Lightweight",
        description: `Tree-shakable, with few dependencies. Types, Tasks, and logging in ${bundleSize}.`,
        href: "/docs/library",
        icon: IconFeather,
      },
    ]}
  />
);
