import { host } from "@hermes/plugin-sdk";

/** Route inside the app — the studio is a plugin page now, not a framed app. */
export function navigateTo(path: string): void {
  host.navigate(path);
}
