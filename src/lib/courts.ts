/** Human ("natural") order for court names, so "Court 2" comes before "Court 10" instead of the
 * plain-text order that puts "Court 10" and "Court 11" ahead of "Court 2". Use it to sort courts
 * after fetching (the DB's ORDER BY name is lexicographic and can't do this). */
export function compareCourtName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}
