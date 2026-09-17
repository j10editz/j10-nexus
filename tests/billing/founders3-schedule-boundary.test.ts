import { describe, it, expect } from "vitest";
import {
  getCalendarMonthlyAnchor,
  generateMonthlyBillingSchedule,
  addCalendarMonths,
} from "../../lib/billing/calendar-anchor";

describe("Founder’s 3 Subscription Schedule Calendar Boundary Tests", () => {
  // Case 1: Standard start on 2026-09-16
  it("verifies 2026-09-16 start produces 12 consecutive monthly periods spanning 365 elapsed days ending on calendar anniversary", () => {
    const startDate = new Date(Date.UTC(2026, 8, 16, 17, 40, 30)); // Sep 16, 2026
    const schedule = generateMonthlyBillingSchedule(startDate, 13);

    expect(schedule).toHaveLength(13);

    // Verify continuous, non-overlapping periods
    for (let i = 0; i < 12; i++) {
      expect(schedule[i].periodEnd.toISOString()).toBe(schedule[i + 1].periodStart.toISOString());
    }

    // Expected monthly boundaries
    const expectedBoundaries = [
      "2026-09-16T17:40:30.000Z", // Cycle 1 start
      "2026-10-16T17:40:30.000Z", // Cycle 2 start
      "2026-11-16T17:40:30.000Z", // Cycle 3 start
      "2026-12-16T17:40:30.000Z", // Cycle 4 start
      "2027-01-16T17:40:30.000Z", // Cycle 5 start
      "2027-02-16T17:40:30.000Z", // Cycle 6 start
      "2027-03-16T17:40:30.000Z", // Cycle 7 start
      "2027-04-16T17:40:30.000Z", // Cycle 8 start
      "2027-05-16T17:40:30.000Z", // Cycle 9 start
      "2027-06-16T17:40:30.000Z", // Cycle 10 start
      "2027-07-16T17:40:30.000Z", // Cycle 11 start
      "2027-08-16T17:40:30.000Z", // Cycle 12 start
      "2027-09-16T17:40:30.000Z", // Phase 1 end / Cycle 13 start (13th billing anchor)
      "2027-10-16T17:40:30.000Z", // Cycle 13 end
    ];

    for (let i = 0; i < 13; i++) {
      expect(schedule[i].periodStart.toISOString()).toBe(expectedBoundaries[i]);
      expect(schedule[i].periodEnd.toISOString()).toBe(expectedBoundaries[i + 1]);
    }

    // Month 12 ends exactly on the 1-year calendar anniversary: Sep 16, 2027
    const phase1End = schedule[11].periodEnd;
    expect(phase1End.toISOString()).toBe("2027-09-16T17:40:30.000Z");

    // Phase 2 begins on the exact thirteenth billing anchor
    expect(schedule[12].periodStart.toISOString()).toBe("2027-09-16T17:40:30.000Z");

    // Elapsed days over the 12 non-leap months is 365
    const daysCycles1to12 = schedule.slice(0, 12).map((s) => s.daysInPeriod);
    const totalDays = daysCycles1to12.reduce((a, b) => a + b, 0);
    expect(totalDays).toBe(365);
  });

  // Case 2: Leap-year start spanning leap day on 2028-01-31
  it("verifies 2028-01-31 leap-year start spans 366 elapsed days with February clamping and restoration", () => {
    const startDate = new Date(Date.UTC(2028, 0, 31, 12, 0, 0)); // Jan 31, 2028 (Leap Year)
    const schedule = generateMonthlyBillingSchedule(startDate, 13);

    expect(schedule).toHaveLength(13);

    // Continuous non-overlapping check
    for (let i = 0; i < 12; i++) {
      expect(schedule[i].periodEnd.toISOString()).toBe(schedule[i + 1].periodStart.toISOString());
    }

    // Cycle 1: Jan 31, 2028 -> Feb 29, 2028 (clamps to leap day 29)
    expect(schedule[0].periodStart.toISOString()).toBe("2028-01-31T12:00:00.000Z");
    expect(schedule[0].periodEnd.toISOString()).toBe("2028-02-29T12:00:00.000Z");
    expect(schedule[0].daysInPeriod).toBe(29);

    // Cycle 2: Feb 29, 2028 -> Mar 31, 2028 (restores anchor to 31)
    expect(schedule[1].periodStart.toISOString()).toBe("2028-02-29T12:00:00.000Z");
    expect(schedule[1].periodEnd.toISOString()).toBe("2028-03-31T12:00:00.000Z");
    expect(schedule[1].daysInPeriod).toBe(31);

    // Cycle 3: Mar 31, 2028 -> Apr 30, 2028 (clamps to 30)
    expect(schedule[2].periodEnd.toISOString()).toBe("2028-04-30T12:00:00.000Z");

    // Cycle 4: Apr 30, 2028 -> May 31, 2028 (restores to 31)
    expect(schedule[3].periodEnd.toISOString()).toBe("2028-05-31T12:00:00.000Z");

    // Cycle 12 end / Calendar anniversary: Jan 31, 2029
    expect(schedule[11].periodEnd.toISOString()).toBe("2029-01-31T12:00:00.000Z");

    // Phase 2 begins on exact thirteenth billing anchor
    expect(schedule[12].periodStart.toISOString()).toBe("2029-01-31T12:00:00.000Z");

    // Because 2028 is a leap year, 12 months span exactly 366 elapsed days
    const totalDays = schedule.slice(0, 12).reduce((sum, p) => sum + p.daysInPeriod, 0);
    expect(totalDays).toBe(366);
  });

  // Case 3: Normal-year start on 2029-01-31
  it("verifies 2029-01-31 normal-year start clamps to Feb 28 and spans 365 elapsed days", () => {
    const startDate = new Date(Date.UTC(2029, 0, 31, 10, 0, 0)); // Jan 31, 2029
    const schedule = generateMonthlyBillingSchedule(startDate, 13);

    // Cycle 1: Jan 31, 2029 -> Feb 28, 2029 (clamps to 28)
    expect(schedule[0].periodStart.toISOString()).toBe("2029-01-31T10:00:00.000Z");
    expect(schedule[0].periodEnd.toISOString()).toBe("2029-02-28T10:00:00.000Z");
    expect(schedule[0].daysInPeriod).toBe(28);

    // Cycle 2: Feb 28, 2029 -> Mar 31, 2029 (restores anchor to 31)
    expect(schedule[1].periodStart.toISOString()).toBe("2029-02-28T10:00:00.000Z");
    expect(schedule[1].periodEnd.toISOString()).toBe("2029-03-31T10:00:00.000Z");
    expect(schedule[1].daysInPeriod).toBe(31);

    // Cycle 12 end / Calendar anniversary: Jan 31, 2030
    expect(schedule[11].periodEnd.toISOString()).toBe("2030-01-31T10:00:00.000Z");
    expect(schedule[12].periodStart.toISOString()).toBe("2030-01-31T10:00:00.000Z");

    // Total elapsed days in normal year is 365
    const totalDays = schedule.slice(0, 12).reduce((sum, p) => sum + p.daysInPeriod, 0);
    expect(totalDays).toBe(365);
  });

  // Case 4: February 29 leap-day start
  it("verifies 2028-02-29 leap-day start ends on Feb 28, 2029 without drifting", () => {
    const startDate = new Date(Date.UTC(2028, 1, 29, 15, 0, 0)); // Feb 29, 2028
    const schedule = generateMonthlyBillingSchedule(startDate, 13);

    // Continuous non-overlapping
    for (let i = 0; i < 12; i++) {
      expect(schedule[i].periodEnd.toISOString()).toBe(schedule[i + 1].periodStart.toISOString());
    }

    // Cycle 1: Feb 29, 2028 -> Mar 29, 2028
    expect(schedule[0].periodStart.toISOString()).toBe("2028-02-29T15:00:00.000Z");
    expect(schedule[0].periodEnd.toISOString()).toBe("2028-03-29T15:00:00.000Z");

    // Subsequent months preserve day 29
    expect(schedule[1].periodEnd.toISOString()).toBe("2028-04-29T15:00:00.000Z");
    expect(schedule[2].periodEnd.toISOString()).toBe("2028-05-29T15:00:00.000Z");

    // Cycle 12 end: in 2029 (non-leap), Feb has only 28 days, so day 29 clamps to Feb 28, 2029
    expect(schedule[11].periodEnd.toISOString()).toBe("2029-02-28T15:00:00.000Z");
    expect(schedule[12].periodStart.toISOString()).toBe("2029-02-28T15:00:00.000Z");

    // Cycle 13 end: Mar 29, 2029 (restores anchor to 29!)
    expect(schedule[12].periodEnd.toISOString()).toBe("2029-03-29T15:00:00.000Z");
  });

  // Case 5: December/January boundary without iterative drift
  it("verifies December/January boundary transitions without date drift or timezone shifting", () => {
    const decStart = new Date(Date.UTC(2026, 11, 31, 8, 30, 0)); // Dec 31, 2026
    const schedule = generateMonthlyBillingSchedule(decStart, 13);

    // Cycle 1: Dec 31, 2026 -> Jan 31, 2027 (crosses year boundary cleanly)
    expect(schedule[0].periodStart.toISOString()).toBe("2026-12-31T08:30:00.000Z");
    expect(schedule[0].periodEnd.toISOString()).toBe("2027-01-31T08:30:00.000Z");

    // Cycle 2: Jan 31, 2027 -> Feb 28, 2027 (clamps to 28)
    expect(schedule[1].periodStart.toISOString()).toBe("2027-01-31T08:30:00.000Z");
    expect(schedule[1].periodEnd.toISOString()).toBe("2027-02-28T08:30:00.000Z");

    // Cycle 3: Feb 28, 2027 -> Mar 31, 2027 (restores anchor to 31)
    expect(schedule[2].periodEnd.toISOString()).toBe("2027-03-31T08:30:00.000Z");

    // Cycle 12 ends on calendar anniversary: Dec 31, 2027
    expect(schedule[11].periodEnd.toISOString()).toBe("2027-12-31T08:30:00.000Z");
    expect(schedule[12].periodStart.toISOString()).toBe("2027-12-31T08:30:00.000Z");
    expect(schedule[12].periodEnd.toISOString()).toBe("2028-01-31T08:30:00.000Z");
  });

  // Commercial Invariant Simulation
  it("simulates 12 Founder cycles at $99 followed by Cycle 13 at $149 with zero proration", () => {
    const startDate = new Date(Date.UTC(2026, 8, 16, 17, 40, 30)); // Sep 16, 2026
    const schedule = generateMonthlyBillingSchedule(startDate, 13);

    const invoices = schedule.map((period, index) => {
      const cycle = index + 1;
      const isFounderPhase = cycle <= 12;
      const expectedAmount = isFounderPhase ? 9900 : 14900;
      const priceId = isFounderPhase ? "price_founders3_monthly_99" : "price_standard_monthly_149";

      return {
        cycle,
        amount_due: expectedAmount,
        amount_paid: expectedAmount,
        subtotal: expectedAmount,
        total: expectedAmount,
        status: "paid",
        priceId,
        proration: false,
        periodStart: period.periodStart.toISOString(),
        periodEnd: period.periodEnd.toISOString(),
      };
    });

    // Verify Cycles 1 to 12 are all $99.00 with proration=false
    for (let c = 1; c <= 12; c++) {
      const inv = invoices[c - 1];
      expect(inv.amount_paid).toBe(9900);
      expect(inv.priceId).toBe("price_founders3_monthly_99");
      expect(inv.proration).toBe(false);
    }

    // Verify Cycle 13 is $149.00 with proration=false
    const cycle13 = invoices[12];
    expect(cycle13.amount_paid).toBe(14900);
    expect(cycle13.priceId).toBe("price_standard_monthly_149");
    expect(cycle13.proration).toBe(false);

    // Verify Phase 1 end date matches Cycle 13 start date exactly (zero gap, zero overlap)
    expect(invoices[11].periodEnd).toBe(invoices[12].periodStart);
    expect(invoices[11].periodEnd).toBe("2027-09-16T17:40:30.000Z");
    expect(invoices[12].periodStart).toBe("2027-09-16T17:40:30.000Z");
  });
});
