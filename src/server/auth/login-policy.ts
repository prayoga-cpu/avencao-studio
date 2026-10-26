/**
 * Politique de connexion (configuration serveur, jamais modifiable depuis l'interface).
 *
 * - LOGIN_EMAILS (liste séparée par des virgules) : adresses de l'équipe interne, proposées dans
 *   une liste déroulante, connexion par code à usage unique envoyé par email (code + lien). Ces
 *   comptes sont créés au premier accès comme administrateurs. Aucune autre adresse ne reçoit de code.
 * - Comptes créés par un administrateur (Réglages › Utilisateurs) : connexion par email + mot de
 *   passe défini par l'administrateur (modifiable par lui).
 * - Sans LOGIN_EMAILS (développement, tests) : code possible pour tout compte existant.
 * - PASSWORD_LOGIN=false désactive totalement la connexion par mot de passe.
 */
type Env = Record<string, string | undefined>;

export function loginAllowlist(env: Env = process.env): string[] | null {
  const list = (env.LOGIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  return list.length ? [...new Set(list)] : null;
}

export function isLoginEmailAllowed(email: string, env: Env = process.env): boolean {
  const list = loginAllowlist(env);
  return !list || list.includes(email.trim().toLowerCase());
}

export function passwordLoginEnabled(env: Env = process.env): boolean {
  return env.PASSWORD_LOGIN !== "false";
}

/** Validité du code et du lien de connexion. */
export const LOGIN_CODE_TTL_SECONDS = 10 * 60;
