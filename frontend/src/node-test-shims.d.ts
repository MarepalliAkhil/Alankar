// The static-file tests (CSS, fonts, image budget) read project files with Node. The app itself
// runs in the browser and does not install @types/node, so these are the few Node names those
// tests use, typed just enough for `tsc`. If @types/node is ever added, delete this file.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readFileSync(path: string): Buffer;
  export function readdirSync(path: string): string[];
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
}
declare const process: { cwd(): string };
interface Buffer extends Uint8Array {
  write(text: string, offset: number, encoding?: string): number;
  writeUInt16LE(value: number, offset: number): number;
  writeUInt32LE(value: number, offset: number): number;
  writeUInt32BE(value: number, offset: number): number;
  writeUIntLE(value: number, offset: number, byteLength: number): number;
}
declare const Buffer: {
  alloc(size: number): Buffer;
  from(data: string | number[]): Buffer;
};
