"use client";

import { leancase } from "@evolu/common";
import { useId, useState } from "react";

const exampleText = [
  "I noticed people write like this. It's faster to type.",
  "See https://evolu.dev/docs/api-reference/common/Leancase, thanks @Steida!",
  "Code like `toLowerCase()` keeps its case (and so does #LocalFirst).",
].join("\n");

const labelClassName =
  "mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

const textareaClassName =
  "w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-base text-zinc-800 sm:text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export const LeancaseConverter = (): React.ReactElement => {
  const id = useId();
  const [text, setText] = useState(exampleText);
  const result = leancase(text);
  const status =
    result === text
      ? "your text is already leancase"
      : leancase(result) === result
        ? "converting the result again changes nothing"
        : "converting the result again changed it, please open an issue";

  return (
    <div className="not-prose my-8 grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor={`${id}-text`} className={labelClassName}>
          your text
        </label>
        <textarea
          id={`${id}-text`}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          rows={7}
          spellCheck={false}
          className={textareaClassName}
        />
      </div>
      <div>
        <label htmlFor={`${id}-result`} className={labelClassName}>
          leancase
        </label>
        <textarea
          id={`${id}-result`}
          value={result}
          readOnly
          rows={7}
          spellCheck={false}
          className={textareaClassName}
        />
      </div>
      <p
        role="status"
        className="text-sm text-zinc-500 sm:col-span-2 dark:text-zinc-400"
      >
        {status}
      </p>
    </div>
  );
};
