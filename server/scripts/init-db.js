require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. See server/.env.example.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8");
  const seed = fs.readFileSync(path.join(__dirname, "..", "seed.sql"), "utf8");

  await pool.query(schema);
  await pool.query(seed);
  await pool.end();

  console.log("PostgreSQL schema and seed data applied.");
  console.log("Embed knowledge-base documents with: npm run ingest-knowledge");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
