import { createLlmsIndex } from "@/lib/llms";

export const GET = async (): Promise<Response> => {
  const body = await createLlmsIndex();

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
