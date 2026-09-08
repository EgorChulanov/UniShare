import { pages } from "./pages.ts";

const headers = {
  "cache-control": "public, max-age=300, stale-while-revalidate=86400",
  "content-security-policy": "default-src 'none'; sandbox",
  "content-type": "text/plain; charset=utf-8",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

Deno.serve(async (request: Request) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }

  const url = new URL(request.url);
  const slug = url.pathname.split("/").filter(Boolean).at(-1) ?? "privacy";
  const requestedLanguage = url.searchParams.get("lang")
    ?? request.headers.get("accept-language")?.split(",")[0]?.split("-")[0]
    ?? "en";
  const language = ["en", "ru", "uk", "be"].includes(requestedLanguage) ? requestedLanguage : "en";
  const html = pages.get(`${language}:${slug}`) ?? pages.get(`en:${slug}`);
  if (!html) {
    return new Response("Not Found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  return new Response(request.method === "HEAD" ? null : html, { status: 200, headers });
});
