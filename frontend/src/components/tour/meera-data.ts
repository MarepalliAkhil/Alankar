/** The nine pictures of Meera, the guide. The owner supplies them as 3D character images. */
export const MEERA_POSES = [
  'wave',
  'point',
  'phone',
  'approve',
  'chat',
  'wallet',
  'stars',
  'shield',
  'celebrate',
  'namaste',
  'scissors',
  'calendar',
  'waiting',
  'sorry',
  'gift',
  'package',
] as const;
export type MeeraPose = (typeof MEERA_POSES)[number];

/** What a screen reader says about each pose (when Meera is not purely decoration). */
export const MEERA_ALT: Record<MeeraPose, string> = {
  wave: 'Meera, your stylist guide, waving',
  point: 'Meera, your stylist guide, pointing',
  phone: 'Meera, your stylist guide, holding a phone',
  approve: 'Meera, your stylist guide, giving a thumbs-up',
  chat: 'Meera, your stylist guide, chatting',
  wallet: 'Meera, your stylist guide, holding a wallet',
  stars: 'Meera, your stylist guide, holding five stars',
  shield: 'Meera, your stylist guide, holding a shield',
  celebrate: 'Meera, your stylist guide, celebrating',
  namaste: 'Meera, your stylist guide, greeting you with a namaste',
  scissors: 'Meera, your stylist guide, holding scissors',
  calendar: 'Meera, your stylist guide, holding a calendar',
  waiting: 'Meera, your stylist guide, holding an hourglass',
  sorry: 'Meera, your stylist guide, looking sorry',
  gift: 'Meera, your stylist guide, holding a gift',
  package: 'Meera, your stylist guide, holding a package',
};

/** The image slot for a pose: public/photos/meera/meera-<pose>.(webp|png|jpg|jpeg). */
export const meeraSlot = (pose: MeeraPose) => `meera-${pose}`;

/** The default picture (public/photos/meera/meera.*): used for any pose without its own file. */
export const MEERA_DEFAULT_SLOT = 'meera';
export const MEERA_DEFAULT_ALT = 'Meera, your stylist guide';
