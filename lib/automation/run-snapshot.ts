export function resolveAutomationRunGraphSnapshot(
  publishedVersion:
    | {
        graph_snapshot?:
          | Record<string, unknown>
          | null;
      }
    | null
    | undefined,
) {
  return (
    publishedVersion?.graph_snapshot ??
    {}
  );
}
