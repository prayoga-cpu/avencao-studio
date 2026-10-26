"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, Mail } from "lucide-react";
import { useT } from "#i18n";
import { Field, NativeSelect } from "@/components/app/field";
import { Notice } from "@/components/app/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

const RESEND_DELAY_S = 30;

/**
 * Connexion par code à usage unique : choix de l'adresse (liste déroulante si la liste des
 * accès est configurée), envoi d'un email avec un code et un lien, puis saisie du code.
 */
export function OtpLoginForm({ emails }: { emails: string[] | null }) {
  const tr = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(emails?.[0] ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  function requestCode() {
    setError(null);
    start(async () => {
      const res = await authClient.emailOtp.sendVerificationOtp({ email: email.trim().toLowerCase(), type: "sign-in" });
      if (res.error) {
        setError(res.error.status === 429 ? tr("Trop de demandes. Patientez une minute avant de réessayer.") : tr("Envoi du code impossible pour le moment."));
        return;
      }
      setStep("code");
      setCode("");
      setCooldown(RESEND_DELAY_S);
    });
  }

  function verify() {
    setError(null);
    start(async () => {
      const res = await authClient.signIn.emailOtp({ email: email.trim().toLowerCase(), otp: code.trim() });
      if (res.error) {
        setError(res.error.status === 429 ? tr("Trop de tentatives. Patientez une minute avant de réessayer.") : tr("Code incorrect ou expiré."));
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    });
  }

  if (step === "code") {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          verify();
        }}
      >
        <Notice tone="info" title={tr("Code envoyé")}>
          {tr("Un code à 6 chiffres et un lien de connexion ont été envoyés à {0}. Valables 10 minutes.", [email])}
        </Notice>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label={tr("Code de connexion")} htmlFor="login-code" required>
          <Input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="text-center text-lg tracking-[0.5em]"
          />
        </Field>
        <Button type="submit" size="lg" disabled={pending || code.length !== 6} className="mt-1">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {tr("Se connecter")}
        </Button>
        <div className="flex items-center justify-between gap-3 text-sm">
          <button type="button" className="text-subtle hover:text-foreground" onClick={() => { setStep("email"); setError(null); }}>
            {tr("Changer d'adresse")}
          </button>
          <button type="button" className="text-brand hover:underline disabled:text-faint disabled:no-underline" disabled={pending || cooldown > 0} onClick={requestCode}>
            {cooldown > 0 ? tr("Renvoyer le code ({0} s)", [cooldown]) : tr("Renvoyer le code")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        requestCode();
      }}
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field label={tr("Adresse email")} htmlFor="login-email" required>
        {emails ? (
          <NativeSelect name="email" value={email} onChange={(e) => setEmail(e.target.value)} required>
            {emails.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <Input name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        )}
      </Field>
      <Button type="submit" size="lg" disabled={pending || !email} className="mt-1">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />}
        {tr("Recevoir un code de connexion")}
      </Button>
      <p className="text-center text-xs text-faint">{tr("Vous recevrez un code à 6 chiffres et un lien de connexion par email.")}</p>
    </form>
  );
}
