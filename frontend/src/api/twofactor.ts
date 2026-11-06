import { api } from './client';

/** Task 5e-3: an admin's own two-step sign-in, and resetting another admin's. */

export interface OtherAdmin {
  id: string;
  name: string;
  email: string;
  two_factor: boolean;
}
export interface TwoFactorStatus {
  enabled: boolean;
  backup_codes_left: number;
  admins: OtherAdmin[];
}
export interface TwoFactorSetup {
  secret: string;
  uri: string;
  /** Rows of "1" (dark) and "0" (light) to draw as the QR code. */
  qr: string[];
}

const T = '/admin/security/two-factor';

export async function getTwoFactor(): Promise<TwoFactorStatus> {
  return (await api.get<TwoFactorStatus>(`${T}/`)).data;
}
export async function startTwoFactor(): Promise<TwoFactorSetup> {
  return (await api.post<TwoFactorSetup>(`${T}/setup/`)).data;
}
export async function confirmTwoFactor(code: string): Promise<{ backup_codes: string[] }> {
  return (await api.post<{ backup_codes: string[] }>(`${T}/confirm/`, { code })).data;
}
export async function disableTwoFactor(password: string, code: string): Promise<void> {
  await api.post(`${T}/disable/`, { password, code });
}
export async function newBackupCodes(
  password: string,
  code: string,
): Promise<{ backup_codes: string[] }> {
  return (await api.post<{ backup_codes: string[] }>(`${T}/backup-codes/`, { password, code }))
    .data;
}
export async function resetAdminTwoFactor(id: string, reason: string): Promise<void> {
  await api.post(`${T}/${id}/reset/`, { reason });
}
