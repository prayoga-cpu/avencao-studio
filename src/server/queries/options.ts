import "server-only";
import { prisma } from "../db";

/** Listes de choix pour les formulaires (aucun champ financier). */
export async function staffOptions() {
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", role: { in: ["ADMIN", "PRODUCTION_MANAGER"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({ value: u.id, label: u.name }));
}

export async function clientOptions() {
  const clients = await prisma.client.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });
  return clients.map((c) => ({ value: c.id, label: c.displayName }));
}

export async function editorOptions() {
  const editors = await prisma.editorProfile.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });
  return editors.map((e) => ({ value: e.id, label: e.displayName }));
}

export async function projectOptions(clientId?: string) {
  const projects = await prisma.project.findMany({
    where: { status: { notIn: ["ARCHIVED", "CANCELLED"] }, ...(clientId ? { clientId } : {}) },
    select: { id: true, reference: true, title: true, clientId: true, client: { select: { displayName: true } } },
    orderBy: { createdAt: "desc" },
  });
  return projects.map((p) => ({ value: p.id, label: `${p.reference} — ${p.title}`, clientId: p.clientId, clientName: p.client.displayName }));
}

export async function tagOptions() {
  const tags = await prisma.tag.findMany({ orderBy: { name: "asc" }, select: { name: true } });
  return tags.map((t) => ({ value: t.name, label: t.name }));
}
