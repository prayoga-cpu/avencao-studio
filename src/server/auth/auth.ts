import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { prisma } from "../db";
import { sendMail } from "../mail";
import { publicAppUrl, trustedOrigins } from "../app-url";
import { sendLoginCodeEmail } from "./login-email";
import { isLoginEmailAllowed, LOGIN_CODE_TTL_SECONDS, loginAllowlist, passwordLoginEnabled } from "./login-policy";

/**
 * Better Auth 1.7 (Auth.js v5 étant toujours en bêta et son fournisseur email/mot
 * de passe imposant des sessions JWT non révocables). Sessions stockées en base
 * (révocables), hachage scrypt par la bibliothèque, inscription publique désactivée.
 * Connexion par code à usage unique (code + lien par email) pour les adresses de LOGIN_EMAILS,
 * et par mot de passe pour les comptes créés par un administrateur (voir login-policy.ts).
 */
export const auth = betterAuth({
  appName: "Avencao",
  // Pendant `next build` uniquement, une valeur fictive évite des erreurs de chargement : aucune
  // session n'est signée au build. À l'exécution, l'absence du vrai secret reste bloquante.
  secret: process.env.BETTER_AUTH_SECRET || (process.env.NEXT_PHASE === "phase-production-build" ? "build-phase-placeholder-secret-never-used-at-runtime" : undefined),
  baseURL: publicAppUrl(),
  // Domaine public + URLs de déploiement Vercel (aperçus testables).
  trustedOrigins: trustedOrigins(),
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: passwordLoginEnabled(),
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
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/sign-in/email-otp": { window: 60, max: 5 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Hors liste autorisée : aucun compte n'est créé (connexion par code refusée).
        before: async (user) => (isLoginEmailAllowed(user.email) ? { data: user } : false),
        // Adresses de LOGIN_EMAILS : équipe interne, administrateurs dès le premier accès.
        after: async (user) => {
          if (!loginAllowlist()?.includes(user.email.toLowerCase())) return;
          await prisma.user.update({
            where: { id: user.id },
            data: { role: "ADMIN", status: "ACTIVE", financeAccess: true, emailVerified: true, name: user.name || user.email.split("@")[0] },
          });
        },
      },
    },
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
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: LOGIN_CODE_TTL_SECONDS,
      allowedAttempts: 5,
      storeOTP: "hashed",
      disableSignUp: false,
      sendVerificationOTP: async ({ email, otp, type }) => {
        // Seule la connexion utilise ce canal ; hors liste, rien n'est envoyé (réponse identique).
        if (type !== "sign-in" || !isLoginEmailAllowed(email)) return;
        await sendLoginCodeEmail(email, otp);
      },
    }),
    nextCookies(),
  ],
});
