import { describe, expect, it } from "vitest";
import { resolveNpxInvocation, runSupabaseCli } from "../../scripts/lib/supabase-cli-process.mjs";

const sql = "SELECT 'quotes; ✓' AS value;\r\nDO $$ BEGIN RAISE NOTICE 'semi; colon'; END $$;";

type Call = { command: string; args: string[]; options: { input?: Buffer; shell?: boolean } };

function absentThenSuccess(calls: Call[]) {
  return ((command: string, args: string[], options: Call["options"]) => {
    calls.push({ command, args, options });
    if (calls.length === 1) return { error: { code: "ENOENT" } };
    return { status: 0, stdout: '{"rows":[{"ok":true}]}', stderr: "" };
  }) as never;
}

describe("Supabase CLI SQL transport", () => {
  it("forwards multiline UTF-8 SQL exclusively through stdin without shell arguments or logs", () => {
    const calls: Call[] = [];
    const output = runSupabaseCli({ args: ["db", "query", "--output", "json"], sql, cwd: process.cwd(), spawn: absentThenSuccess(calls), platform: "linux" });
    const finalCall = calls.at(-1)!;
    expect(output).toContain('"ok":true');
    expect(Buffer.isBuffer(finalCall.options.input)).toBe(true);
    expect(finalCall.options.input!.toString("utf8")).toBe(sql);
    expect(finalCall.args.join(" ")).not.toContain(sql);
    expect(finalCall.options.shell).toBe(false);
  });

  it("uses a Node-hosted npm CLI on Windows without cmd or SQL arguments", () => {
    const calls: Call[] = [];
    runSupabaseCli({ args: ["db", "query", "--output", "json"], sql, cwd: process.cwd(), spawn: absentThenSuccess(calls), platform: "win32", execPath: "C:/node/node.exe", exists: () => true });
    const finalCall = calls.at(-1)!;
    expect(finalCall.command).toBe("C:/node/node.exe");
    expect(finalCall.args[0]).toContain("npx-cli.js");
    expect(finalCall.args.join(" ")).not.toContain(sql);
    expect(finalCall.options.input!.toString("utf8")).toBe(sql);
  });

  it("fails closed for empty SQL, nonzero exits, empty output, and missing Windows npm CLI", () => {
    expect(() => runSupabaseCli({ args: ["db", "query"], sql: "", cwd: process.cwd() })).toThrow("SUPABASE_SQL_EMPTY");
    expect(() => runSupabaseCli({ args: ["db", "query"], sql, cwd: process.cwd(), spawn: (() => ({ status: 1, stdout: "", stderr: "password=secret" })) as never })).toThrow("SUPABASE_CLI_FAILED exit=1: password=[REDACTED]");
    expect(() => runSupabaseCli({ args: ["db", "query"], sql, cwd: process.cwd(), spawn: (() => ({ status: 0, stdout: "", stderr: "" })) as never })).toThrow("SUPABASE_CLI_EMPTY_OUTPUT");
    expect(() => resolveNpxInvocation({ platform: "win32", execPath: "C:/node/node.exe", exists: () => false })).toThrow("SUPABASE_CLI_UNAVAILABLE");
  });

  it("normalizes identical Linux and Windows query output", () => {
    const execute = (platform: NodeJS.Platform) => runSupabaseCli({ args: ["db", "query", "--output", "json"], sql, cwd: process.cwd(), spawn: absentThenSuccess([]), platform, execPath: "C:/node/node.exe", exists: () => true });
    expect(execute("linux")).toBe(execute("win32"));
  });
});
