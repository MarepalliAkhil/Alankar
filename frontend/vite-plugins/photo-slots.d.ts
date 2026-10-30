export declare const PHOTO_EXTENSIONS: readonly string[];
export declare const PHOTO_SLOTS: Readonly<Record<string, { width: number; height: number }>>;
export declare const MAX_PHOTO_BYTES: number;
export declare function pickPhoto(base: string, files: readonly string[]): string | null;
