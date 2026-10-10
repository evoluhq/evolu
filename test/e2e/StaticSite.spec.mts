import { expect, test } from "playwright/test";

// The served export's 404 pages, redirects, and headers come from the
// Cloudflare configuration: apps/web/deploy/wrangler.jsonc and
// apps/web/public/_redirects and _headers. Only the production configuration
// serves them. The requests need no browser, so one project runs them.
test.skip(({ browserName }) => browserName !== "chromium", "HTTP only");

test("serves the docs 404 page under /docs and the root one elsewhere", async ({
  request,
}) => {
  const docs = await request.get("/docs/no-such-page");
  expect(docs.status()).toBe(404);
  expect(await docs.text()).toContain("Use search to jump to a symbol.");

  const root = await request.get("/no-such-page");
  expect(root.status()).toBe(404);
  const rootHtml = await root.text();
  expect(rootHtml).toContain("Page not found");
  expect(rootHtml).not.toContain("Use search to jump to a symbol.");
});

test("redirects the removed migrations page", async ({ request }) => {
  for (const [path, location] of [
    ["/docs/migrations", "/docs/schema"],
    ["/docs/migrations/", "/docs/schema"],
    ["/docs/migrations.md", "/docs/schema.md"],
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(308);
    expect(response.headers().location, path).toBe(location);
  }
});

test("redirects trailing slashes permanently, keeping the query", async ({
  request,
}) => {
  for (const [path, location] of [
    ["/docs/library/", "/docs/library"],
    ["/blog/?a=1", "/blog?a=1"],
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(308);
    expect(response.headers().location, path).toBe(location);
  }
});

test("serves docs Markdown, llms.txt, and the RSS feed with their types", async ({
  request,
}) => {
  const markdown = await request.get("/docs/library.md");
  expect(markdown.status()).toBe(200);
  expect(markdown.headers()["content-type"]).toBe(
    "text/markdown; charset=utf-8",
  );
  expect(markdown.headers()["access-control-allow-origin"]).toBe("*");
  expect(await markdown.text()).toMatch(/^# Get started with the library\n/u);

  const index = await request.get("/docs/index.md");
  expect(index.status()).toBe(200);
  expect(await index.text()).toMatch(/^# Documentation\n/u);

  const llms = await request.get("/llms.txt");
  expect(llms.status()).toBe(200);
  expect(llms.headers()["content-type"]).toBe("text/plain; charset=utf-8");

  const rss = await request.get("/blog/rss.xml");
  expect(rss.status()).toBe(200);
  expect(rss.headers()["content-type"]).toBe(
    "application/rss+xml; charset=utf-8",
  );
});
