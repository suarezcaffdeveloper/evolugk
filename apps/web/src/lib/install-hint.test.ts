import { describe, expect, it } from "vitest";
import { DISMISS_DAYS, detectPlatform, isDismissed } from "./install-hint";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

describe("detectPlatform", () => {
  it("una app ya instalada no recibe sugerencias, en cualquier sistema", () => {
    expect(detectPlatform({ userAgent: IPHONE, standalone: true })).toBe("installed");
    expect(detectPlatform({ userAgent: ANDROID, standalone: true })).toBe("installed");
  });

  it("reconoce iPhone y iPad", () => {
    expect(detectPlatform({ userAgent: IPHONE, standalone: false })).toBe("ios");
    expect(detectPlatform({ userAgent: IPAD_AS_MAC, standalone: false, maxTouchPoints: 5 })).toBe(
      "ios",
    );
  });

  it("una Mac de escritorio no es un iPad", () => {
    expect(detectPlatform({ userAgent: IPAD_AS_MAC, standalone: false, maxTouchPoints: 0 })).toBe(
      "other",
    );
    expect(detectPlatform({ userAgent: IPAD_AS_MAC, standalone: false })).toBe("other");
  });

  it("Android y escritorio caen en 'other' (dependen del aviso del navegador)", () => {
    expect(detectPlatform({ userAgent: ANDROID, standalone: false })).toBe("other");
  });
});

describe("isDismissed", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 9, 22);

  it("nunca tocó 'Ahora no': se sugiere", () => {
    expect(isDismissed(null, now)).toBe(false);
  });

  it("se respeta durante 30 días y después vuelve a sugerirse", () => {
    expect(DISMISS_DAYS).toBe(30);
    expect(isDismissed(now - DAY, now)).toBe(true);
    expect(isDismissed(now - 29 * DAY, now)).toBe(true);
    expect(isDismissed(now - 30 * DAY, now)).toBe(false);
  });

  it("un valor guardado roto o en el futuro no silencia el aviso", () => {
    expect(isDismissed(Number.NaN, now)).toBe(false);
    expect(isDismissed(now + 5 * DAY, now)).toBe(false);
  });
});
