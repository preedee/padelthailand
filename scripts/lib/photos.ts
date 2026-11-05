// Smaller copies of club photos (scripts/photo-variants.ts): <path>-w400.jpg and <path>-w800.jpg next to the original.
// Only photos listed in data/photo-variants.json have copies; any other photo is served as the original.
import { existsSync, readFileSync } from "node:fs";
import { PHOTO_BASE } from "./registry.ts";

const FILE = new URL("../../data/photo-variants.json", import.meta.url);
const HAVE = new Set<string>(existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : []);
/** the 400px and 800px copies of a photo URL, or {} when it has none */
export function photoVariants(url: string): { thumb?: string; mid?: string } {
  if (!url.startsWith(PHOTO_BASE)) return {};
  const path = url.slice(PHOTO_BASE.length);
  return HAVE.has(path) ? { thumb: PHOTO_BASE + path.replace(/\.jpg$/, "-w400.jpg"), mid: PHOTO_BASE + path.replace(/\.jpg$/, "-w800.jpg") } : {};
}
