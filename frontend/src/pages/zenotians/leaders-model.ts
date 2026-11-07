import photos from 'virtual:photo-manifest';
import { LEADER_FOLDER, pickPhoto } from '../../../vite-plugins/photo-slots.js';
import type { Person } from '../../api/zenotians';

export const LABEL = "Public information from Zenoti's website";

export const slugOf = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]![0]!;
  const last = words.length > 1 ? words[words.length - 1]![0]! : '';
  return (first + last).toUpperCase();
}

/** The picture file for a person, or null: no file means the monogram shows. Never downloaded. */
export function leaderPhoto(person: Person, available: readonly string[] = photos): string | null {
  const base = (person.photo?.trim() || slugOf(person.name)).toLowerCase();
  const inFolder = available.filter((n) => n.toLowerCase().startsWith(`${LEADER_FOLDER}/`));
  const match = pickPhoto(base, inFolder);
  return match ? `/photos/${match}` : null;
}
