/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'virtual:photo-manifest' {
  /** File names in public/photos (Task 11 photo slots). */
  const photos: string[];
  export default photos;
}
