// Crawler files and link-preview tags use the configured public URL.
import assert from "node:assert/strict";
import { test } from "node:test";
import { robotsTxt, sitemapXml, withPublicUrl } from "../src/lib/seo";

const BASE = "https://unishare.example";

test("robots.txt keeps the API out and points to the sitemap", () => {
  const robots = robotsTxt(BASE);
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Disallow: \/api\/$/m);
  assert.match(robots, /^Disallow: \/media\/$/m);
  assert.match(robots, /^Sitemap: https:\/\/unishare\.example\/sitemap\.xml$/m);
});

test("sitemap lists the home page and the legal pages with absolute URLs", () => {
  const xml = sitemapXml(BASE);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  for (const path of ["/", "/legal/privacy.html", "/legal/terms.html", "/legal/support.html"]) {
    assert.ok(xml.includes(`<loc>${BASE}${path}</loc>`), path);
  }
});

test("index.html gets an absolute preview image, og:url and a canonical link", () => {
  const html = `<html><head>\n<meta property="og:image" content="/icons/icon-512.png" />\n</head><body></body></html>`;
  const out = withPublicUrl(html, BASE);
  assert.ok(out.includes(`<meta property="og:image" content="${BASE}/icons/icon-512.png" />`));
  assert.ok(out.includes(`<meta property="og:url" content="${BASE}/" />`));
  assert.ok(out.includes(`<link rel="canonical" href="${BASE}/" />`));
  assert.equal(out.match(/<\/head>/g)?.length, 1);
});
