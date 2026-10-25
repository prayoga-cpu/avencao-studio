import { describe, expect, it } from "vitest";
import { addMonths, endOfMonth, formatDateOnly, parseDurationInput, previousPeriod, resolvePeriod, todayInTimezone } from "@/lib/dates";

describe("dates locales", () => {
  it("date du jour dans le fuseau de l'agence (Asia/Makassar = UTC+8)", () => {
    expect(todayInTimezone("Asia/Makassar", new Date("2026-10-24T17:30:00Z"))).toBe("2026-10-25");
    expect(todayInTimezone("Europe/Paris", new Date("2026-10-24T17:30:00Z"))).toBe("2026-10-24");
  });

  it("format français", () => {
    expect(formatDateOnly("2026-10-24")).toBe("24/10/2026");
  });

  it("périodes et période précédente comparable", () => {
    const p = resolvePeriod("month", "2026-10-24");
    expect(p).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(previousPeriod(p)).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("durées médias", () => {
    expect(parseDurationInput("1:30")).toBe(90);
    expect(parseDurationInput("45")).toBe(45);
    expect(parseDurationInput("1:75")).toBeNull();
  });
});
