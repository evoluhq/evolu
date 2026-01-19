import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { cleanMdxContent } from "@/lib/llms";

interface Params {
  path: Array<string>;
}

export const GET = async (
  _request: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> => {
  const { path } = await params;

  // Handle "index" as root docs page
  const isIndex = path.length === 1 && path[0] === "index";

  // Build the path to the MDX file
  const mdxPath = isIndex ? "page.mdx" : `${path.join("/")}/page.mdx`;
  const fullPath = `${process.cwd()}/src/app/(docs)/docs/${mdxPath}`;

  // Check if file exists
  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const rawContent = fs.readFileSync(fullPath, "utf8");
    const cleanedContent = cleanMdxContent(rawContent);

    return new NextResponse(cleanedContent, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
};
