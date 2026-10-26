"use client";

import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

/** Client d'authentification (connexion, déconnexion, mot de passe oublié). */
export const authClient = createAuthClient({ plugins: [emailOTPClient()] });
