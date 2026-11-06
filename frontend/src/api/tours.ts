import { api } from './client';

export type TourStatus = 'completed' | 'skipped' | 'dismissed';
export type TourProgress = Record<string, TourStatus>;

/** What this account has finished or dismissed (kept on the server, so it follows the person). */
export async function getTourProgress(): Promise<TourProgress> {
  const { data } = await api.get<{ progress: TourProgress }>('/auth/tours/');
  return data.progress;
}

export async function setTourStatus(key: string, status: TourStatus): Promise<void> {
  await api.put('/auth/tours/', { key, status });
}

export async function clearTour(key: string): Promise<void> {
  await api.delete('/auth/tours/', { params: { key } });
}
