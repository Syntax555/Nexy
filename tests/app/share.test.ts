import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultShareLabel, shareLink } from "../../src/app/share.js";

const request = {
  title: "Nexy battle",
  text: "Fighter A vs Fighter B",
  url: "https://example.test/Nexy/?battle=1"
};

function environment(overrides: Partial<Navigator> = {}) {
  return {
    navigator: {
      ...navigator,
      ...overrides
    } as Navigator,
    document
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shareLink", () => {
  it("prefers the native share sheet", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();

    await expect(
      shareLink(request, environment({ share, clipboard: { writeText } as unknown as Clipboard }))
    ).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith(request);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("does not copy when the user cancels the share sheet", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    const writeText = vi.fn();

    await expect(
      shareLink(request, environment({ share, clipboard: { writeText } as unknown as Clipboard }))
    ).resolves.toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the URL when native sharing is missing or fails", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const noShare = environment({ clipboard: { writeText } as unknown as Clipboard });
    Object.defineProperty(noShare.navigator, "share", { configurable: true, value: undefined });

    await expect(shareLink(request, noShare)).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(request.url);

    const rejectedShare = vi.fn().mockRejectedValue(new Error("Share unavailable"));
    await expect(
      shareLink(request, environment({ share: rejectedShare, clipboard: { writeText } as unknown as Clipboard }))
    ).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it("reports when neither sharing nor copying is allowed", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Denied"));
    const denied = environment({ clipboard: { writeText } as unknown as Clipboard });
    Object.defineProperty(denied.navigator, "share", { configurable: true, value: undefined });

    await expect(shareLink(request, denied)).resolves.toBe("unavailable");
  });

  it("cleans up the legacy copy field and restores focus when copying throws", async () => {
    const fallback = environment();
    Object.defineProperties(fallback.navigator, {
      share: { configurable: true, value: undefined },
      clipboard: { configurable: true, value: undefined }
    });
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const originalExecCommand = Object.getOwnPropertyDescriptor(document, "execCommand");
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => {
        throw new Error("Copy blocked");
      })
    });

    try {
      await expect(shareLink(request, fallback)).resolves.toBe("unavailable");
      expect(document.querySelector("textarea[readonly]")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    } finally {
      trigger.remove();
      if (originalExecCommand) Object.defineProperty(document, "execCommand", originalExecCommand);
      else Reflect.deleteProperty(document, "execCommand");
    }
  });
});

describe("defaultShareLabel", () => {
  it("describes the available platform action", () => {
    expect(defaultShareLabel({ share: vi.fn() } as unknown as Navigator)).toBe("Share battle");
    expect(defaultShareLabel({} as Navigator)).toBe("Copy battle link");
  });
});
