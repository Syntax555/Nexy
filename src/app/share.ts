export interface ShareLinkRequest {
  readonly title: string;
  readonly text: string;
  readonly url: string;
}

export type ShareLinkOutcome = "shared" | "copied" | "cancelled" | "unavailable";

interface ShareEnvironment {
  readonly navigator: Navigator;
  readonly document: Document;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

async function copyText(value: string, environment: ShareEnvironment): Promise<boolean> {
  if (environment.navigator.clipboard?.writeText) {
    await environment.navigator.clipboard.writeText(value);
    return true;
  }

  const field = environment.document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  const returnFocus =
    environment.document.activeElement instanceof HTMLElement ? environment.document.activeElement : null;
  environment.document.body.append(field);
  try {
    field.select();
    return environment.document.execCommand("copy");
  } finally {
    field.remove();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }
}

/**
 * Uses the platform share sheet when available and falls back to a copied URL.
 * A cancelled native share is intentionally silent and never triggers a copy.
 */
export async function shareLink(
  request: ShareLinkRequest,
  environment: ShareEnvironment = { navigator, document }
): Promise<ShareLinkOutcome> {
  if (typeof environment.navigator.share === "function") {
    try {
      await environment.navigator.share(request);
      return "shared";
    } catch (error) {
      if (isAbortError(error)) return "cancelled";
    }
  }

  try {
    return (await copyText(request.url, environment)) ? "copied" : "unavailable";
  } catch {
    return "unavailable";
  }
}

export function defaultShareLabel(navigatorObject: Navigator = navigator): string {
  return typeof navigatorObject.share === "function" ? "Share battle" : "Copy battle link";
}
