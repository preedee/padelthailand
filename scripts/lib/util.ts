// Small helpers shared by the page generators (build-directory, build-listing-pages, build-listings, build-seo).
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** today's date (yyyy-mm-dd) in Bangkok: the cutoff between upcoming and past everywhere */
export const todayBkk = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
/** a tournament's last day; a month-only date ("TBC-Nov-2026") counts as running to the end of that month */
export const tourEnd = (t: { startDate: string | null; endDate: string | null; monthOnly: string | null }) => t.endDate ?? t.startDate ?? (t.monthOnly ? t.monthOnly + "-31" : "");
/** read a JSON file relative to a root directory, or return the fallback when it does not exist yet */
export async function readJson<T>(root: string, file: string, fallback: T): Promise<T> {
  return existsSync(root + file) ? (JSON.parse(await readFile(root + file, "utf8")) as T) : fallback;
}
