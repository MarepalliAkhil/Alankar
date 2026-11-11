// Only what the test files read from Node, so no extra type package is needed.
declare const process: { env: Record<string, string | undefined> };

// The mobile matrix reads the shared route list (shared/policy.json) from disk.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
