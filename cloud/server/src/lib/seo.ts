// Crawler files and link-preview tags built from PUBLIC_URL, so search engines
// and Telegram/VK link previews get absolute addresses on any domain.

/** Public pages worth indexing; the app itself is one page. */
const PAGES = ["/", "/legal/privacy.html", "/legal/terms.html", "/legal/support.html"];

export function robotsTxt(publicUrl: string): string {
  return ["User-agent: *", "Allow: /", "Disallow: /api/", "Disallow: /media/", "", `Sitemap: ${publicUrl}/sitemap.xml`, ""].join("\n");
}

export function sitemapXml(publicUrl: string): string {
  const urls = PAGES.map((path) => `  <url><loc>${publicUrl}${path}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** index.html with absolute preview images, og:url and a canonical link. */
export function withPublicUrl(indexHtml: string, publicUrl: string): string {
  return indexHtml
    .replace(/(<meta property="og:image" content=")\//g, `$1${publicUrl}/`)
    .replace("</head>", `    <meta property="og:url" content="${publicUrl}/" />\n    <link rel="canonical" href="${publicUrl}/" />\n  </head>`);
}
