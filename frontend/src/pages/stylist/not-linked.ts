import axios from 'axios';

/** True when the server says this account has no team profile linked yet. */
export function isNotLinked(error: unknown): boolean {
  return (
    axios.isAxiosError(error) &&
    error.response?.status === 409 &&
    (error.response.data as { code?: string } | undefined)?.code === 'not_linked'
  );
}
