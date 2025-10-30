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
  IconBrandOpenSource,
  IconBrandTypescript,
  IconClick,
  IconLayersIntersect2,
  IconLibrary,
  IconShieldLock,
  IconSql,
  TablerIcon,
} from "@tabler/icons-react";

interface Feature {
  id: string;
  name: string;
  description: string;
  icon: TablerIcon;
  pattern: Omit<
    React.ComponentPropsWithoutRef<typeof GridPattern>,
    "width" | "height"
  >;
}

const features: Array<Feature> = [
  {
    id: "#encrypted",
    name: "Encrypted",
    description: "End-to-end encrypted sync and backup.",
    icon: IconShieldLock,
    pattern: {
      y: -17,
      x: -10,
      squares: [],
    },
  },
  {
    id: "#library",
    name: "Library",
    description: "TypeScript library for life, code, and everything.",
    icon: IconLibrary,
    pattern: {
      y: -17,
      x: -10,
      squares: [],
    },
  },
  {
    id: "#sqlite",
    name: "SQLite",
    description: "All browsers supported, also Electron & React Native.",
    icon: IconSql,
    pattern: {
      y: -17,
      x: -10,
      squares: [],
    },
  },
  {
    id: "#crdt",
    name: "CRDT",
    description: "Merging changes without conflicts.",
    icon: IconLayersIntersect2,
    pattern: {
      y: -17,
      x: -10,
      squares: [],
    },
  },
  {
    id: "#free",
    name: "Free",
    description: "MIT License, self-hostable Relay server.",
    icon: IconBrandOpenSource,
    pattern: {
      y: -17,
      x: -10,
      squares: [],
    },
  },
  {
    id: "#type-safe",
    name: "Type-safe",
    description: "Typed database schema and SQL with Kysely.",
    icon: IconBrandTypescript,
    pattern: {
      y: -17,
      x: -10,
      squares: [],
    },
  },
  {
    id: "#reactive",
    name: "Reactive",
    description: "Reactive queries with full React Suspense support.",
    icon: IconBolt,
    pattern: {
      y: -17,
      x: -10,
      squares: [],
    },
  },
  {
    id: "#realtime",
    name: "Real-time",
    description: "WebSocket by default, other transports possible.",
    icon: IconClick,
    pattern: {
      y: -17,
      x: -10,
      squares: [],
    },
  },
  // {
  //   id: "#frameworks",
  //   name: "Frameworks",
  //   description: "Full React support. Solid/Vue/Svelte soon.",
  //   icon: IconCategory2,
  //   pattern: {
  //     y: -17,
  //     x: -10,
  //     squares: [],
  //   },
  // },
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
      <div className="relative rounded-2xl px-4 pt-4 pb-4">
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
