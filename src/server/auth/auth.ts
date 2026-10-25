import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "../db";
import { sendMail } from "../mail";
import { publicAppUrl, trustedOrigins } from "../app-url";

/**
 * Better Auth 1.7 (Auth.js v5 étant toujours en bêta et son fournisseur email/mot
 * de passe imposant des sessions JWT non révocables). Sessions stockées en base
 * (révocables), hachage scrypt par la bibliothèque, inscription publique désactivée.
 * Les comptes internes sont créés uniquement par invitation d'un administrateur.
 */
export const auth = betterAuth({
  appName: "Avencao",
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: publicAppUrl(),
  // Domaine public + URLs de déploiement Vercel (aperçus testables).
  trustedOrigins: trustedOrigins(),
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Avencao — réinitialisation de votre mot de passe",
        text: `Bonjour,\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n${url}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
      });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 120,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // Un compte désactivé, en revue ou sans rôle interne ne peut pas ouvrir de session.
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { status: true, role: true },
          });
          if (!user || user.status !== "ACTIVE" || user.role === "VISITOR" || user.role === "CLIENT") {
            return false;
          }
          await prisma.user.update({ where: { id: session.userId }, data: { lastLoginAt: new Date() } });
          return { data: session };
        },
      },
    },
  },
  plugins: [nextCookies()],
});
