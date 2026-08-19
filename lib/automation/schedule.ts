/*
============================================================
J10 AUTOMATION SCHEDULE ENGINE
12J-A1

Supports standard 5-field cron expressions:

minute hour day-of-month month day-of-week

Examples:
0 9 * * 1
Every Monday at 9:00 AM

0 8 * * *
Every day at 8:00 AM

*/



export type ScheduleEvaluation = {
  expression: string;
  timezone: string;
  nextRunAt: string;
};



type CronFieldConfig = {
  min: number;
  max: number;
  normalize?: (
    value: number
  ) => number;
};



type ZonedDateParts = {
  minute: number;
  hour: number;
  dayOfMonth: number;
  month: number;
  dayOfWeek: number;
};



const WEEKDAY_MAP: Record<
  string,
  number
> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};



/*
============================================================
PUBLIC API
============================================================
*/

export function validateScheduleExpression(
  expression: string
) {
  parseCronExpression(
    expression
  );

  return true;
}



export function validateTimezone(
  timezone: string
) {
  const cleanTimezone =
    timezone.trim();

  if (!cleanTimezone) {
    throw new Error(
      "Timezone is required."
    );
  }

  try {
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          cleanTimezone,
      }
    ).format(
      new Date()
    );
  } catch {
    throw new Error(
      `Invalid timezone: ${cleanTimezone}`
    );
  }

  return cleanTimezone;
}



export function getNextScheduledRun(
  expression: string,
  timezone: string,
  from:
    | Date
    | string =
    new Date()
): ScheduleEvaluation {
  const cleanExpression =
    normalizeScheduleExpression(
      expression
    );

  const cleanTimezone =
    validateTimezone(
      timezone
    );

  const cron =
    parseCronExpression(
      cleanExpression
    );

  const startDate =
    from instanceof Date
      ? new Date(
          from.getTime()
        )
      : new Date(from);

  if (
    Number.isNaN(
      startDate.getTime()
    )
  ) {
    throw new Error(
      "Invalid schedule start date."
    );
  }

  /*
  ============================================================
  START FROM NEXT WHOLE MINUTE

  Prevents a workflow from immediately matching
  the same minute it was just calculated from.
  ============================================================
  */

  const candidate =
    new Date(
      startDate.getTime()
    );

  candidate.setUTCSeconds(
    0,
    0
  );

  candidate.setUTCMinutes(
    candidate.getUTCMinutes() +
      1
  );

  /*
  ============================================================
  SEARCH WINDOW

  Search up to 366 days minute-by-minute.

  This supports normal business schedules while preventing
  an infinite loop from malformed/impossible schedules.
  ============================================================
  */

  const maxMinutes =
    366 *
    24 *
    60;

  for (
    let index = 0;
    index < maxMinutes;
    index += 1
  ) {
    const parts =
      getZonedDateParts(
        candidate,
        cleanTimezone
      );

    if (
      cronMatchesDate(
        cron,
        parts
      )
    ) {
      return {
        expression:
          cleanExpression,

        timezone:
          cleanTimezone,

        nextRunAt:
          candidate.toISOString(),
      };
    }

    candidate.setUTCMinutes(
      candidate.getUTCMinutes() +
        1
    );
  }

  throw new Error(
    "J10 could not calculate the next scheduled run within 366 days."
  );
}



export function isScheduleDue(
  nextRunAt:
    | string
    | null
    | undefined,
  now:
    | Date
    | string =
    new Date()
) {
  if (!nextRunAt) {
    return false;
  }

  const nextDate =
    new Date(
      nextRunAt
    );

  const currentDate =
    now instanceof Date
      ? now
      : new Date(now);

  if (
    Number.isNaN(
      nextDate.getTime()
    ) ||
    Number.isNaN(
      currentDate.getTime()
    )
  ) {
    return false;
  }

  return (
    nextDate.getTime() <=
    currentDate.getTime()
  );
}



export function calculateFollowingRun(
  expression: string,
  timezone: string,
  previousRunAt:
    | Date
    | string
) {
  return getNextScheduledRun(
    expression,
    timezone,
    previousRunAt
  );
}



/*
============================================================
CRON PARSER
============================================================
*/

type ParsedCron = {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;

  dayOfMonthWildcard: boolean;
  dayOfWeekWildcard: boolean;
};



function parseCronExpression(
  expression: string
): ParsedCron {
  const cleanExpression =
    normalizeScheduleExpression(
      expression
    );

  const fields =
    cleanExpression.split(
      " "
    );

  if (
    fields.length !==
    5
  ) {
    throw new Error(
      "Schedule expression must use 5 cron fields: minute hour day-of-month month day-of-week."
    );
  }

  const [
    minuteField,
    hourField,
    dayOfMonthField,
    monthField,
    dayOfWeekField,
  ] = fields;

  return {
    minute:
      parseCronField(
        minuteField,
        {
          min: 0,
          max: 59,
        }
      ),

    hour:
      parseCronField(
        hourField,
        {
          min: 0,
          max: 23,
        }
      ),

    dayOfMonth:
      parseCronField(
        dayOfMonthField,
        {
          min: 1,
          max: 31,
        }
      ),

    month:
      parseCronField(
        monthField,
        {
          min: 1,
          max: 12,
        }
      ),

    dayOfWeek:
      parseCronField(
        dayOfWeekField,
        {
          min: 0,
          max: 7,

          normalize:
            (
              value
            ) =>
              value === 7
                ? 0
                : value,
        }
      ),

    dayOfMonthWildcard:
      dayOfMonthField ===
      "*",

    dayOfWeekWildcard:
      dayOfWeekField ===
      "*",
  };
}



