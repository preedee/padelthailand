/* Draft config — public values (safe to commit + deploy).
 *
 * Sets window.SUPABASE_URL and window.SUPABASE_ANON_KEY for use by:
 *   js/draft-supabase.js (read-only screens: projector + captain phones)
 *
 * The commissioner laptop ALSO loads commissioner-config.local.js
 * (root-level, gitignored, not deployed) to get the service-role key.
 */

window.SUPABASE_URL = 'https://hqcwmjninvunoexccrbz.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxY3dtam5pbnZ1bm9leGNjcmJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjE5MzEsImV4cCI6MjA5MjY5NzkzMX0.ysMLmDKCI3dI6J5hYtbDeLiOtmVJEE3bNBAEOL9hCJc';
