import type { SiteData } from '../api/public';
import { looksLikePlaceholder } from '../seo/seo-data.js';
import { site } from './brand';

/** Honest labels shown instead of anything that only looks real (demo data). */
export const DEMO_LABELS = {
  address: 'Demo project, address not real',
  phone: 'Demo project, no real phone number',
  email: 'Demo project, no real email address',
} as const;

export interface ShownContact {
  address: string | null;
  phone: string | null;
  /** Digits for a tel: link, only for a real number. */
  tel: string | null;
  email: string | null;
  mapUrl: string | null;
  /** Honest notes to show where a field is demo data. */
  notes: string[];
}

/**
 * What the site may show as the shop's contact details. Real details set at build time
 * (src/config/brand.ts, docs/SEO.md) win. Otherwise the admin's saved details are used, except any
 * that look like placeholders ("Demo address", "+91 90000 00000", "...@example.com"): those are
 * replaced by an honest "Demo project" label, never by an invented value.
 */
export function shownContact(saved: SiteData['contact'] | undefined | null): ShownContact {
  const notes: string[] = [];
  if (site.businessIsReal) {
    const b = site.business;
    const address = [b.street, b.city, b.region, b.postalCode].filter(Boolean).join(', ');
    return {
      address,
      phone: b.phone,
      tel: b.phone.replace(/[^\d+]/g, ''),
      email: b.email || null,
      mapUrl: saved?.map_url && !looksLikePlaceholder(saved.address) ? saved.map_url : null,
      notes,
    };
  }
  const keep = (value: string | undefined, label: string) => {
    if (!value?.trim()) return null;
    if (looksLikePlaceholder(value)) {
      notes.push(label);
      return null;
    }
    return value;
  };
  const address = keep(saved?.address, DEMO_LABELS.address);
  const phone = keep(saved?.phone, DEMO_LABELS.phone);
  const email = keep(saved?.email, DEMO_LABELS.email);
  return {
    address,
    phone,
    tel: phone ? phone.replace(/[^\d+]/g, '') : null,
    email,
    mapUrl: address && saved?.map_url ? saved.map_url : null,
    notes,
  };
}

/** A single phone number from the server (for example in a sorry note): null if it is a placeholder. */
export function realPhone(value: string | null | undefined): string | null {
  if (!value?.trim() || looksLikePlaceholder(value)) return null;
  return value;
}

/** The same, in the shape the pages already read (address, phone, email, map_url). */
export function safeContact(saved: SiteData['contact'] | undefined | null) {
  const shown = shownContact(saved);
  return {
    contact: {
      address: shown.address ?? undefined,
      phone: shown.phone ?? undefined,
      email: shown.email ?? undefined,
      map_url: shown.mapUrl ?? undefined,
    },
    tel: shown.tel ?? undefined,
    notes: shown.notes,
  };
}
