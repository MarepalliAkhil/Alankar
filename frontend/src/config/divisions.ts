/**
 * The three fixed divisions of the shop (navigation structure, not editable shop content).
 * Services, photos and descriptions for each division come from the database (Task 2).
 */
export type DivisionId = 'salon' | 'spa' | 'beauty-parlor';

export interface Division {
  id: DivisionId;
  path: `/${DivisionId}`;
  label: string;
  summary: string;
}

export const divisions: readonly Division[] = [
  {
    id: 'salon',
    path: '/salon',
    label: 'Salon',
    summary: 'Cuts, colour, beard and grooming. Sharp work, no fuss.',
  },
  {
    id: 'spa',
    path: '/spa',
    label: 'Spa',
    summary: 'Massage and slow-down time. Phones stay in the locker.',
  },
  {
    id: 'beauty-parlor',
    path: '/beauty-parlor',
    label: 'Beauty Parlor',
    summary: 'Skin, bridal, nails and waxing. Wedding season ready.',
  },
];

export function getDivision(id: DivisionId): Division {
  const division = divisions.find((item) => item.id === id);
  if (!division) throw new Error(`Unknown division: ${id}`);
  return division;
}
