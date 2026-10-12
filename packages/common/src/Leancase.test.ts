import * as fc from "fast-check";
import { describe, test } from "node:test";
import { assertEqual, assertErr, assertOk, assertTrue } from "./Assert.ts";
import { leancase, LeancasedString } from "./Leancase.ts";

describe("leancase", () => {
  test("lowercases sentence starts, names, acronyms, and the pronoun I", () => {
    assertEqual(
      leancase("I write AI tools in Lean, WASM, and C"),
      "i write ai tools in lean, wasm, and c",
    );
  });

  test("removes the final period of every line", () => {
    assertEqual(
      leancase("First line.\nSecond line.\n\nNew paragraph."),
      "first line\nsecond line\n\nnew paragraph",
    );
  });

  test("keeps periods between sentences on the same line", () => {
    assertEqual(leancase("One. Two. Three."), "one. two. three");
    assertEqual(leancase("Version 1.2 is out."), "version 1.2 is out");
  });

  test("keeps punctuation that carries meaning", () => {
    assertEqual(
      leancase("Really?\nWow!\nNote:\nIt's AI-generated, right"),
      "really?\nwow!\nnote:\nit's ai-generated, right",
    );
  });

  test("keeps ellipses", () => {
    assertEqual(leancase("Wait...\nHmm..\nWell…"), "wait...\nhmm..\nwell…");
    assertEqual(leancase("Wait. .."), "wait ..");
  });

  test("removes the final period of an abbreviation", () => {
    assertEqual(
      leancase("Apples, pears, etc.\nMade in the U.S."),
      "apples, pears, etc\nmade in the u.s",
    );
  });

  test("looks through closing marks", () => {
    assertEqual(
      leancase(
        [
          "(An aside.)",
          "[A note.]",
          'He said "Stop."',
          "She said 'Go.'",
          "“Curly.”",
          "‘Single.’",
          "**Bold.**",
          "_Emphasis._",
          "(Nested.)”",
        ].join("\n"),
      ),
      [
        "(an aside)",
        "[a note]",
        'he said "stop"',
        "she said 'go'",
        "“curly”",
        "‘single’",
        "**bold**",
        "_emphasis_",
        "(nested)”",
      ].join("\n"),
    );
  });

  test("keeps trailing whitespace", () => {
    assertEqual(leancase("End.  \nNext. \t"), "end  \nnext \t");
  });

  test("removes every single period of the trailing run", () => {
    assertEqual(leancase("Wait. ."), "wait ");
    assertEqual(leancase("Wait.) ."), "wait) ");
    assertEqual(leancase("A.\u00A0\nB.!\nC.`\nD.}"), "a\u00A0\nb.!\nc.`\nd.}");
  });

  test("keeps a line without content", () => {
    assertEqual(leancase("A.\n.\n. .\n.)\nB."), "a\n.\n. .\n.)\nb");
    assertEqual(leancase("A\r.\nB"), "a\r.\nb");
  });

  test("keeps every kind of line break", () => {
    assertEqual(leancase("A.\r\nB.\rC.\nD."), "a\r\nb\rc\nd");
    assertEqual(leancase("Trailing break.\n"), "trailing break\n");
  });

  test("keeps inline code", () => {
    assertEqual(
      leancase("Call `toLeancase()` Now."),
      "call `toLeancase()` now",
    );
    assertEqual(leancase("Run `make.`"), "run `make.`");
    assertEqual(leancase("Use `Foo`."), "use `Foo`");
    assertEqual(leancase("Use ``A ` B`` and `C`."), "use ``A ` B`` and `C`");
    assertEqual(leancase("Use `A`` B` C."), "use `A`` B` c");
    assertEqual(leancase("`A`."), "`A`");
  });

  test("treats unmatched backticks as text", () => {
    assertEqual(leancase("An `Open Tick."), "an `open tick");
    assertEqual(leancase("Mismatched ``A` B."), "mismatched ``a` b");
  });

  test("keeps inline code within one line", () => {
    assertEqual(leancase("A `B\nC` D."), "a `b\nc` d");
  });

  test("keeps fenced code blocks", () => {
    assertEqual(
      leancase("Example:\n```TS\nconst A = 1.\n```\nDone."),
      "example:\n```TS\nconst A = 1.\n```\ndone",
    );
    assertEqual(
      leancase("Indented:\n   ```\n   Keep.\n   ```\nDone."),
      "indented:\n   ```\n   Keep.\n   ```\ndone",
    );
    assertEqual(leancase("```TS.\nA.\n```"), "```TS.\nA.\n```");
  });

  test("closes a fence only with at least as many backticks", () => {
    assertEqual(
      leancase("````\n```\nStill Code.\n````\nProse."),
      "````\n```\nStill Code.\n````\nprose",
    );
    assertEqual(
      leancase("```\nCode.\n``` Not A Fence\nCode.\n```\nProse."),
      "```\nCode.\n``` Not A Fence\nCode.\n```\nprose",
    );
    assertEqual(leancase("```\nX\n````\nY."), "```\nX\n````\ny");
  });

  test("closes a fence with trailing spaces or tabs", () => {
    assertEqual(leancase("```\nX\n```\t\nY."), "```\nX\n```\t\ny");
    assertEqual(leancase("```\nX\n``` \nY."), "```\nX\n``` \ny");
  });

  test("closes a fence only with up to three spaces of indentation", () => {
    assertEqual(leancase("```\nX\n    ```\nY."), "```\nX\n    ```\nY.");
    assertEqual(leancase("```\nX\n\t```\nY."), "```\nX\n\t```\nY.");
  });

  test("opens a fence only with three backticks and no other backtick", () => {
    assertEqual(leancase("```A`B\nX."), "```a`b\nx");
    assertEqual(leancase("``\nX."), "``\nx");
  });

  test("keeps an unclosed fence to the end", () => {
    assertEqual(
      leancase("Code:\n```\nKeep It.\nAnd This."),
      "code:\n```\nKeep It.\nAnd This.",
    );
  });

  test("does not open a fence indented by four spaces or a tab", () => {
    assertEqual(leancase("    ```\nText."), "    ```\ntext");
    assertEqual(leancase("\t```\nText."), "\t```\ntext");
  });

  test("keeps URLs with a scheme", () => {
    assertEqual(
      leancase("See https://example.com/Docs."),
      "see https://example.com/Docs",
    );
    assertEqual(
      // A URL is kept as written, never normalized.
      leancase("Visit HTTPS://Example.com/A?B=C#D now."),
      "visit HTTPS://Example.com/A?B=C#D now",
    );
    assertEqual(
      leancase("Open Git+SSH://Host/Repo."),
      "open Git+SSH://Host/Repo",
    );
    assertEqual(leancase("Open X-Y+Z2://Host."), "open X-Y+Z2://Host");
  });

  test("starts a URL scheme after a period", () => {
    assertEqual(
      leancase("Thanks.https://example.com/A."),
      "thanks.https://example.com/A",
    );
    assertEqual(
      leancase("Com.Example.App://Callback"),
      "com.example.App://Callback",
    );
  });

  test("keeps URLs glued to text", () => {
    assertEqual(
      leancase("詳細はhttps://example.com/Docsを参照"),
      "詳細はhttps://example.com/Docsを参照",
    );
    assertEqual(
      leancase("ดูที่https://example.com/Path"),
      "ดูที่https://example.com/Path",
    );
    assertEqual(leancase("Éhttps://A"), "éhttps://A");
    assertEqual(leancase("_https://A"), "_https://A");
    assertEqual(leancase("@https://A/B"), "@https://A/B");
    assertEqual(leancase("#https://A/B."), "#https://A/B");
    assertEqual(leancase("1https://A"), "1https://A");
  });

  test("matches a URL scheme case-insensitively", () => {
    const once = leancase("\u212A://)https://X(a.)");
    assertEqual(once, "\u212A://)https://X(a)");
    assertEqual(leancase(once), once);
  });

  test("converts long runs of scheme characters in linear time", () => {
    // A quadratic scan takes seconds here; a linear one takes about 1 ms.
    const text = "-a-A".repeat(25_000);
    const start = performance.now();
    assertEqual(leancase(text), text.toLowerCase());
    assertTrue(performance.now() - start < 500);
  });

  test("converts many unmatched backtick runs in linear time", () => {
    let text = "";
    for (let length = 1; text.length < 1_000_000; length++)
      text += "`".repeat(length) + "x";
    const start = performance.now();
    assertEqual(leancase(text), text);
    assertTrue(performance.now() - start < 500);
  });

  test("ends URLs before trailing punctuation", () => {
    assertEqual(
      leancase("(See https://example.com/A.)"),
      "(see https://example.com/A)",
    );
    assertEqual(
      leancase("Links: https://a.com/X, https://b.com/Y; Done."),
      "links: https://a.com/X, https://b.com/Y; done",
    );
    assertEqual(
      leancase('Quote "https://example.com/A".'),
      'quote "https://example.com/A"',
    );
    assertEqual(
      leancase("Wait https://example.com/A..."),
      "wait https://example.com/A...",
    );
    assertEqual(
      leancase("Angle <https://example.com/A>."),
      "angle <https://example.com/A>",
    );
    assertEqual(leancase("https://A`B"), "https://A`b");
    assertEqual(leancase("https://A<B"), "https://A<b");
    assertEqual(
      leancase("https://A>B https://C\tD https://E\u00A0F"),
      "https://A>b https://C\td https://E\u00A0f",
    );
    assertEqual(leancase("See https://A/B.*"), "see https://A/B*");
    assertEqual(leancase("See https://A/B._"), "see https://A/B_");
    assertEqual(leancase("“https://A/B.”"), "“https://A/B”");
    assertEqual(leancase('See "https://A/B."'), 'see "https://A/B"');
    assertEqual(leancase("'https://A/B.'"), "'https://A/B'");
    assertEqual(leancase("‘https://A/B.’"), "‘https://A/B’");
    assertEqual(leancase("[See https://A/B.]"), "[see https://A/B]");
  });

  test("keeps balanced closing brackets in URLs", () => {
    assertEqual(
      leancase("Read https://en.wikipedia.org/wiki/Lean_(proof_assistant)."),
      "read https://en.wikipedia.org/wiki/Lean_(proof_assistant)",
    );
    assertEqual(
      leancase("Read [Docs](https://example.com/A)."),
      "read [docs](https://example.com/A)",
    );
    assertEqual(
      leancase("(See https://a.com/(B.))"),
      "(see https://a.com/(B.))",
    );
  });

  test("lowercases bare domains with their paths", () => {
    assertEqual(leancase("See evolu.dev/Docs."), "see evolu.dev/docs");
    assertEqual(leancase("bit.ly/AbC"), "bit.ly/abc");
  });

  test("keeps @handles and #hashtags", () => {
    assertEqual(
      leancase("Thanks @Steida for #LocalFirst."),
      "thanks @Steida for #LocalFirst",
    );
    assertEqual(leancase("(@Evolu_HQ)"), "(@Evolu_HQ)");
    assertEqual(leancase("#Café2026."), "#Café2026");
    assertEqual(leancase("#Cafe\u0301X"), "#Cafe\u0301X");
    assertEqual(leancase("#Web3Dev"), "#Web3Dev");
    assertEqual(leancase("_Thanks @Steida._"), "_thanks @Steida._");
  });

  test("lowercases emails, C#, and a lone @ or #", () => {
    assertEqual(
      leancase("Mail Daniel@example.com about C# and F#."),
      "mail daniel@example.com about c# and f#",
    );
    assertEqual(leancase("A @ B # C"), "a @ b # c");
  });

  test("does not start a tag after a letter, mark, digit, or underscore", () => {
    assertEqual(leancase("_@Handle _#Tag"), "_@handle _#tag");
    assertEqual(leancase("e\u0301@Handle"), "e\u0301@handle");
    assertEqual(leancase("1@Handle"), "1@handle");
    assertEqual(leancase("\u{1D400}@Handle"), "\u{1D400}@handle");
  });

  test("uses Unicode lowercasing without locale rules", () => {
    assertEqual(
      leancase("İSTANBUL. ΟΔΟΣ."),
      "i\u0307stanbul. \u03BF\u03B4\u03BF\u03C2",
    );
    assertEqual(leancase("ẞ \u212Aelvin"), "ß kelvin");
    assertEqual(leancase("ΟΔΟΣ`X`"), "\u03BF\u03B4\u03BF\u03C2`X`");
  });

  test("leaves leancase text unchanged", () => {
    for (const text of [
      "",
      " ",
      "\n",
      "already leancase",
      "one. two\nthree?",
      "keep `Code` and https://example.com/Docs",
    ])
      assertEqual(leancase(text), text);
  });
});

