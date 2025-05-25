import { Fragment } from "react";
import { fetchProcessedMdxPages } from "../../../lib/llms";

export default async function LLMsPage(): Promise<React.ReactElement> {
  const pages = await fetchProcessedMdxPages(false);

  return (
    <>
      # Evolu Documentation
      <br />
      <br />
      {pages.map((page, index) => (
        <Fragment key={index}>
          {page.content} <br /> <br />
        </Fragment>
      ))}
    </>
  );
}
