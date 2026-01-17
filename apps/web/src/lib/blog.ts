import glob from "fast-glob";

interface Article {
  title: string;
  description: string;
  author: string;
  date: string;
}

export interface ArticleWithSlug extends Article {
  slug: string;
}

const importArticle = async (
  articleFilename: string,
): Promise<ArticleWithSlug> => {
  const { article } = (await import(
    `../app/(landing)/blog/${articleFilename}`
  )) as {
    default: React.ComponentType;
    article: Article;
  };

  return {
    slug: articleFilename.replace(/(\/page)?\.mdx$/, ""),
    ...article,
  };
};

export const getAllArticles = async (): Promise<Array<ArticleWithSlug>> => {
  const articleFilenames = await glob("*/page.mdx", {
    cwd: "./src/app/(landing)/blog",
  });

  const articles = await Promise.all(articleFilenames.map(importArticle));

  return articles.sort((a, z) => +new Date(z.date) - +new Date(a.date));
};
