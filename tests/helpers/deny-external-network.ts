const nativeFetch = globalThis.fetch;

globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
  const rawUrl = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  const url = new URL(rawUrl);

  if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]") {
    return nativeFetch(input, init);
  }

  throw new Error(
    `External network access is disabled in tests (${url.hostname}). Mock fetch explicitly for this test.`
  );
}) as typeof fetch;
