import type { Role } from '../policy/policy';
import { api } from './client';

export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  home: string;
}

export interface LoginPayload {
  role: Role;
  email: string;
  password: string;
}

export interface RegisterPayload {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  consent: true;
}

export interface InviteInfo {
  email: string;
  full_name: string;
  role: Role;
}

/** Sets the csrftoken cookie. Call once before the first unsafe request. */
export async function ensureCsrf(): Promise<void> {
  await api.get('/auth/csrf/');
}

/** The signed-in user, or null for guests (always 200; renews an expired access cookie). */
export async function getSession(): Promise<SessionUser | null> {
  const { data } = await api.get<{ user: SessionUser | null }>('/auth/session/');
  return data.user;
}

/** Rotates the session cookies before the 15-minute access token expires. */
export async function refreshSession(): Promise<void> {
  await api.post('/auth/refresh/');
}

export async function login(payload: LoginPayload): Promise<SessionUser> {
  const { data } = await api.post<SessionUser>('/auth/login/', payload);
  return data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout/');
}

/** Registration never sends a role: the server always creates a customer. */
export async function registerCustomer(payload: RegisterPayload): Promise<string> {
  const { data } = await api.post<{ detail: string }>('/auth/register/', payload);
  return data.detail;
}

export async function requestPasswordReset(email: string): Promise<string> {
  const { data } = await api.post<{ detail: string }>('/auth/password-reset/', { email });
  return data.detail;
}

export async function confirmPasswordReset(token: string, password: string): Promise<string> {
  const { data } = await api.post<{ detail: string }>('/auth/password-reset/confirm/', {
    token,
    password,
  });
  return data.detail;
}

export async function checkInvite(token: string): Promise<InviteInfo> {
  const { data } = await api.get<InviteInfo>('/auth/invite/', { params: { token } });
  return data;
}

export async function acceptInvite(token: string, password: string): Promise<{ role: Role }> {
  const { data } = await api.post<{ detail: string; role: Role }>('/auth/invite/accept/', {
    token,
    password,
  });
  return data;
}
