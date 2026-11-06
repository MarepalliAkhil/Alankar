import axios from 'axios';
import { api } from './client';

export interface TrustedDevice {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
  this_device: boolean;
}

export async function listTrustedDevices(): Promise<TrustedDevice[]> {
  const { data } = await api.get<{ results: TrustedDevice[] }>('/auth/trusted-devices/');
  return data.results;
}

export async function revokeTrustedDevice(id: string): Promise<void> {
  await api.delete(`/auth/trusted-devices/${id}/`);
}

export async function revokeAllTrustedDevices(): Promise<void> {
  await api.delete('/auth/trusted-devices/');
}

export interface StepUpStart {
  required: boolean;
  method: 'email' | 'totp' | null;
  detail?: string;
}

/** Sends a fresh code (customers: by email) before a sensitive action. */
export async function startStepUp(): Promise<StepUpStart> {
  const { data } = await api.post<StepUpStart>('/auth/step-up/');
  return data;
}

export async function verifyStepUp(code: string): Promise<void> {
  await api.post('/auth/step-up/verify/', { code });
}

/** True when the server wants a fresh code before it will do this (even on a trusted device). */
export function needsFreshCode(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.response?.status !== 403) return false;
  return (error.response.data as { code?: string } | undefined)?.code === 'fresh_otp_required';
}
