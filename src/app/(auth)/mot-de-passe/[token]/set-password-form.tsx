"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setPasswordAction } from "./actions";

export function SetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await setPasswordAction({
            token,
            password: String(fd.get("password") ?? ""),
            confirm: String(fd.get("confirm") ?? ""),
          });
          if (!res.ok) {
            setErrors(res.fieldErrors ?? {});
            toast.error(res.error);
            return;
          }
          toast.success(res.message ?? "Mot de passe enregistré.");
          router.replace("/connexion");
        });
      }}
    >
      <Field label="Mot de passe" htmlFor="password" required hint="10 caractères minimum." error={errors.password?.[0]}>
        <Input name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Confirmation" htmlFor="confirm" required error={errors.confirm?.[0]}>
        <Input name="confirm" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Enregistrer mon mot de passe
      </Button>
    </form>
  );
}
