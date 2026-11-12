// Only what the test files read from Node, so no extra type package is needed.
declare const process: { env: Record<string, string | undefined>; cwd(): string };

// The mobile matrix reads the shared route list (shared/policy.json) from disk; the SEO test reads
// the built pages in dist.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function existsSync(path: string): boolean;
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
}
