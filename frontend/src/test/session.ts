import type { SessionUser } from '../api/auth';
import type { Role } from '../policy/policy';
import { homeFor } from '../policy/policy';

export const unauthorized = { isAxiosError: true, response: { status: 401, data: {} } };

export function userFor(role: Role, overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: `${role}-id`,
    email: `${role}@example.com`,
    full_name: `Test ${role[0].toUpperCase()}${role.slice(1)}`,
    role,
    home: homeFor(role),
    ...overrides,
  };
}
