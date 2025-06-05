import { type Metadata } from "next";

import { Card } from "@/components/Card";
import { SimpleLayout } from "@/components/SimpleLayout";
import { type ArticleWithSlug, getAllArticles } from "@/lib/blog";
import { formatDate } from "@/lib/formatDate";

function Article({ article }: { article: ArticleWithSlug }) {
  return (
    <article className="md:grid md:grid-cols-4 md:items-baseline">
      <Card className="md:col-span-3">
        <Card.Title href={`/blog/${article.slug}`}>{article.title}</Card.Title>
        <Card.Eyebrow
          as="time"
          dateTime={article.date}
          className="md:hidden"
          decorate
        >
          {formatDate(article.date)}
        </Card.Eyebrow>
        <Card.Description>{article.description}</Card.Description>
        <Card.Cta>Read article</Card.Cta>
      </Card>
      <Card.Eyebrow
        as="time"
        dateTime={article.date}
        className="mt-1 hidden md:block"
      >
        {formatDate(article.date)}
      </Card.Eyebrow>
    </article>
  );
}

export const metadata: Metadata = {
  title: "Blog",
  description: "Restore data ownership",
};

export default async function ArticlesIndex(): Promise<React.ReactElement> {
  const articles = await getAllArticles();

  return (
    <SimpleLayout title="Evolu blog" intro="Restore data ownership">
      <div className="mb-16 md:dark:border-zinc-700/40">
        <div className="flex w-full max-w-5xl flex-col space-y-16">
          {articles.map((article) => (
            <Article key={article.slug} article={article} />
          ))}
        </div>
      </div>
    </SimpleLayout>
  );
}
