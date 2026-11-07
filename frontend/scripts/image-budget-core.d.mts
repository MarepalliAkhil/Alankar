export declare const MAX_COVER_SCALE: number;
export declare const BAND_SHARE: number;
export declare const PORTRAIT_MOBILE_QUERY: string;
export declare const VARIANT_WIDTHS: readonly number[];
export interface Profile {
  id: string;
  label: string;
  width: number;
  height: number;
  dpr: number;
  portraitMobile: boolean;
}
export declare const PROFILES: readonly Profile[];
export interface Candidate {
  file: string;
  width: number;
  height: number;
}
export interface Box {
  width: number;
  height: number;
  zoom: number;
  mode: string;
}
export type SlotKind = 'hero' | 'page-background' | 'home-background';
export interface BudgetSlot {
  name: string;
  kind: SlotKind;
  landscape: Candidate[];
  mobile?: Candidate[];
}
export interface BudgetRow {
  slot: string;
  profile: string;
  mode: string;
  file: string;
  width: number;
  height: number;
  scale: number;
  flagged: boolean;
}
export declare function imageSize(
  buffer: Buffer,
): { format: 'png' | 'jpeg' | 'webp'; width: number; height: number } | null;
export declare function pickCandidate<T extends { width: number }>(
  candidates: T[],
  neededWidth: number,
): T | null;
export declare function boxFor(kind: SlotKind, profile: Profile, hasMobilePhoto: boolean): Box;
export declare function coverScale(
  box: Box,
  dpr: number,
  candidates: Candidate[],
): { scale: number; picked: Candidate } | null;
export declare function checkSlots(
  slots: BudgetSlot[],
  profiles?: readonly Profile[],
  limit?: number,
): BudgetRow[];
export declare function neededSize(box: Box, dpr: number): { width: number; height: number };
