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
  { id: 'salon', path: '/salon', label: 'Salon', summary: 'Hair: cuts, colour and styling.' },
  { id: 'spa', path: '/spa', label: 'Spa', summary: 'Massage and body wellness.' },
  {
    id: 'beauty-parlor',
    path: '/beauty-parlor',
    label: 'Beauty Parlor',
    summary: 'Skin, makeup, bridal, nails and waxing.',
  },
];

export function getDivision(id: DivisionId): Division {
  const division = divisions.find((item) => item.id === id);
  if (!division) throw new Error(`Unknown division: ${id}`);
  return division;
}