describe("LeancasedString", () => {
  test("accepts leancase text", () => {
    assertOk(LeancasedString.fromUnknown("hello. world"), "hello. world");
    assertOk(LeancasedString.fromUnknown(""), "");
    assertOk(LeancasedString.fromUnknown("thanks @Steida"), "thanks @Steida");
  });

  test("rejects text that leancase would change", () => {
    const result = LeancasedString.fromUnknown("Hello.");
    assertErr(result, { type: "Leancased", value: "Hello." });
    assertEqual(
      LeancasedString.formatError(result.error),
      'The value "Hello." must be in leancase.',
    );
    assertErr(LeancasedString.fromUnknown("hello."));
    assertErr(LeancasedString.fromUnknown(42));
  });
});

describe("leancase properties", () => {
  const text = fc.oneof(
    fc
      .array(
        fc.constantFrom(
          "a",
          "B",
          "I",
          ".",
          "..",
          " ",
          "\t",
          "\n",
          "\r",
          "\r\n",
          "`",
          "```",
          "   ```",
          "    ```",
          "@",
          "#",
          "_",
          "(",
          ")",
          "[",
          "]",
          '"',
          "'",
          "“",
          "”",
          "‘",
          "’",
          "*",
          "?",
          "!",
          ",",
          ":",
          "<",
          ">",
          "+",
          "-",
          "/",
          "https://",
          "HTTP://",
          "x://",
          "İ",
          "Σ",
          "\u0307",
          "\u212A",
          "\u017F",
          "日",
          "é",
          "1",
          "h",
          "-a",
          "a.b://",
          "ẞ",
          "…",
        ),
        { maxLength: 40, size: "max" },
      )
      .map((parts) => parts.join("")),
    fc.string({ unit: "binary", maxLength: 40, size: "max" }),
  );

  const fold = (value: string): string =>
    value.replaceAll(".", "").toLowerCase().replaceAll("ς", "σ");

  const lineContents = (value: string): ReadonlyArray<string> =>
    value.split(/\r\n|\n|\r/u).map((line) =>
      line
        .replace(/[.\s)\]"'”’*_]*$/u, "")
        .toLowerCase()
        .replaceAll("ς", "σ"),
    );

  test("leancase is idempotent", () => {
    fc.assert(
      fc.property(text, (value) => {
        const once = leancase(value);
        assertEqual(leancase(once), once);
      }),
      { numRuns: 5000 },
    );
  });

  test("leancase changes only case and removes only periods", () => {
    fc.assert(
      fc.property(text, (value) => {
        const result = leancase(value);
        assertEqual(fold(result), fold(value));
        assertEqual(lineContents(result), lineContents(value));
        assertTrue(result.length <= value.toLowerCase().length);
      }),
      { numRuns: 5000 },
    );
  });

  test("leancase returns a valid LeancasedString", () => {
    fc.assert(
      fc.property(text, (value) => {
        assertTrue(LeancasedString.is(leancase(value)));
      }),
      { numRuns: 1000 },
    );
  });
});
