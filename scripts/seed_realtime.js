const { execFileSync } = require("child_process");

try {
  const code = `
    {:beam_file, _, _, _, _, code} = :beam_disasm.file(~c"/app/lib/realtime-2.130.0/ebin/Elixir.Extensions.PostgresCdcRls.ReplicationPoller.beam")
    init_fn = Enum.find(code, fn {:function, :init, _, _, _} -> true; _ -> false end)
    IO.inspect(init_fn, limit: :infinity)
  `;
  const out = execFileSync("docker", ["exec", "supabase-test-realtime", "/app/bin/realtime", "eval", code], {
    encoding: "utf8",
  });
  console.log("Disassembly:", out);
} catch (err) {
  console.error("Error:", err.stdout || err.message);
  if (err.stderr) console.error("Stderr:", err.stderr);
}
