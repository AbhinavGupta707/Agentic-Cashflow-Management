import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";

for (const file of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), file);

  if (existsSync(path)) {
    config({ path, override: false, quiet: true });
  }
}
