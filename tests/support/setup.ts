import { config } from "dotenv";

config({ quiet: true });
// Les tests ne touchent jamais la base de développement ni les services externes.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = ".storage-test";
delete process.env.RESEND_API_KEY;
delete process.env.SMTP_HOST;