function parseCronField(
  field: string,
  config: CronFieldConfig
) {
  const values =
    new Set<number>();

  const sections =
    field.split(",");

  for (
    const section of
      sections
  ) {
    parseCronSection(
      section,
      config,
      values
    );
  }

  if (
    values.size ===
    0
  ) {
    throw new Error(
      `Invalid cron field: ${field}`
    );
  }

  return values;
}



function parseCronSection(
  section: string,
  config: CronFieldConfig,
  values: Set<number>
) {
  const [
    base,
    stepText,
  ] =
    section.split("/");

  let step = 1;

  if (
    stepText !==
    undefined
  ) {
    step =
      parseInteger(
        stepText
      );

    if (
      step <= 0
    ) {
      throw new Error(
        `Invalid cron step: ${section}`
      );
    }
  }

  /*
  ============================================================
  WILDCARD
  ============================================================
  */

  if (
    base ===
    "*"
  ) {
    for (
      let value =
        config.min;
      value <=
      config.max;
      value += step
    ) {
      addCronValue(
        values,
        value,
        config
      );
    }

    return;
  }

  /*
  ============================================================
  RANGE
  ============================================================
  */

  if (
    base.includes("-")
  ) {
    const [
      startText,
      endText,
    ] =
      base.split("-");

    const start =
      parseInteger(
        startText
      );

    const end =
      parseInteger(
        endText
      );

    validateCronValue(
      start,
      config
    );

    validateCronValue(
      end,
      config
    );

    if (
      start >
      end
    ) {
      throw new Error(
        `Invalid cron range: ${section}`
      );
    }

    for (
      let value =
        start;
      value <= end;
      value += step
    ) {
      addCronValue(
        values,
        value,
        config
      );
    }

    return;
  }

  /*
  ============================================================
  SINGLE VALUE
  ============================================================
  */

  const value =
    parseInteger(
      base
    );

  validateCronValue(
    value,
    config
  );

  addCronValue(
    values,
    value,
    config
  );
}



function addCronValue(
  values: Set<number>,
  value: number,
  config: CronFieldConfig
) {
  validateCronValue(
    value,
    config
  );

  const normalized =
    config.normalize
      ? config.normalize(
          value
        )
      : value;

  values.add(
    normalized
  );
}



function validateCronValue(
  value: number,
  config: CronFieldConfig
) {
  if (
    value <
      config.min ||
    value >
      config.max
  ) {
    throw new Error(
      `Cron value ${value} must be between ${config.min} and ${config.max}.`
    );
  }
}



function parseInteger(
  value: string
) {
  if (
    !/^\d+$/.test(
      value
    )
  ) {
    throw new Error(
      `Invalid cron value: ${value}`
    );
  }

  return Number(
    value
  );
}



/*
============================================================
CRON MATCHING
============================================================
*/

function cronMatchesDate(
  cron: ParsedCron,
  parts: ZonedDateParts
) {
  if (
    !cron.minute.has(
      parts.minute
    )
  ) {
    return false;
  }

  if (
    !cron.hour.has(
      parts.hour
    )
  ) {
    return false;
  }

  if (
    !cron.month.has(
      parts.month
    )
  ) {
    return false;
  }

  const dayOfMonthMatches =
    cron.dayOfMonth.has(
      parts.dayOfMonth
    );

  const dayOfWeekMatches =
    cron.dayOfWeek.has(
      parts.dayOfWeek
    );

  /*
  ============================================================
  STANDARD CRON DAY RULE

  If both DOM and DOW are restricted:
  either one may match.

  If one is wildcard:
  the restricted field must match.
  ============================================================
  */

  if (
    cron.dayOfMonthWildcard &&
    cron.dayOfWeekWildcard
  ) {
    return true;
  }

  if (
    cron.dayOfMonthWildcard
  ) {
    return dayOfWeekMatches;
  }

  if (
    cron.dayOfWeekWildcard
  ) {
    return dayOfMonthMatches;
  }

  return (
    dayOfMonthMatches ||
    dayOfWeekMatches
  );
}



/*
============================================================
TIMEZONE
============================================================
*/

function getZonedDateParts(
  date: Date,
  timezone: string
): ZonedDateParts {
  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          timezone,

        minute:
          "2-digit",

        hour:
          "2-digit",

        hourCycle:
          "h23",

        day:
          "2-digit",

        month:
          "2-digit",

        weekday:
          "short",
      }
    );

  const parts =
    formatter.formatToParts(
      date
    );

  const values =
    new Map<
      string,
      string
    >();

  for (
    const part of
      parts
  ) {
    values.set(
      part.type,
      part.value
    );
  }

  const weekday =
    values.get(
      "weekday"
    );

  if (
    !weekday ||
    WEEKDAY_MAP[
      weekday
    ] === undefined
  ) {
    throw new Error(
      "Could not calculate schedule weekday."
    );
  }

  return {
    minute:
      Number(
        values.get(
          "minute"
        )
      ),

    hour:
      Number(
        values.get(
          "hour"
        )
      ),

    dayOfMonth:
      Number(
        values.get(
          "day"
        )
      ),

    month:
      Number(
        values.get(
          "month"
        )
      ),

    dayOfWeek:
      WEEKDAY_MAP[
        weekday
      ],
  };
}



/*
============================================================
NORMALIZATION
============================================================
*/

function normalizeScheduleExpression(
  expression: string
) {
  const cleanExpression =
    expression
      .trim()
      .replace(
        /\s+/g,
        " "
      );

  if (
    !cleanExpression
  ) {
    throw new Error(
      "Schedule expression is required."
    );
  }

  return cleanExpression;
}