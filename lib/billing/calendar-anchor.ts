/**
 * J10 NEXUS — Calendar-Safe Monthly Billing Anchor Utilities
 *
 * Provides safe calendar calculations for monthly subscription billing anchors.
 * CRITICAL INVARIANT: Never encodes calendar months as fixed seconds (e.g. 30 * 86400 or 365 * 86400)
 * because real calendar months vary between 28, 29, 30, and 31 days.
 */

/**
 * Calculates the next billing anchor date following calendar rules.
 * Preserves the original anchor day (e.g., if started on Jan 31, March will land on March 31,
 * February lands on Feb 28 or Feb 29 in leap years, and April lands on April 30).
 */
export function getCalendarMonthlyAnchor(
  startDate: Date,
  monthOffset: number
): Date {
  const originalDay = startDate.getUTCDate();
  const startYear = startDate.getUTCFullYear();
  const startMonth = startDate.getUTCMonth();

  // Target year and month
  const targetYear = startYear + Math.floor((startMonth + monthOffset) / 12);
  const targetMonth = ((startMonth + monthOffset) % 12 + 12) % 12;

  // Find the number of days in target month
  // (Passing month + 1 with day 0 returns the last day of target month)
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

  // If original anchor day exceeds days in target month, clamp to last day of month
  const clampedDay = Math.min(originalDay, daysInTargetMonth);

  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    clampedDay,
    startDate.getUTCHours(),
    startDate.getUTCMinutes(),
    startDate.getUTCSeconds(),
    startDate.getUTCMilliseconds()
  ));
}

/**
 * Generates an array of exactly `iterations` monthly billing periods.
 * Each period has a start date, end date, and anchor day.
 */
export function generateMonthlyBillingSchedule(
  startDate: Date,
  iterations: number = 12
): Array<{
  cycle: number;
  periodStart: Date;
  periodEnd: Date;
  daysInPeriod: number;
}> {
  const periods = [];
  for (let i = 0; i < iterations; i++) {
    const periodStart = getCalendarMonthlyAnchor(startDate, i);
    const periodEnd = getCalendarMonthlyAnchor(startDate, i + 1);
    const daysInPeriod = Math.round((periodEnd.getTime() - periodStart.getTime()) / (86400 * 1000));
    periods.push({
      cycle: i + 1,
      periodStart,
      periodEnd,
      daysInPeriod
    });
  }
  return periods;
}

/**
 * Adds exact calendar months to a date without using millisecond multiplication.
 */
export function addCalendarMonths(date: Date, months: number): Date {
  return getCalendarMonthlyAnchor(date, months);
}
