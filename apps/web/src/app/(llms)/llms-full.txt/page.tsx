import { Fragment } from "react";
import { fetchProcessedMdxPages } from "../../../lib/llms";

export default async function LLMsFullPage(): Promise<React.ReactElement> {
  const pages = await fetchProcessedMdxPages(true); // Pass true to include API reference

  return (
    <>
      <div className="mx-auto max-w-4xl py-8">
        <h1 className="mb-6 text-3xl font-bold">Evolu Documentation</h1>
        <div className="space-y-8">
          {pages.map((page, index) => (
            <Fragment key={index}>
              <div className="prose prose-indigo">
                <h2 className="mb-3 text-2xl font-semibold">{page.title}</h2>
                <div>{page.content}</div>
              </div>
              <hr className="my-6 border-gray-200" />
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}
