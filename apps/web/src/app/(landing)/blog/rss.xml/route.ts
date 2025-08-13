import { type ArticleWithSlug, getAllArticles } from "@/lib/blog";
import RSS from "rss";

function getSiteUrl(request: Request): string {
  if (process.env.NODE_ENV === "production") {
    return "https://www.evolu.dev";
  }

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(request: Request): Promise<Response> {
  const articles = await getAllArticles();
  const currentSiteUrl = getSiteUrl(request);

  const feed = new RSS({
    title: "Evolu Blog",
    description: "Restore data ownership",
    feed_url: `${currentSiteUrl}/blog/rss.xml`,
    site_url: currentSiteUrl,
    language: "en",
    pubDate: new Date().toISOString(),
    copyright: `© ${new Date().getFullYear()} Evolu`,
    docs: "https://validator.w3.org/feed/docs/rss2.html",
    ttl: 60,
  });

  articles.forEach((article: ArticleWithSlug) => {
    feed.item({
      title: article.title,
      description: article.description,
      url: `${currentSiteUrl}/blog/${article.slug}`,
      guid: `${currentSiteUrl}/blog/${article.slug}`,
      date: new Date(article.date),
      author: article.author,
    });
  });

  return new Response(feed.xml(), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

export const dynamic = "force-static";
