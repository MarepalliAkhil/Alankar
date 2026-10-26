/** Roles that can sign in. The server always decides the real role (Task 1). */
export const loginRoles = [
  { id: 'customer', label: 'Customer' },
  { id: 'stylist', label: 'Stylist' },
  { id: 'receptionist', label: 'Receptionist' },
  { id: 'admin', label: 'Admin' },
] as const;

export type LoginRole = (typeof loginRoles)[number]['id'];

export function isLoginRole(value: string | null | undefined): value is LoginRole {
  return loginRoles.some((role) => role.id === value);
}
