/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ID RESOLVER — Smart UUID vs Integer Club ID Detection
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The clubs table has two ID columns:
 *   - `id`      (UUID, primary key)  — used internally
 *   - `club_id` (INTEGER, unique)    — the human-readable 6-digit club code
 *
 * URL route params may contain EITHER format. This utility detects which one
 * was provided and builds the correct Supabase query filter.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns true if the value looks like a UUID.
 */
export function isUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Returns the correct column name and typed value for querying the clubs table.
 *
 * @example
 *   const { column, value } = resolveClubIdFilter(clubId);
 *   supabase.from('clubs').select('*').eq(column, value).maybeSingle();
 */
export function resolveClubIdFilter(clubIdParam: string): {
  column: 'id' | 'club_id';
  value: string | number;
} {
  if (isUUID(clubIdParam)) {
    return { column: 'id', value: clubIdParam };
  }
  return { column: 'club_id', value: Number(clubIdParam) };
}
