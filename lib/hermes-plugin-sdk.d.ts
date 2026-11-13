/**
 * The slice of `@hermes/plugin-sdk` the studio uses.
 *
 * The studio runs inside the plugin's page now, so it needs `host` for routing.
 * This declaration exists because the studio sources are typechecked by the
 * app-side tsconfig (`tsc -b`), while the desktop half is bundled by Bun and
 * resolves the real module from the app at runtime.
 */
declare module "@hermes/plugin-sdk" {
  export const host: {
    navigate: (path: string) => void;
    notify: (options: {
      kind?: "info" | "success" | "warning" | "error";
      message: string;
    }) => void;
  };
}
