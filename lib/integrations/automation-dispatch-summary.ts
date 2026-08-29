import type {
  AutomationEventDispatchResult,
} from "../automation/event-trigger-engine";

const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(api[_-]?key|authorization|cookie|password|secret|token)\b\s*[:=]\s*([^\s|,;]+)/gi;

const BEARER_PATTERN =
  /\bbearer\s+[^\s|,;]+/gi;

function redactFailureMessage(
  message: string,
) {
  return message
    .replace(
      SENSITIVE_ASSIGNMENT_PATTERN,
      "$1=[REDACTED]",
    )
    .replace(
      BEARER_PATTERN,
      "Bearer [REDACTED]",
    );
}

export function summarizeIntegrationAutomationDispatchFailure(
  dispatch:
    AutomationEventDispatchResult,
) {
  const details =
    dispatch.results
      .filter(
        (result) =>
          result.status ===
          "failed",
      )
      .map((result) =>
        redactFailureMessage(
          result.message,
        ),
      )
      .filter(Boolean)
      .slice(0, 3)
      .join(" | ");

  return (
    details ||
    "J10 could not dispatch the external trigger to every matched workflow."
  ).slice(0, 2_000);
}
