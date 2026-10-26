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

/**
 * Administrateurs principaux (MASTER_ADMIN_EMAILS, configuration serveur — jamais dans le code
 * ni dans la base) : accès complet permanent ; leur rôle, leur statut et leur mot de passe ne
 * peuvent pas être modifiés par un autre administrateur.
 */
export function masterAdminEmails(env: Env = process.env): string[] {
  return (env.MASTER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}

export function isMasterAdmin(email: string | null | undefined, env: Env = process.env): boolean {
  return !!email && masterAdminEmails(env).includes(email.trim().toLowerCase());
}

/** Validité du code et du lien de connexion. */
export const LOGIN_CODE_TTL_SECONDS = 10 * 60;
