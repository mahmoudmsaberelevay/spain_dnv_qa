/** Verified existing CRM identities: Mahmoud's two logins, Madonna Adel, Ziad Elshurafa.
 * A generic CRM administrator role does NOT grant HR administration.
 */
const HR_ADMIN_USER_IDS = new Set([1, 120001, 933743, 191]);
export function isHrAdministrator(
  user: { id: number } | null | undefined
): boolean {
  return Boolean(user && HR_ADMIN_USER_IDS.has(user.id));
}
