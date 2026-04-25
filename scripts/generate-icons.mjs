import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const size = 512;
const outputDir = path.join(process.cwd(), "assets");

const icons = {
  "icon.png": `
    <rect width="512" height="512" rx="96" fill="#172554"/>
    <path d="M132 100C132 80.118 148.118 64 168 64H344C363.882 64 380 80.118 380 100V412C380 431.882 363.882 448 344 448H168C148.118 448 132 431.882 132 412V100Z" fill="#F8FAFC"/>
    <path d="M174 110C174 101.163 181.163 94 190 94H322C330.837 94 338 101.163 338 110V402C338 410.837 330.837 418 322 418H190C181.163 418 174 410.837 174 402V110Z" fill="#DBEAFE"/>
    <path d="M214 174H304" stroke="#1E3A8A" stroke-width="26" stroke-linecap="round"/>
    <path d="M214 236H304" stroke="#2563EB" stroke-width="26" stroke-linecap="round"/>
    <path d="M214 298H280" stroke="#38BDF8" stroke-width="26" stroke-linecap="round"/>
    <path d="M151 142H116" stroke="#38BDF8" stroke-width="26" stroke-linecap="round"/>
    <path d="M151 214H116" stroke="#38BDF8" stroke-width="26" stroke-linecap="round"/>
    <path d="M151 286H116" stroke="#38BDF8" stroke-width="26" stroke-linecap="round"/>
    <path d="M151 358H116" stroke="#38BDF8" stroke-width="26" stroke-linecap="round"/>
  `,
  "search-library.png": `
    <rect width="512" height="512" rx="96" fill="#1E293B"/>
    <path d="M132 100C132 80.118 148.118 64 168 64H344C363.882 64 380 80.118 380 100V412C380 431.882 363.882 448 344 448H168C148.118 448 132 431.882 132 412V100Z" fill="#F8FAFC"/>
    <path d="M174 108C174 101.373 179.373 96 186 96H326C332.627 96 338 101.373 338 108V404C338 410.627 332.627 416 326 416H186C179.373 416 174 410.627 174 404V108Z" fill="#E2E8F0"/>
    <path d="M210 166H306" stroke="#334155" stroke-width="26" stroke-linecap="round"/>
    <path d="M210 224H282" stroke="#64748B" stroke-width="26" stroke-linecap="round"/>
    <circle cx="302" cy="318" r="58" fill="#38BDF8"/>
    <path d="M346 362L394 410" stroke="#F8FAFC" stroke-width="28" stroke-linecap="round"/>
  `,
  "browse-tags.png": `
    <rect width="512" height="512" rx="96" fill="#2A2344"/>
    <path d="M106 119C106 101.327 120.327 87 138 87H285C293.487 87 301.627 90.371 307.627 96.373L412.627 201.373C425.124 213.869 425.124 234.131 412.627 246.627L246.627 412.627C234.131 425.124 213.869 425.124 201.373 412.627L96.373 307.627C90.371 301.627 87 293.487 87 285V138C87 120.327 101.327 106 119 106L106 119Z" fill="#F0ABFC"/>
    <circle cx="197" cy="197" r="36" fill="#2A2344"/>
    <path d="M224 292L292 224" stroke="#2A2344" stroke-width="28" stroke-linecap="round"/>
    <path d="M266 334L334 266" stroke="#2A2344" stroke-width="28" stroke-linecap="round" opacity=".72"/>
  `,
  "add-entry.png": `
    <rect width="512" height="512" rx="96" fill="#12372A"/>
    <path d="M139 64H319L392 137V412C392 431.882 375.882 448 356 448H139C119.118 448 103 431.882 103 412V100C103 80.118 119.118 64 139 64Z" fill="#FBFADA"/>
    <path d="M319 64V123C319 130.732 325.268 137 333 137H392" fill="#ADBC9F"/>
    <path d="M190 245H310" stroke="#436850" stroke-width="30" stroke-linecap="round"/>
    <path d="M250 185V305" stroke="#436850" stroke-width="30" stroke-linecap="round"/>
    <path d="M190 364H310" stroke="#12372A" stroke-width="26" stroke-linecap="round" opacity=".55"/>
  `,
};

await mkdir(outputDir, { recursive: true });

for (const [filename, body] of Object.entries(icons)) {
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(outputDir, filename));
}
