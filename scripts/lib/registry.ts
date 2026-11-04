// Where the club registry lives (Supabase project "padelthailand"). The publishable key is public by design: the views grant anon SELECT only.
export const SUPABASE_URL = "https://zmnchzfvbflexrlciadn.supabase.co";
export const ANON_KEY = "sb_publishable_KKLfjbhBJ_qF420UNtM2JQ_2YM-v6ld";
export const PHOTO_BASE = `${SUPABASE_URL}/storage/v1/object/public/club-photos/`;
export type PhotoRow = { place_id: string; storage_path: string; position: number; author_name: string | null; author_uri: string | null };
/** read one of the registry's public views over REST (clubs schema) */
export async function registryGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Accept-Profile": "clubs", Range: "0-1999", "Range-Unit": "items" } });
  if (!res.ok) throw new Error(`${path.split("?")[0]}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}
