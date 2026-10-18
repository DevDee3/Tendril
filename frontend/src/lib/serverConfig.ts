import fs from "node:fs";
import path from "node:path";

// Docker receives the token through Compose. Local Next development runs from
// frontend/ while the shared .env lives at the repository root, so load it
// server-side as a development fallback only.
export function getTendrilApiToken() {
  if (process.env.TENDRIL_API_TOKEN) return process.env.TENDRIL_API_TOKEN;
  if (process.env.NODE_ENV === "production") return "";
  try {
    const envFile = fs.readFileSync(path.resolve(process.cwd(), "../.env"), "utf8");
    return envFile.match(/^TENDRIL_API_TOKEN=(.*)$/m)?.[1]?.trim() || "";
  } catch {
    return "";
  }
}
