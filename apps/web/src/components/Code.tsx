"use client";

import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import clsx from "clsx";
import {
  Children,
  createContext,
  isValidElement,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { create } from "zustand";

import { Tag } from "@/components/Tag";

const languageNames: Record<string, string> = {
  js: "JavaScript",
  ts: "TypeScript",
  javascript: "JavaScript",
  typescript: "TypeScript",
  php: "PHP",
  python: "Python",
  ruby: "Ruby",
  go: "Go",
};

const getPanelTitle = ({
  title,
  language,
}: {
  title?: string;
  language?: string;
}) => {
  if (title) {
    return title;
  }
  if (language && language in languageNames) {
    return languageNames[language];
  }
  return "Code";
};

const ClipboardIcon = (props: React.ComponentPropsWithoutRef<"svg">) => (
  <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
    <path
      strokeWidth="0"
      d="M5.5 13.5v-5a2 2 0 0 1 2-2l.447-.894A2 2 0 0 1 9.737 4.5h.527a2 2 0 0 1 1.789 1.106l.447.894a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2Z"
    />
    <path
      fill="none"
      strokeLinejoin="round"
      d="M12.5 6.5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2m5 0-.447-.894a2 2 0 0 0-1.79-1.106h-.527a2 2 0 0 0-1.789 1.106L7.5 6.5m5 0-1 1h-3l-1-1"
    />
  </svg>
);

const CopyButton = ({ code }: { code: string }) => {
  const [copyCount, setCopyCount] = useState(0);
  const copied = copyCount > 0;

  useEffect(() => {
    if (copyCount > 0) {
      const timeout = setTimeout(() => {
        setCopyCount(0);
      }, 1000);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [copyCount]);

  return (
    <button
      type="button"
      className={clsx(
        "group/button text-2xs absolute top-3.5 right-4 overflow-hidden rounded-full py-1 pr-3 pl-2 font-medium opacity-0 backdrop-blur-sm transition group-hover:opacity-100 focus:opacity-100",
        copied
          ? "bg-blue-400/10 ring-1 ring-blue-400/20 ring-inset"
          : "bg-white/5 hover:bg-white/7.5 dark:bg-white/2.5 dark:hover:bg-white/5",
      )}
      onClick={() => {
        void window.navigator.clipboard.writeText(code).then(() => {
          setCopyCount((count) => count + 1);
        });
      }}
    >
      <span
        aria-hidden={copied}
        className={clsx(
          "pointer-events-none flex items-center gap-0.5 text-zinc-400 transition duration-300",
          copied && "-translate-y-1.5 opacity-0",
        )}
      >
        <ClipboardIcon className="h-5 w-5 fill-zinc-500/20 stroke-zinc-500 transition-colors group-hover/button:stroke-zinc-400" />
        Copy
      </span>
      <span
        aria-hidden={!copied}
        className={clsx(
          "pointer-events-none absolute inset-0 flex items-center justify-center text-blue-400 transition duration-300",
          !copied && "translate-y-1.5 opacity-0",
        )}
      >
        Copied!
      </span>
    </button>
  );
};

const CodePanelHeader = ({
  tag,
  label,
}: {
  tag?: string | undefined;
  label?: string | undefined;
}) => {
  if (!tag && !label) {
    return null;
  }

  return (
    <div className="flex h-9 items-center gap-2 border-y border-t-transparent border-b-white/7.5 bg-zinc-900 px-4 dark:border-b-white/5 dark:bg-white/1">
      {tag && (
        <div className="dark flex">
          <Tag variant="small">{tag}</Tag>
        </div>
      )}
      {tag && label && (
        <span className="h-0.5 w-0.5 rounded-full bg-zinc-500" />
      )}
      {label && (
        <span className="font-mono text-xs text-zinc-400">{label}</span>
      )}
    </div>
  );
};

const CodePanel = ({
  children,
  tag,
  label,
  code,
}: {
  children: React.ReactNode;
  tag?: string;
  label?: string;
  code?: string;
}) => {
  // Handle cases where children might be multiple nodes, text, or empty
  const childrenArray = Children.toArray(children);
  const child = childrenArray.length === 1 ? childrenArray[0] : null;

  if (
    isValidElement(child) &&
    typeof child.props === "object" &&
    child.props !== null
  ) {
    const props = child.props as {
      tag?: string;
      label?: string;
      code?: string;
    };
    tag = props.tag ?? tag;
    label = props.label ?? label;
    code = props.code ?? code;
  }

  // If no code prop is provided, try to extract it from children
  if (!code) {
    if (typeof children === "string") {
      code = children;
    } else if (
      childrenArray.length === 1 &&
      typeof childrenArray[0] === "string"
    ) {
      code = childrenArray[0];
    } else {
      // Try to extract text content from children
      const extractTextFromChildren = (nodes: Array<React.ReactNode>): string =>
        nodes
          .map((node) => {
            if (typeof node === "string") return node;
            if (typeof node === "number") return String(node);
            if (
              isValidElement(node) &&
              node.props &&
              typeof node.props === "object" &&
              "children" in node.props
            ) {
              return extractTextFromChildren(
                Children.toArray(node.props.children as React.ReactNode),
              );
            }
            return "";
          })
          .join("");

      code = extractTextFromChildren(childrenArray);
    }
  }

  if (!code) {
    throw new Error(
      "`CodePanel` requires a `code` prop, or a child with a `code` prop.",
    );
  }

  return (
    <div className="group dark:bg-white/2.5">
      <CodePanelHeader tag={tag} label={label} />
      <div className="relative">
        <pre className="overflow-x-auto p-4 text-xs text-white">{children}</pre>
        <CopyButton code={code} />
      </div>
    </div>
  );
};

const CodeGroupHeader = ({
  title,
  children,
  selectedIndex,
}: {
  title: string;
  children: React.ReactNode;
  selectedIndex: number;
}) => {
  const hasTabs = Children.count(children) > 1;

  if (!title && !hasTabs) {
    return null;
  }

  return (
    <div className="flex min-h-[calc(--spacing(12)+1px)] flex-wrap items-start gap-x-4 border-b border-zinc-700 bg-zinc-800 px-4 dark:border-zinc-800 dark:bg-transparent">
      {title && (
        <h3 className="mr-auto pt-3 text-xs font-semibold text-white">
          {title}
        </h3>
      )}
      {hasTabs && (
        <TabList className="-mb-px flex gap-4 overflow-x-auto text-xs font-medium [scrollbar-width:none] [-webkit-scrollbar]:hidden">
          {Children.map(children, (child, childIndex) => (
            <Tab
              className={clsx(
                "shrink-0 border-b py-3 whitespace-nowrap outline-hidden transition",
                childIndex === selectedIndex
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-zinc-400 hover:text-zinc-300",
              )}
            >
              {
                // @ts-expect-error TODO: Fix this somehow
                getPanelTitle(isValidElement(child) ? child.props : {})
              }
            </Tab>
          ))}
        </TabList>
      )}
    </div>
  );
};

const CodeGroupPanels = ({
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof CodePanel>) => {
  const hasTabs = Children.count(children) > 1;

  if (hasTabs) {
    return (
      <TabPanels>
        {Children.map(children, (child) => (
          <TabPanel>
            <CodePanel {...props}>{child}</CodePanel>
          </TabPanel>
        ))}
      </TabPanels>
    );
  }

  return <CodePanel {...props}>{children}</CodePanel>;
};

const usePreventLayoutShift = () => {
  const positionRef = useRef<HTMLElement>(null);
  const rafRef = useRef<number>(undefined);

  useEffect(
    () => () => {
      if (typeof rafRef.current !== "undefined") {
        window.cancelAnimationFrame(rafRef.current);
      }
    },
    [],
  );

  return {
    positionRef,
    preventLayoutShift(callback: () => void) {
      if (!positionRef.current) {
        return;
      }

      const initialTop = positionRef.current.getBoundingClientRect().top;

      callback();

      rafRef.current = window.requestAnimationFrame(() => {
        const newTop =
          positionRef.current?.getBoundingClientRect().top ?? initialTop;
        window.scrollBy(0, newTop - initialTop);
      });
    },
  };
};

export const usePreferredLanguageStore = /*#__PURE__*/ create<{
  preferredLanguages: Array<string>;
  addPreferredLanguage: (language: string) => void;
}>()((set) => ({
  preferredLanguages: [],
  addPreferredLanguage: (language) => {
    set((state) => ({
      preferredLanguages: [
        ...state.preferredLanguages.filter(
          (preferredLanguage) => preferredLanguage !== language,
        ),
        language,
      ],
    }));
  },
}));

const useTabGroupProps = (availableLanguages: Array<string>) => {
  const { preferredLanguages, addPreferredLanguage } =
    usePreferredLanguageStore();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeLanguage = [...availableLanguages].sort(
    (a, z) => preferredLanguages.indexOf(z) - preferredLanguages.indexOf(a),
  )[0];
  const languageIndex = availableLanguages.indexOf(activeLanguage);
  const newSelectedIndex = languageIndex === -1 ? selectedIndex : languageIndex;
  if (newSelectedIndex !== selectedIndex) {
    setSelectedIndex(newSelectedIndex);
  }

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const { positionRef, preventLayoutShift } = usePreventLayoutShift();

  return {
    as: "div" as const,
    ref: positionRef,
    selectedIndex,
    onChange: (newSelectedIndex: number) => {
      preventLayoutShift(() => {
        addPreferredLanguage(availableLanguages[newSelectedIndex]);
      });
    },
  };
};

const CodeGroupContext = createContext(false);

export const CodeGroup = ({
  children,
  title,
  ...props
}: React.ComponentPropsWithoutRef<typeof CodeGroupPanels> & {
  title: string;
}): React.ReactElement => {
  const languages =
    Children.map(children, (child) =>
      // @ts-expect-error TODO: Fix this somehow
      getPanelTitle(isValidElement(child) ? child.props : {}),
    ) ?? [];
  const tabGroupProps = useTabGroupProps(languages);
  const hasTabs = Children.count(children) > 1;

  const containerClassName =
    "my-6 overflow-hidden rounded-2xl bg-zinc-900 shadow-md dark:ring-1 dark:ring-white/10";
  const header = (
    <CodeGroupHeader title={title} selectedIndex={tabGroupProps.selectedIndex}>
      {children}
    </CodeGroupHeader>
  );
  const panels = <CodeGroupPanels {...props}>{children}</CodeGroupPanels>;

  return (
    <CodeGroupContext.Provider value={true}>
      {hasTabs ? (
        <TabGroup {...tabGroupProps} className={containerClassName}>
          <div className="not-prose">
            {header}
            {panels}
          </div>
        </TabGroup>
      ) : (
        <div className={containerClassName}>
          <div className="not-prose">
            {header}
            {panels}
          </div>
        </div>
      )}
    </CodeGroupContext.Provider>
  );
};

export const SinglePlatformCodeGroup = ({
  children,
  title,
  ...props
}: React.ComponentPropsWithoutRef<typeof CodeGroupPanels> & {
  title?: string;
}): React.ReactElement => {
  const { preferredLanguages } = usePreferredLanguageStore();
  const currentPlatform =
    preferredLanguages[preferredLanguages.length - 1] ?? "React";

  // Find the child that matches the selected platform
  const matchingChild = Children.toArray(children).find((child) => {
    if (isValidElement(child)) {
      // @ts-expect-error TODO: Fix this somehow
      const childTitle = getPanelTitle(child.props);
      return childTitle === currentPlatform;
    }
    return false;
  });

  // If no matching child found, show the first one (fallback)
  const selectedChild = matchingChild ?? Children.toArray(children)[0];

  if (!selectedChild) {
    return <div>No code available</div>;
  }

  const containerClassName =
    "my-6 overflow-hidden rounded-2xl bg-zinc-900 shadow-md dark:ring-1 dark:ring-white/10";

  return (
    <CodeGroupContext.Provider value={true}>
      <div className={containerClassName}>
        <div className="not-prose">
          {title && (
            <div className="flex min-h-[calc(--spacing(12)+1px)] items-center border-b border-zinc-700 bg-zinc-800 px-4 dark:border-zinc-800 dark:bg-transparent">
              <h3 className="text-xs font-semibold text-white">{title}</h3>
              <div className="ml-auto text-xs font-medium text-blue-400">
                {currentPlatform}
              </div>
            </div>
          )}
          <CodePanel {...props}>{selectedChild}</CodePanel>
        </div>
      </div>
    </CodeGroupContext.Provider>
  );
};

export const Code = ({
  children,
  ...props
}: React.ComponentPropsWithoutRef<"code">): React.ReactElement => {
  const isGrouped = useContext(CodeGroupContext);

  if (isGrouped) {
    if (typeof children !== "string") {
      throw new Error(
        "`Code` children must be a string when nested inside a `CodeGroup`.",
      );
    }
    return <code {...props} dangerouslySetInnerHTML={{ __html: children }} />;
  }

  return <code {...props}>{children}</code>;
};

export const Pre = ({
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof CodeGroup>):
  | React.ReactElement
  | ReactNode => {
  const isGrouped = useContext(CodeGroupContext);

  if (isGrouped) {
    return children;
  }

  return <CodeGroup {...props}>{children}</CodeGroup>;
};
