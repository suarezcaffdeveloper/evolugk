import { describe, expect, it } from "vitest";
import { addDays, argentinaDate, argentinaDatePlusDays, formatCalendarDate } from "./dates";

describe("argentinaDate", () => {
  it("usa la fecha de Argentina (UTC-3), no la de UTC", () => {
    // 01:30 UTC del 21/10 todavía es 22:30 del 20/10 en Argentina.
    expect(argentinaDate(new Date("2026-10-21T01:30:00Z"))).toBe("2026-10-20");
    expect(argentinaDate(new Date("2026-10-21T03:00:00Z"))).toBe("2026-10-21");
    expect(argentinaDate(new Date("2026-10-21T02:59:59Z"))).toBe("2026-10-20");
  });
});

describe("addDays", () => {
  it.each([
    ["2026-10-20", 30, "2026-11-19"],
    ["2026-12-25", 10, "2027-01-04"],
    ["2028-02-28", 1, "2028-02-29"], // bisiesto
    ["2027-02-28", 1, "2027-03-01"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2026-10-20", 0, "2026-10-20"],
  ])("%s + %i días = %s", (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});

describe("argentinaDatePlusDays", () => {
  it("cuenta los días desde la fecha de Argentina", () => {
    expect(argentinaDatePlusDays(new Date("2026-10-21T01:30:00Z"), 30)).toBe("2026-11-19");
  });
});

describe("formatCalendarDate", () => {
  it.each([
    ["2026-11-19", "19 de noviembre de 2026"],
    ["2027-01-01", "1 de enero de 2027"],
    ["2028-02-29", "29 de febrero de 2028"],
  ])("%s -> %s", (date, expected) => {
    expect(formatCalendarDate(date)).toBe(expected);
  });
});
