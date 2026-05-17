import { Pool } from "pg";
import { poolSsl } from "./lib/db-ssl.ts";

const databaseUrl = Deno.env.get("DATABASE_URL");
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const pool = new Pool({
  connectionString: databaseUrl,
  options: "-c search_path=trexdb,public",
  ...poolSsl(databaseUrl),
});
