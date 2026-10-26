import type { LoginRole } from '../config/roles';
import { api } from './client';

/**
 * Auth endpoints. The server side is built in Task 1; until then these calls fail
 * and the pages show a clear "not available yet" error instead of pretending to succeed.
 */
export interface LoginPayload {
  role: LoginRole;
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
  consent: true;
}

export async function login(payload: LoginPayload): Promise<void> {
  await api.post('/auth/login/', payload);
}

/** Registration never sends a role: the server always creates a customer. */
export async function registerCustomer(payload: RegisterPayload): Promise<void> {
  await api.post('/auth/register/', payload);
}
