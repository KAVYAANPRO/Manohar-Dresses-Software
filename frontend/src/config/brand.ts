/**
 * Single source of truth for the product's name and wording. Change the name here and it updates
 * the sidebar, header, login screen, factory portal and page titles. (The browser-tab title,
 * favicon and install name live in index.html / public/ - keep them in step when renaming.)
 * Logo artwork: public/brand/ (signature white + full logo red/white), from the company's PDF.
 */
export const BRAND = {
  /** Full product name. */
  name: 'Manohar Dresses',
  /** Shown where space is tight (collapsed sidebar). */
  shortName: 'Manohar',
  /** One line under the logo on the login screen (from the company logo). */
  tagline: 'Since 1991 · We Care What You Wear',
  /** Name of the karigar / factory side of the app. */
  portalName: 'Manohar Dresses · Karigar',
  /** Company red from the logo. */
  color: '#E40043',
} as const;

/** "Job Slips · Manohar Dresses" style document titles. */
export function pageTitle(page?: string): string {
  return page ? `${page} · ${BRAND.name}` : BRAND.name;
}
