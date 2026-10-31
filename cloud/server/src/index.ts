// Entry point: apply optional remote env first, then load the server (config
// is read when ./main is first imported).
import { loadRemoteEnv } from "./bootstrap-env";

await loadRemoteEnv();
const { start } = await import("./main");
start().catch((error) => {
  console.error(error);
  process.exit(1);
});
