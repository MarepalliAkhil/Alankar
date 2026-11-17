export declare const PLACEHOLDER: string;
export interface VercelConfig {
  rewrites?: { source?: string; destination: string }[];
  [key: string]: unknown;
}
export declare function backendOrigin(config: VercelConfig): string | null;
export declare function checkVercel(
  config: VercelConfig,
  env: Record<string, string | undefined>,
): string[];
