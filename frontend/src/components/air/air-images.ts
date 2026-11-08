import photos from 'virtual:photo-manifest';
import { photoSources } from '../../design/art';
import { AIR_DEFAULT_SLOT, AIR_LAST_RESORT, AIR_POSES, type AirPose } from './air-data';

/** The file for a pose, else the default `air`, else the idle pose; null when none exists. */
export function airSources(pose: AirPose, failed: readonly string[] = []) {
  for (const slot of [AIR_POSES[pose], AIR_DEFAULT_SLOT, AIR_POSES[AIR_LAST_RESORT]]) {
    const found = photoSources({ photo: slot }, photos);
    if (found && !failed.includes(found.webp ?? found.src)) return { ...found, slot };
  }
  return null;
}

/** The 512 px copy written by `npm run photos:optimize`, when it exists. */
export function smallCopy(file: string): string | null {
  const name = file.replace(/^\/photos\//, '').replace(/\.webp$/i, '-512.webp');
  return photos.includes(name) ? `/photos/${name}` : null;
}
