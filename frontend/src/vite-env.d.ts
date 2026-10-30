/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'virtual:photo-manifest' {
  /** Image file names in public/photos (Task 11 photo slots). */
  const photos: string[];
  export default photos;
}

declare module 'virtual:photo-placeholders' {
  /** Slot name -> tiny blurred preview (data: URL), written by `npm run photos:optimize`. */
  const placeholders: Record<string, string>;
  export default placeholders;
}
