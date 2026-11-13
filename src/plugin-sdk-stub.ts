/**
 * Preview stand-in for `@hermes/plugin-sdk`.
 *
 * Only the Vite preview build sees this (vite.config.ts aliases the real
 * specifier here): outside the app there is no host, so routing falls back to the
 * browser and notifications to the console. The shipped plugin.js resolves the
 * app's real SDK — Bun marks it external.
 */
export const host = {
  navigate(path: string): void {
    window.location.hash = path;
  },
  notify(options: { kind?: string; message: string }): void {
    console.info(`[${options.kind ?? "info"}] ${options.message}`);
  },
};
