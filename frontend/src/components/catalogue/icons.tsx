import { Scissors, Sparkles, Waves } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DivisionId } from '../../config/divisions';

export const divisionIcon: Record<DivisionId, ReactNode> = {
  salon: <Scissors className="h-6 w-6" />,
  spa: <Waves className="h-6 w-6" />,
  'beauty-parlor': <Sparkles className="h-6 w-6" />,
};
