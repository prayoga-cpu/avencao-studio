"use client";

import { useState } from "react";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Field, FormGrid } from "@/components/app/field";
import { FormActions, useServerForm } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteContactAction, saveContactAction } from "@/features/clients/actions";
import { contactSchema, type ContactInput } from "@/features/clients/schemas";
import { useT } from "#i18n";

export interface ContactRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  isPrimary: boolean;
}

function ContactDialog({ clientId, contact, open, onOpenChange }: { clientId: string; contact?: ContactRow; open: boolean; onOpenChange: (v: boolean) => void }) {
  const tr = useT();
  const { form, onSubmit, pending, err } = useServerForm({
    schema: contactSchema,
    defaultValues: {
      clientId,
      id: contact?.id ?? "",
      firstName: contact?.firstName ?? "",
      lastName: contact?.lastName ?? "",
      jobTitle: contact?.jobTitle ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      whatsapp: contact?.whatsapp ?? "",
      isPrimary: contact?.isPrimary ?? false,
    } satisfies ContactInput,
    action: saveContactAction,
    onSuccess: () => onOpenChange(false),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{contact ? tr("Modifier le contact") : tr("Nouveau contact")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <FormGrid>
            <Field label={tr("Prénom")} htmlFor="c-firstName"><Input {...form.register("firstName")} /></Field>
            <Field label={tr("Nom")} htmlFor="c-lastName"><Input {...form.register("lastName")} /></Field>
            <Field label={tr("Fonction")} htmlFor="c-jobTitle"><Input {...form.register("jobTitle")} /></Field>
            <Field label={tr("Email")} htmlFor="c-email" error={err("email")}><Input type="email" {...form.register("email")} /></Field>
            <Field label={tr("Téléphone")} htmlFor="c-phone"><Input type="tel" {...form.register("phone")} /></Field>
            <Field label={tr("WhatsApp")} htmlFor="c-whatsapp"><Input type="tel" {...form.register("whatsapp")} /></Field>
          </FormGrid>
          <div className="flex items-center gap-2">
            <Checkbox id="c-primary" checked={form.watch("isPrimary")} onCheckedChange={(v) => form.setValue("isPrimary", v === true)} />
            <Label htmlFor="c-primary">{tr("Contact principal")}</Label>
          </div>
          <FormActions pending={pending} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ContactsPanel({ clientId, contacts, canEdit }: { clientId: string; contacts: ContactRow[]; canEdit: boolean }) {
  const tr = useT();
  const [editing, setEditing] = useState<ContactRow | undefined>();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      {contacts.length === 0 ? <p className="text-sm text-subtle">{tr("Aucun contact enregistré.")}</p> : null}
      <ul className="flex flex-col gap-2">
        {contacts.map((c) => (
          <li key={c.id} className="flex items-start justify-between gap-2 rounded-lg border border-border p-2.5 text-sm">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-semibold">
                {[c.firstName, c.lastName].filter(Boolean).join(" ") || tr("Sans nom")}
                {c.isPrimary ? <Star className="size-3.5 fill-warning text-warning" aria-label={tr("Contact principal")} /> : null}
              </p>
              {c.jobTitle ? <p className="text-xs text-subtle">{c.jobTitle}</p> : null}
              {c.email ? <a href={`mailto:${c.email}`} className="block truncate text-xs text-brand hover:underline">{c.email}</a> : null}
              {c.phone || c.whatsapp ? <p className="text-xs text-subtle">{[c.phone, c.whatsapp ? `WhatsApp ${c.whatsapp}` : null].filter(Boolean).join(" · ")}</p> : null}
            </div>
            {canEdit ? (
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon-sm" aria-label={tr("Modifier le contact")} onClick={() => { setEditing(c); setOpen(true); }}>
                  <Pencil aria-hidden />
                </Button>
                <ConfirmAction
                  trigger={<Button variant="ghost" size="icon-sm" aria-label={tr("Supprimer le contact")}><Trash2 aria-hidden /></Button>}
                  title={tr("Supprimer ce contact ?")}
                  destructive
                  confirmLabel={tr("Supprimer")}
                  action={() => deleteContactAction(c.id)}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <Button variant="outline" size="sm" className="self-start" onClick={() => { setEditing(undefined); setOpen(true); }}>
          <Plus aria-hidden /> {" "}{tr("Ajouter un contact")}</Button>
      ) : null}
      {open ? <ContactDialog key={editing?.id ?? "new"} clientId={clientId} contact={editing} open={open} onOpenChange={setOpen} /> : null}
    </div>
  );
}
