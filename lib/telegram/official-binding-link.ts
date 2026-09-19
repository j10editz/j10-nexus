const OFFICIAL_BOT_USERNAME = "j10_nexus_leads_bot";
const BINDING_TOKEN_PATTERN = /^b_[A-Za-z0-9_-]{43}$/;

/**
 * Accept only the signed deep link returned for the official J10 Telegram bot.
 * The browser must never render an arbitrary URL returned by a failed or
 * malformed registration response.
 */
export function getOfficialTelegramBindingLink(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const bot = (payload as { bot?: unknown }).bot;
  if (!bot || typeof bot !== "object") return null;

  const { username, shareLink } = bot as { username?: unknown; shareLink?: unknown };
  if (username !== OFFICIAL_BOT_USERNAME || typeof shareLink !== "string") return null;

  try {
    const url = new URL(shareLink);
    const token = url.searchParams.get("start");

    if (
      url.protocol !== "https:" ||
      url.hostname !== "t.me" ||
      url.pathname !== `/${OFFICIAL_BOT_USERNAME}` ||
      !BINDING_TOKEN_PATTERN.test(token || "") ||
      [...url.searchParams.keys()].some((key) => key !== "start")
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}
