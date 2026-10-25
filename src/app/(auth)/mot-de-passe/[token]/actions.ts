"use server";

import { z } from "zod";
import { safeAction } from "@/server/actions";
import { consumeToken } from "@/server/users";

const schema = z
  .object({
    token: z.string().min(20),
    password: z.string().min(10, "10 caractères minimum").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Les mots de passe ne correspondent pas", path: ["confirm"] });

export async function setPasswordAction(input: z.input<typeof schema>) {
  return safeAction(async () => {
    const data = schema.parse(input);
    return consumeToken(data.token, data.password);
  }, "Mot de passe enregistré. Vous pouvez vous connecter.");
}
