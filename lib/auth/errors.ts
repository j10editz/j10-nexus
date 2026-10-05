/**
 * Sanitized Public Authentication Error Mapper for J10 NEXUS
 *
 * Enforces controlled user-facing messages. Never leaks provider payloads,
 * internal exception details, project credentials, or infrastructure metadata.
 */

export function sanitizeAuthError(
  error: unknown,
  context: "signin" | "signup" | "recovery" | "reset" | "callback"
): string {
  if (context === "recovery") {
    // Neutral enumeration-safe response
    return "If an account exists for that email, we sent password reset instructions.";
  }

  if (!error) return "";

  const msg = typeof error === "object" && error !== null && "message" in error
    ? String((error as { message: unknown }).message).toLowerCase()
    : String(error).toLowerCase();

  const status = typeof error === "object" && error !== null && "status" in error
    ? (error as { status: unknown }).status
    : undefined;

  // Rate limiting / throttling
  if (status === 429 || msg.includes("rate limit") || msg.includes("too many requests")) {
    return "Too many requests. Please wait a few moments before trying again.";
  }

  switch (context) {
    case "signin":
      return "Email or password is incorrect.";

    case "signup":
      if (msg.includes("already registered") || msg.includes("user already exists")) {
        return "We could not create the account. Please verify your information and try again.";
      }
      return "We could not create the account. Please verify your information and try again.";

    case "reset":
      return "We could not update the password. Please request a new recovery link.";

    case "callback":
      return "The recovery link is invalid or has expired. Request a new link to continue.";

    default:
      return "An unexpected error occurred. Please try again.";
  }
}
