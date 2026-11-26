/**
 * Centralised branding. Change the app's name here (and run `npm run icons`
 * + `npm run build`); the manifest, page title, share images and documentation
 * strings are all derived from these values at build time or run time.
 */
export const BRAND = {
  name: 'The Plot Tickens',
  shortName: 'Plot Tickens',
  tagline: 'The time, told by books.',
  description: 'A literary clock that tells the time through quotations from public-domain literature.',
  /** Used for <meta name="theme-color"> before a theme is applied. */
  themeColor: '#f4efe6',
  backgroundColor: '#f4efe6',
  /** Shown on generated share images. */
  shareFooter: 'The Plot Tickens',
} as const;

export type Brand = typeof BRAND;
