import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

for (const file of [".env.test", ".env.local", ".env"]) {
  if (existsSync(file)) {
    loadEnvFile(file);
  }
}
