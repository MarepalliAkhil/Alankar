import { useQuery } from '@tanstack/react-query';
import { getSite } from '../api/public';

/** Website content shared by the home page and the footer (cached for 5 minutes). */
export function useSite() {
  return useQuery({ queryKey: ['site'], queryFn: getSite, staleTime: 5 * 60 * 1000 });
}
