// Copies third-party browser files into www/ so the app works offline (PWA and Android).
import { copyFileSync, mkdirSync } from "node:fs";
const copies = [
  ["node_modules/jszip/dist/jszip.min.js", "www/vendor/jszip.min.js"],
  ["node_modules/qrcode-generator/dist/qrcode.js", "www/vendor/qrcode.js"],
  ["node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-500-normal.woff2", "www/fonts/bricolage-500.woff2"],
  ["node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff2", "www/fonts/bricolage-700.woff2"],
  ["node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff2", "www/fonts/bricolage-800.woff2"],
  ["node_modules/@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2", "www/fonts/atkinson-400.woff2"],
  ["node_modules/@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2", "www/fonts/atkinson-700.woff2"],
];
mkdirSync("www/vendor", { recursive: true });
mkdirSync("www/fonts", { recursive: true });
for (const [from, to] of copies) copyFileSync(from, to);
console.log("vendored", copies.length, "files");
