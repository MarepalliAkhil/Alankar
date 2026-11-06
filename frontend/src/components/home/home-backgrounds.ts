import type { ArtId, HomeChapter } from '../../design/art';
import { divisionTheme, type ThemeName } from '../../design/themes';

/** The four pictures of the home page, in the order of its four sections, and the tint of each. */
export const HOME_BACKGROUNDS: Record<HomeChapter, { slot: ArtId; theme: ThemeName }> = {
  1: { slot: 'shopBackground', theme: 'brand' },
  2: { slot: 'salonBackground', theme: divisionTheme.salon },
  3: { slot: 'spaBackground', theme: divisionTheme.spa },
  4: { slot: 'parlorBackground', theme: divisionTheme['beauty-parlor'] },
};
