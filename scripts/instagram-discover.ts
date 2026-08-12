#!/usr/bin/env bun
/**
 * instagram-discover.ts — find tournament posts by watching organizer Instagram accounts.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ NOT LIVE. Requires an Apify subscription, which costs money and has not been │
 * │ approved. Running it without APIFY_TOKEN exits without calling anything.     │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * Why a paid scraper is needed at all: Instagram profile pages return zero post links
 * when logged out (verified 2026-08-13 — 604KB of HTML, no `/p/` hrefs). Individual post
 * pages still expose `og:image` to crawlers, which is why fetch-posters.ts works for free.
 * Listing an account's recent posts is the part that is gated.
 *
 * To enable:
 *   1. Create an Apify account and copy the token from console.apify.com/account/integrations
 *   2. export APIFY_TOKEN=apify_api_xxxxx
 *   3. bun scripts/instagram-discover.ts --days 30
 *
 * It writes candidates to the sheet's `Inbox` tab (same tab the iOS Shortcut writes to),
 * so fetch-posters.ts picks them up with no further wiring.
 */

const ACCOUNTS_SOURCE = 'Organizer Instagram column of the Tournaments tab';
const DEFAULT_MAX_POSTS = 12;

export interface DiscoveredPost {
  url: string;
  shortcode: string;
  username: string;
  caption: string;
  timestamp: string;
}

/**
 * Matches the Apify skill's wrapper: scrapeInstagramProfile({ username, maxPosts }).
 * Kept as a single seam so enabling this is one import, not a rewrite.
 */
async function scrapeProfile(_username: string, _maxPosts: number): Promise<DiscoveredPost[]> {
  throw new Error('Apify not enabled — see the header of this file');
}

/** Cheap pre-filter so obviously irrelevant posts never reach the Inbox tab. */
export function looksLikeTournament(caption: string): boolean {
  const text = caption.toLowerCase();
  const signals = ['tournament', 'open', 'cup', 'championship', 'series', 'register',
    'sign up', 'draw', 'categories', 'ทัวร์นาเมนต์', 'สมัคร'];
  const hasSignal = signals.some(s => text.includes(s));
  const hasDate = /\b\d{1,2}\s*[-–]\s*\d{1,2}\s+\w+|\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(caption);
  return hasSignal && hasDate;
}

async function main() {
  if (!process.env.APIFY_TOKEN) {
    console.log('APIFY_TOKEN not set — discovery is disabled.');
    console.log(`Accounts would come from: ${ACCOUNTS_SOURCE}`);
    console.log('Enable it by following the instructions at the top of this file.');
    console.log(`Per-account post window: ${DEFAULT_MAX_POSTS}`);
    process.exit(0);
  }
  throw new Error('Apify path not implemented — approve the spend first, then wire scrapeProfile()');
}

if (import.meta.main) await main();

export { scrapeProfile };
