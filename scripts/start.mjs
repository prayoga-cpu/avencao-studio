/**
 * Démarrage du serveur de production hors Vercel (`pnpm start`) avec la sortie « standalone » :
 * copie les fichiers statiques à côté du serveur (étape requise par Next.js) puis le lance.
 */
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

const root = ".next/standalone";
if (!existsSync(`${root}/server.js`)) {
  console.error("Build absent : lancez d'abord `pnpm build`.");
  process.exit(1);
}
cpSync(".next/static", `${root}/.next/static`, { recursive: true });
if (existsSync("public")) cpSync("public", `${root}/public`, { recursive: true });
// HOSTNAME est souvent défini par le système (nom de machine) : on écoute explicitement sur toutes les interfaces.
const child = spawn(process.execPath, ["server.js"], { cwd: root, stdio: "inherit", env: { ...process.env, HOSTNAME: process.env.LISTEN_HOST || "0.0.0.0" } });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
