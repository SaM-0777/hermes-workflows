/** The slice of the Hermes Desktop preload bridge the media field uses. */
export interface HermesDesktopFileBridge {
  /** Native open dialog; resolves to absolute paths, `[]` when cancelled. */
  selectPaths?: (options?: {
    title?: string;
    multiple?: boolean;
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }) => Promise<string[]>;
  /** Absolute path of a File the user dropped or picked. */
  getPathForFile?: (file: File) => string;
}

declare global {
  interface Window {
    hermesDesktop?: HermesDesktopFileBridge & Record<string, unknown>;
  }
}
