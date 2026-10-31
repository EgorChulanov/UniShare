// Converts the iOS Localizable.strings files into JSON dictionaries used by the
// web client so every platform shares the same copy. Run: npm run i18n
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const languages = ["en", "ru", "uk", "be"];

for (const lang of languages) {
  const source = readFileSync(join(root, "UniShare", "Localization", `${lang}.lproj`, "Localizable.strings"), "utf8");
  const entries = {};
  const pattern = /^\s*"((?:[^"\\]|\\.)+)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;/gm;
  for (const match of source.matchAll(pattern)) {
    let index = 0;
    const value = match[2]
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/%(@|d|ld|lld)/g, () => `{${index++}}`);
    entries[match[1]] = value;
  }
  const target = join(root, "cloud", "shared", "src", "i18n", `ios.${lang}.json`);
  writeFileSync(target, JSON.stringify(entries, null, 2) + "\n");
  console.log(`${lang}: ${Object.keys(entries).length} strings → ${target}`);
}
