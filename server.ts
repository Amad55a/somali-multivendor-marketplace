import { createServer } from "node:http";
import { loadEnvConfig } from "@next/env";

async function startServer() {
  const dev = process.argv.includes("--dev");
  Reflect.set(process.env, "NODE_ENV", dev ? "development" : "production");
  loadEnvConfig(process.cwd(), dev);

  const hostname = process.env.HOST ?? "0.0.0.0";
const portArgIndex = process.argv.indexOf("--port");
const port = Number(
  portArgIndex !== -1
    ? process.argv[portArgIndex + 1]
    : process.env.PORT ?? 3000
);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const [{ default: next }, { attachCommunicationSocketServer }] = await Promise.all([
    import("next"),
    import("./src/features/communications/socket-server"),
  ]);
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((request, response) => {
    void handle(request, response);
  });
  attachCommunicationSocketServer(httpServer);
  httpServer.listen(port, hostname, () => {
    console.info(`[server] Somsuuq listening on http://${hostname}:${port}`);
  });
}

void startServer().catch((error: unknown) => {
  console.error("[server] Could not start Somsuuq", {
    errorName: error instanceof Error ? error.name : "Unknown",
  });
  process.exitCode = 1;
});
