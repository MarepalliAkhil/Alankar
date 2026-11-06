/**
 * Brand configuration (rename-proof). Mirrors backend/core/brand.py.
 * Never type these names in components, routes, titles or tests: import them from here.
 * Customers see the shop brand. The platform name appears only on the For Zenotians page
 * and in the small "Powered by" line.
 */
export const brand = {
  shopName: 'Alankar',
  shopTagline: 'Salon · Spa · Beauty Parlor',
  logoText: 'Alankar',
  // "ZenFlow" was the working name; users now see Alankar everywhere.
  platformName: 'Alankar',
  platformTagline: 'Book smarter. Serve faster. Grow automatically.',
} as const;

export const poweredBy = `Powered by ${brand.platformName}`;
