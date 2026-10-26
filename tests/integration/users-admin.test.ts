import { verifyPassword } from "better-auth/crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError } from "@/server/errors";
import { createUserWithPassword, setUserPassword } from "@/server/users";
import { makeActor, prisma, resetDb } from "../support/db";

async function storedHash(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { accounts: true } });
  return { user, hash: user.accounts.find((a) => a.providerId === "credential")?.password ?? "" };
}

describe("comptes créés par un administrateur", () => {
  beforeEach(resetDb);

  it("crée un compte actif avec le mot de passe choisi par l'admin", async () => {
    const admin = await makeActor("ADMIN");
    await createUserWithPassword(admin, { email: "Monteur@Exemple.fr", name: "Kai", role: "EDITOR", financeAccess: false, password: "Mot-de-passe-123" });
    const { user, hash } = await storedHash("monteur@exemple.fr");
    expect(user).toMatchObject({ role: "EDITOR", status: "ACTIVE", emailVerified: true });
    expect(await verifyPassword({ hash, password: "Mot-de-passe-123" })).toBe(true);
    await expect(
      createUserWithPassword(admin, { email: "monteur@exemple.fr", name: "Kai", role: "EDITOR", financeAccess: false, password: "Autre-mot-de-passe" }),
    ).rejects.toThrow(/existe déjà/);
  });

  it("refuse un mot de passe trop court et un non-administrateur", async () => {
    const admin = await makeActor("ADMIN");
    const manager = await makeActor("PRODUCTION_MANAGER");
    await expect(createUserWithPassword(admin, { email: "a@b.fr", name: "A", role: "EDITOR", financeAccess: false, password: "court" })).rejects.toThrow(/10 et 128/);
    await expect(createUserWithPassword(manager, { email: "a@b.fr", name: "A", role: "EDITOR", financeAccess: false, password: "Mot-de-passe-123" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("change le mot de passe et ferme toutes les sessions de l'utilisateur", async () => {
    const admin = await makeActor("ADMIN");
    const { id } = await createUserWithPassword(admin, { email: "pm@exemple.fr", name: "PM", role: "PRODUCTION_MANAGER", financeAccess: true, password: "Ancien-mot-de-passe" });
    await prisma.session.create({ data: { userId: id, token: "t-1", expiresAt: new Date(Date.now() + 3600_000) } });
    await setUserPassword(admin, id, "Nouveau-mot-de-passe");
    const { hash } = await storedHash("pm@exemple.fr");
    expect(await verifyPassword({ hash, password: "Nouveau-mot-de-passe" })).toBe(true);
    expect(await verifyPassword({ hash, password: "Ancien-mot-de-passe" })).toBe(false);
    expect(await prisma.session.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: "user.password_set_by_admin", entityId: id } })).toBe(1);
  });
});
