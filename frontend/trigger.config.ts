import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID ?? "proj_placeholder",
  dirs: ["./trigger"],
  maxDuration: 3600,
});
