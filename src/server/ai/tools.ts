import "server-only";
/**
 * Outils CRM en lecture seule exposés par le serveur MCP (claude.ai, Claude Desktop,
 * Claude Code), utilisés avec le compte Claude de chaque utilisateur.
 *
 * Règles :
 * - chaque outil déclare la permission requise : la liste proposée à Claude est filtrée
 *   selon le rôle de l'utilisateur, et la permission est revérifiée à l'exécution ;
 * - les lectures réutilisent les requêtes des écrans (mêmes filtres financiers) et ne
 *   renvoient que des champs explicitement choisis ;
 * - aucun outil ne modifie de donnée.
 */
import { z } from "zod";
import { diffInDays, isIsoDate, previousPeriod, resolvePeriod, toDateOnlyString, type PeriodPreset } from "@/lib/dates";
import { publicAppUrl } from "../app-url";
import { prisma } from "../db";
import { DomainError, ForbiddenError, NotFoundError } from "../errors";
import { can, type Actor, type Permission } from "../policies";
import { getClient, getClientFinance, getClientOverview, getNotes, listClients } from "../queries/clients";
import { getEditorCapacity, getOperationalSnapshot } from "../queries/dashboard";
import { listEditors } from "../queries/editors";
import { listInvoices } from "../queries/finance";
import { getPlanning } from "../queries/planning";
import { getProjectDetail, getVideoDetail, listProjects, listVideos, type VideoView } from "../queries/production";
import { toJsonSafe } from "../serialize";
import { getSettings } from "../settings";
import { agencyToday } from "../services/common";
import { getPeriodMetrics, getReceivables, getSupplierDebt } from "../services/metrics";
import { REPORTS, buildReport } from "../services/reports";

export interface CrmTool {
  name: string;
  /** Libellé affiché dans l'interface pendant l'exécution (texte français, traduit à l'affichage). */
  label: string;
  /** Description destinée au modèle (anglais, non traduite). */
  about: string;
  /** L'outil est proposé si l'utilisateur a au moins une de ces permissions. */
  anyOf: Permission[];
  input: z.ZodObject;
  run: (actor: Actor, input: never) => Promise<unknown>;
}

/** Résultat d'outil sérialisé au-delà duquel on tronque (protège le contexte du modèle). */
export const MAX_TOOL_RESULT_CHARS = 40_000;

const id = (what: string) => z.string().min(1).max(64).describe(`${what} id (from a search result)`);
const optionalText = (description: string) => z.string().trim().max(200).optional().describe(description);
const isoDate = (description: string) =>
  z.string().refine(isIsoDate, DATE_HINT).optional().describe(description);
const DATE_HINT = ["Expected", "YYYY-MM-DD"].join(" ");
const RANGE_HINT = ["Range too long:", "62 days maximum."].join(" ");
const PERIODS = ["month", "last-month", "quarter", "year", "last-year", "custom"] as const;
const periodInput = {
  period: z.enum(PERIODS).optional().describe("Reporting period. Defaults to the current month. Use 'custom' with from/to."),
  from: isoDate("Start date (YYYY-MM-DD) when period is 'custom'"),
  to: isoDate("End date (YYYY-MM-DD) when period is 'custom'"),
};

function omit<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

const link = (path: string) => `${publicAppUrl()}${path}`;
const d = (value: Date | null | undefined) => (value ? toDateOnlyString(value) : null);
const clip = (value: string | null | undefined, max = 600) =>
  value ? (value.length > max ? `${value.slice(0, max)}…` : value) : null;

async function periodFrom(input: { period?: PeriodPreset; from?: string; to?: string }) {
  const today = await agencyToday();
  const period = resolvePeriod(input.period ?? "month", today, { from: input.from, to: input.to });
  return { today, period };
}

function tool<S extends z.ZodObject>(def: {
  name: string;
  label: string;
  about: string;
  anyOf: Permission[];
  input: S;
  run: (actor: Actor, input: z.infer<S>) => Promise<unknown>;
}): CrmTool {
  return def as unknown as CrmTool;
}

const TOOLS: CrmTool[] = [
  tool({
    name: "get_context",
    label: "Contexte",
    about:
      "Who the current user is (name, role, finance access), today's date in the agency timezone, the agency name and the CRM base URL. Call it first when dates or permissions matter.",
    anyOf: ["assistant.use"],
    input: z.object({}),
    run: async (actor) => {
      const settings = await getSettings();
      return {
        user: { name: actor.name, email: actor.email, role: actor.role, financeAccess: actor.financeAccess },
        today: await agencyToday(),
        timezone: settings.timezone,
        agency: settings.name,
        reportingCurrency: settings.reportingCurrency,
        appUrl: publicAppUrl(),
        canSee: {
          finance: can(actor, "invoices.read"),
          globalFinanceKpis: can(actor, "finance.kpis"),
          projectMargins: can(actor, "margins.project"),
          editorCosts: can(actor, "costs.read"),
        },
      };
    },
  }),

  tool({
    name: "get_dashboard_overview",
    label: "Tableau de bord",
    about:
      "Agency overview: production counters (active, to assign, overdue, to validate, due within 7 days, blocked), the most urgent videos, editor workload for the next 7 days and, for users with finance access, the period's financial KPIs (invoiced revenue, collections, delivered revenue and costs, production margin, management result, receivables, amount owed to editors) compared with the previous period.",
    anyOf: ["dashboard.view"],
    input: z.object(periodInput),
    run: async (actor, input) => {
      const { today, period } = await periodFrom(input);
      const [ops, capacity] = await Promise.all([getOperationalSnapshot(actor, today), getEditorCapacity(today)]);
      const out: Record<string, unknown> = {
        today,
        production: {
          activeVideos: ops.active,
          toAssign: ops.toAssign,
          overdue: ops.overdue,
          toValidate: ops.toValidate,
          dueWithin7Days: ops.dueSoon,
          blocked: ops.blocked,
          commercialFollowUpsDue: ops.followUps,
          ...(ops.showCosts ? { assignmentsWithoutCost: ops.missingCosts } : {}),
          overdueVideos: ops.overdueList.map((v) => ({ id: v.id, reference: v.reference, title: v.title, client: v.project.client.displayName, clientDeadline: v.clientDeadline, internalDeadline: d(v.internalDeadline), url: link(`/videos/${v.id}`) })),
          videosToValidate: ops.validateList.map((v) => ({ id: v.id, reference: v.reference, title: v.title, status: v.status, url: link(`/videos/${v.id}`) })),
          videosToAssign: ops.assignList.map((v) => ({ id: v.id, reference: v.reference, title: v.title, clientDeadline: v.clientDeadline, url: link(`/videos/${v.id}`) })),
        },
        editorWorkload7Days: capacity.map((e) => ({ editor: e.name, missions: e.missions, plannedHours: e.planned, weeklyCapacityHours: e.capacity, loadPct: e.loadPct, overloaded: e.overloaded, missionsWithoutEstimate: e.missingEstimates })),
      };
      if (can(actor, "finance.kpis")) {
        const previous = previousPeriod(period);
        const [m, p, receivables, debt] = await Promise.all([getPeriodMetrics(period), getPeriodMetrics(previous), getReceivables(today), getSupplierDebt()]);
        const kpis = (x: typeof m) => ({
          salesSignedEur: x.salesSignedEur,
          invoicedNetEur: x.invoicedNetEur,
          creditNotesNetEur: x.creditNotesNetEur,
          collectionsEur: x.collectionsEur,
          deliveredRevenueEur: x.deliveredRevenueEur,
          deliveredVideos: x.deliveredCount,
          deliveredCostsEur: x.deliveredCostsEur,
          deliveredMissingCosts: x.deliveredMissingCosts,
          productionMarginEur: x.productionMarginEur,
          productionMarginPct: x.productionMarginPct,
          marginIsProvisional: x.marginIsProvisional,
          overheadEur: x.overheadEur,
          managementResultEur: x.managementResultEur,
          netCashFlowEur: x.netCashFlowEur,
        });
        out.finance = {
          period: period,
          kpis: kpis(m),
          previousPeriod: previous,
          previousKpis: kpis(p),
          receivables: { openEur: receivables.totalEur, overdueEur: receivables.overdueEur, overdueInvoices: receivables.overdueCount },
          owedToEditorsEur: debt.dueEur,
          definitions: "Invoiced = issued invoices minus credit notes (excl. VAT, by issue date). Collections = payments received (incl. VAT). Production margin = delivered revenue minus direct costs of delivered videos. See /rapports for details.",
        };
      }
      return out;
    },
  }),

  tool({
    name: "search_clients",
    label: "Clients",
    about: "Search clients by name, legal name, email or contact name. Archived clients are excluded unless status=ARCHIVED. Returns 25 per page.",
    anyOf: ["clients.read"],
    input: z.object({
      query: optionalText("Text to search"),
      status: z.enum(["PROSPECT", "ACTIVE", "INACTIVE", "LOST", "ARCHIVED"]).optional(),
      page: z.number().int().min(1).max(100).optional(),
    }),
    run: async (actor, input) => {
      const page = input.page ?? 1;
      const res = await listClients(actor, { q: input.query, status: input.status, page, pageSize: 25 });
      return { total: res.total, page, rows: res.rows.map((c) => ({ ...c, url: link(`/clients/${c.id}`) })) };
    },
  }),

  tool({
    name: "get_client",
    label: "Fiche client",
    about:
      "Full client record: details, contacts, projects, upcoming deadlines, recent deliveries, open opportunities, recent activities, internal notes and (only with finance access) signed/invoiced/collected/open amounts and invoices.",
    anyOf: ["clients.read"],
    input: z.object({ client_id: id("Client") }),
    run: async (actor, input) => {
      const c = await getClient(actor, input.client_id);
      const [overview, finance, notes] = await Promise.all([
        getClientOverview(actor, c.id),
        getClientFinance(actor, c.id),
        getNotes(actor, { clientId: c.id }),
      ]);
      return {
        id: c.id,
        url: link(`/clients/${c.id}`),
        displayName: c.displayName,
        legalName: c.legalName,
        kind: c.kind,
        status: c.status,
        email: c.email,
        phone: c.phone,
        whatsapp: c.whatsapp,
        country: c.country,
        website: c.website,
        social: { instagram: c.instagram, tiktok: c.tiktok, youtube: c.youtube, linkedin: c.linkedin },
        acquisitionSource: c.acquisitionSource,
        owner: c.owner?.name ?? null,
        currency: c.currency,
        paymentTermsDays: c.paymentTermsDays,
        nextFollowUpOn: d(c.nextFollowUpOn),
        creativePreferences: clip(c.creativePreferences),
        tags: c.tags.map((t) => t.tag.name),
        contacts: c.contacts.map((x) => ({ name: [x.firstName, x.lastName].filter(Boolean).join(" "), jobTitle: x.jobTitle, email: x.email, phone: x.phone, isPrimary: x.isPrimary })),
        projects: overview.projects.map((p) => ({ ...p, url: link(`/projets/${p.id}`) })),
        nextDeadlines: overview.nextDeadlines.map((v) => ({ id: v.id, reference: v.reference, title: v.title, status: v.status, clientDeadline: d(v.clientDeadline) })),
        lastDeliveries: overview.lastDeliveries.map((v) => ({ id: v.id, reference: v.reference, title: v.title, type: v.type, deliveredAt: d(v.deliveredAt) })),
        openOpportunities: overview.opportunities.map((o) => ({ id: o.id, title: o.title, stage: o.stage, estimatedAmount: o.estimatedAmount, currency: o.currency, followUpOn: d(o.followUpOn), nextAction: o.nextAction })),
        recentActivities: overview.activities.map((a) => ({ type: a.type, subject: a.subject, body: clip(a.body, 300), occurredAt: d(a.occurredAt), author: a.author?.name ?? null })),
        internalNotes: notes.slice(0, 10).map((n) => ({ body: clip(n.body, 500), author: n.author?.name ?? null, createdAt: d(n.createdAt), visibility: n.visibility })),
        finance: finance ? { ...finance, invoices: finance.invoices.slice(0, 20), payments: finance.payments.slice(0, 20) } : "not available for your role",
      };
    },
  }),

  tool({
    name: "search_projects",
    label: "Projets",
    about: "Search projects by title, reference or client name. Archived and cancelled projects are excluded unless a status is given. Includes project margin only for users allowed to see it. 25 per page.",
    anyOf: ["projects.read"],
    input: z.object({
      query: optionalText("Text to search"),
      status: z.enum(["DRAFT", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED", "ARCHIVED"]).optional(),
      client_id: z.string().max(64).optional().describe("Restrict to one client"),
      page: z.number().int().min(1).max(100).optional(),
    }),
    run: async (actor, input) => {
      const page = input.page ?? 1;
      const res = await listProjects(actor, { q: input.query, status: input.status, client: input.client_id, page, pageSize: 25 });
      return { total: res.total, page, rows: res.rows.map((p) => ({ ...p, url: link(`/projets/${p.id}`) })) };
    },
  }),

  tool({
    name: "get_project",
    label: "Fiche projet",
    about: "Project details with its videos (status, deadlines, assigned editors), recent deadline changes and, when allowed, sales orders and margins.",
    anyOf: ["projects.read"],
    input: z.object({ project_id: id("Project") }),
    run: async (actor, input) => {
      const res = await getProjectDetail(actor, input.project_id);
      const p = res.project;
      return {
        id: p.id,
        url: link(`/projets/${p.id}`),
        reference: p.reference,
        title: p.title,
        status: p.status,
        priority: p.priority,
        client: p.client.displayName,
        clientId: p.client.id,
        owner: p.owner?.name ?? null,
        description: clip(p.description, 1500),
        startOn: d(p.startOn),
        clientDeadline: d(p.clientDeadline),
        includedRevisionRounds: p.includedRevisionRounds,
        videos: p.videos.map((v) => ({
          id: v.id,
          reference: v.reference,
          title: v.title,
          type: v.type,
          status: v.status,
          priority: v.priority,
          isBlocked: v.isBlocked,
          internalDeadline: d(v.internalDeadline),
          clientDeadline: d(v.clientDeadline),
          editors: v.assignments.map((a) => `${a.editor.displayName} (${a.role})`),
          finance: res.videoFinance?.[v.id] ?? undefined,
          url: link(`/videos/${v.id}`),
        })),
        finance: res.finance ?? "not available for your role",
        salesOrders: res.orders ?? undefined,
        recentDeadlineChanges: res.deadlineChanges.slice(0, 10).map((c) => ({ field: c.field, from: d(c.oldDate), to: d(c.newDate), reason: c.reason, at: d(c.createdAt) })),
      };
    },
  }),

  tool({
    name: "search_videos",
    label: "Vidéos",
    about:
      "List videos with filters. view: 'all' (not archived/cancelled), 'to_assign', 'to_validate' (internal or client review), 'overdue' (client or internal deadline passed), 'blocked', 'mine' (projects I own). Optional status, client, project, editor and client-deadline range filters. Results are sorted by client deadline.",
    anyOf: ["videos.readAll"],
    input: z.object({
      view: z.enum(["all", "to_assign", "to_validate", "overdue", "blocked", "mine"]).optional(),
      query: optionalText("Text in title or reference"),
      status: z.enum(["TO_PREPARE", "WAITING_RUSHES", "TO_ASSIGN", "ASSIGNED", "EDITING", "INTERNAL_REVIEW", "INTERNAL_CHANGES", "CLIENT_REVIEW", "CLIENT_CHANGES", "APPROVED", "DELIVERED", "ARCHIVED", "CANCELLED"]).optional(),
      client_id: z.string().max(64).optional(),
      project_id: z.string().max(64).optional(),
      editor_id: z.string().max(64).optional(),
      deadline_from: isoDate("Client deadline on or after (YYYY-MM-DD)"),
      deadline_to: isoDate("Client deadline on or before (YYYY-MM-DD)"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum rows (default 50)"),
    }),
    run: async (actor, input) => {
      const views: Record<string, VideoView> = { all: "tableau", to_assign: "a-attribuer", to_validate: "a-valider", overdue: "en-retard", blocked: "bloquees", mine: "mes-videos" };
      const res = await listVideos(actor, {
        view: views[input.view ?? "all"],
        q: input.query,
        status: input.status,
        client: input.client_id,
        project: input.project_id,
        editor: input.editor_id,
        from: input.deadline_from,
        to: input.deadline_to,
      });
      const limit = input.limit ?? 50;
      return {
        today: res.today,
        total: res.rows.length,
        shown: Math.min(limit, res.rows.length),
        rows: res.rows.slice(0, limit).map((v) => ({ ...omit(v, "allowed"), client: v.client.displayName, project: `${v.project.reference} ${v.project.title}`, url: link(`/videos/${v.id}`) })),
      };
    },
  }),

  tool({
    name: "get_video",
    label: "Fiche vidéo",
    about:
      "Video details: brief, deadlines, status history, assignments, versions, client/internal feedback, checklist, links and change requests. Editor rates and costs appear only for users allowed to see costs.",
    anyOf: ["videos.readAll"],
    input: z.object({ video_id: id("Video") }),
    run: async (actor, input) => {
      const { video: v, names, rounds, finance } = await getVideoDetail(actor, input.video_id);
      const showCosts = can(actor, "costs.read");
      return {
        id: v.id,
        url: link(`/videos/${v.id}`),
        reference: v.reference,
        title: v.title,
        project: { id: v.project.id, reference: v.project.reference, title: v.project.title },
        client: v.project.client.displayName,
        type: v.type,
        format: v.format,
        ratio: v.ratio,
        language: v.language,
        status: v.status,
        priority: v.priority,
        isBlocked: v.isBlocked,
        blockedReason: v.blockedReason,
        internalDeadline: d(v.internalDeadline),
        clientDeadline: d(v.clientDeadline),
        deliveredAt: d(v.deliveredAt),
        estimatedHours: v.estimatedHours,
        revisionRounds: { used: rounds, included: v.includedRevisionRounds ?? v.project.includedRevisionRounds },
        brief: clip(v.brief, 2000),
        objectives: clip(v.objectives),
        audience: clip(v.audience),
        links: v.links.map((l) => ({ kind: l.kind, label: l.label, url: l.url })),
        assignments: v.assignments.map((a) => ({
          editor: a.editor.displayName,
          role: a.role,
          status: a.status,
          isPrimary: a.isPrimary,
          dueOn: d(a.dueOn),
          estimatedHours: a.estimatedHours,
          ...(showCosts ? { rateMode: a.rateMode, unitPrice: a.unitPrice, currency: a.currency, quantity: a.quantity } : {}),
        })),
        versions: v.versions.slice(0, 10).map((x) => ({ number: x.number, status: x.status, url: x.url, description: clip(x.description, 300), author: x.authorId ? names[x.authorId] ?? null : null, createdAt: d(x.createdAt) })),
        feedback: v.feedback.slice(0, 20).map((f) => ({ body: clip(f.body, 500), timecode: f.timecode, status: f.status, source: f.source, author: f.authorId ? names[f.authorId] ?? null : null, createdAt: d(f.createdAt) })),
        checklist: v.checklist.map((c) => ({ label: c.label, checked: c.checked })),
        statusHistory: v.statusEvents.slice(0, 10).map((e) => ({ from: e.fromStatus, to: e.toStatus, by: e.actorId ? names[e.actorId] ?? null : null, at: e.createdAt })),
        changeRequests: v.changeRequests.map((c) => ({ title: c.title, status: c.status, description: clip(c.description, 300), editor: c.editor?.displayName ?? null, ...(showCosts ? { clientPrice: c.clientPrice, editorCost: c.editorCost } : {}) })),
        finance: finance ?? "not available for your role",
      };
    },
  }),

  tool({
    name: "list_editors",
    label: "Monteurs",
    about: "List freelance editors with skills, formats, level, active missions, planned hours over the next 7 days vs weekly capacity, and (only with supplier-payment access) the amount owed to each.",
    anyOf: ["editors.read"],
    input: z.object({
      query: optionalText("Name or email"),
      status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
      skill: z.enum(["PREMIERE_PRO", "AFTER_EFFECTS", "DAVINCI_RESOLVE", "CAPCUT", "RUSH_PREP", "SUBTITLING", "MOTION_DESIGN", "COLOR_GRADING", "SOUND_DESIGN", "THUMBNAIL"]).optional(),
      format: z.enum(["REEL", "SHORT", "YOUTUBE", "VLOG", "PODCAST", "VSL", "AD", "INTRO", "MOTION_DESIGN", "OTHER"]).optional(),
    }),
    run: async (actor, input) => {
      const rows = await listEditors(actor, { q: input.query, status: input.status, skill: input.skill, format: input.format });
      return rows.map((e) => ({ ...e, url: link(`/monteurs/${e.id}`) }));
    },
  }),

  tool({
    name: "get_planning",
    label: "Planning",
    about: "Calendar between two dates (max 62 days): client and internal video deadlines, editor mission due dates and editor unavailability, plus planned hours per editor over the range.",
    anyOf: ["planning.view"],
    input: z.object({
      from: z.string().refine(isIsoDate, DATE_HINT).describe("Start date (YYYY-MM-DD)"),
      to: z.string().refine(isIsoDate, DATE_HINT).describe("End date (YYYY-MM-DD)"),
      editor_id: z.string().max(64).optional(),
      client_id: z.string().max(64).optional(),
    }),
    run: async (actor, input) => {
      const [from, to] = input.from <= input.to ? [input.from, input.to] : [input.to, input.from];
      if (diffInDays(from, to) > 62) throw new DomainError(RANGE_HINT);
      const today = await agencyToday();
      const res = await getPlanning(actor, { from, to }, { editor: input.editor_id, client: input.client_id }, today);
      return {
        today,
        events: res.events.slice(0, 300).map(({ href, ...e }) => ({ ...e, url: href ? link(href) : null })),
        plannedHoursByEditor: res.load,
      };
    },
  }),

  tool({
    name: "list_opportunities",
    label: "Prospection",
    about: "Sales pipeline: opportunities with client, stage, estimated amount, probability, expected close date, next action and follow-up date. Open opportunities only unless a stage is given.",
    anyOf: ["prospection.read"],
    input: z.object({
      stage: z.enum(["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"]).optional(),
      query: optionalText("Text in title or client name"),
    }),
    run: async (_actor, input) => {
      const rows = await prisma.opportunity.findMany({
        where: {
          stage: input.stage ?? { notIn: ["WON", "LOST"] },
          ...(input.query ? { OR: [{ title: { contains: input.query, mode: "insensitive" } }, { client: { displayName: { contains: input.query, mode: "insensitive" } } }] } : {}),
        },
        orderBy: [{ followUpOn: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
        take: 100,
        select: {
          id: true, title: true, stage: true, services: true, estimatedAmount: true, currency: true, probability: true,
          expectedCloseOn: true, nextAction: true, followUpOn: true, lostReason: true,
          client: { select: { id: true, displayName: true } }, owner: { select: { name: true } },
        },
      });
      return rows.map((o) => ({ ...o, expectedCloseOn: d(o.expectedCloseOn), followUpOn: d(o.followUpOn), client: o.client.displayName, clientId: o.client.id, owner: o.owner?.name ?? null, url: link(`/prospection/${o.id}`) }));
    },
  }),

  tool({
    name: "search_invoices",
    label: "Factures",
    about: "Invoices with balance and payment state (DRAFT, ISSUED, PARTIALLY_PAID, PAID, CANCELLED…). state='overdue' lists unpaid invoices past their due date. Newest first, 50 max.",
    anyOf: ["invoices.read"],
    input: z.object({
      query: optionalText("Invoice number or client name"),
      client_id: z.string().max(64).optional(),
      state: z.enum(["overdue", "DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "CANCELLED"]).optional(),
    }),
    run: async (actor, input) => {
      const rows = await listInvoices(actor, { q: input.query, client: input.client_id, state: input.state });
      return { total: rows.length, rows: rows.slice(0, 50).map((r) => ({ ...omit(r, "hasPdf"), client: r.client.displayName, url: link(`/finances/factures/${r.id}`) })) };
    },
  }),

  tool({
    name: "get_receivables",
    label: "Créances",
    about: "Money clients still owe: total open balance and overdue amount in EUR, and each open invoice with its balance and days overdue (most overdue first).",
    anyOf: ["invoices.read"],
    input: z.object({}),
    run: async () => {
      const r = await getReceivables(await agencyToday());
      return {
        openEur: r.totalEur,
        overdueEur: r.overdueEur,
        overdueCount: r.overdueCount,
        invoices: r.open.slice(0, 50).map((i) => ({ number: i.number, client: i.client, currency: i.currency, balance: i.balance, balanceEur: i.balanceEur, dueDate: d(i.dueDate), daysOverdue: i.daysOverdue, overdue: i.overdue, url: link(`/finances/factures/${i.id}`) })),
      };
    },
  }),

  tool({
    name: "run_report",
    label: "Rapport",
    about:
      "Run one of the CRM reports and get its table (columns, rows, totals, definitions). Reports: resultat (monthly result over 12 months), clients (client profitability), projets (project profitability), videos (video profitability), formats (profitability by format), monteurs (costs and payments per editor), impayes (unpaid invoices and ageing), charge (production workload), hors-perimetre (out-of-scope revisions). Finance reports require finance-report access. Period applies to reports based on a period.",
    anyOf: ["reports.operational", "reports.finance"],
    input: z.object({
      report: z.enum(["resultat", "clients", "projets", "videos", "formats", "monteurs", "impayes", "charge", "hors-perimetre"]),
      ...periodInput,
    }),
    run: async (actor, input) => {
      const def = REPORTS.find((r) => r.key === input.report)!;
      if (!can(actor, def.perm)) throw new ForbiddenError();
      const { period } = await periodFrom(input);
      const table = await buildReport(actor, input.report, period);
      return {
        title: table.title,
        period: def.usesPeriod ? period : undefined,
        dateBasis: table.dateBasis,
        notes: table.notes,
        summary: table.summary,
        columns: table.columns.map((c) => ({ key: c.key, label: c.label, kind: c.kind ?? "text" })),
        totalRows: table.rows.length,
        rows: table.rows.slice(0, 150),
        totals: table.totals,
        url: link(`/rapports?rapport=${input.report}`),
      };
    },
  }),
];

/** Outils proposés à un utilisateur (ordre stable : favorise le cache de prompt). */
export function toolsFor(actor: Actor): CrmTool[] {
  if (!can(actor, "assistant.use")) return [];
  return TOOLS.filter((t) => t.anyOf.some((p) => can(actor, p)));
}

export function findTool(actor: Actor, name: string): CrmTool | null {
  return toolsFor(actor).find((t) => t.name === name) ?? null;
}

export type ToolOutcome = { ok: true; text: string } | { ok: false; text: string };

/**
 * Exécute un outil pour un utilisateur : revalide la permission et l'entrée (une entrée
 * invalide n'exécute rien), puis sérialise le résultat en JSON borné.
 */
export async function runTool(actor: Actor, name: string, rawInput: unknown): Promise<ToolOutcome> {
  const t = findTool(actor, name);
  if (!t) return { ok: false, text: `Unknown tool or not allowed for your role: ${name}` };
  const parsed = t.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { ok: false, text: JSON.stringify({ INVALID_INPUT: z.flattenError(parsed.error), received: rawInput ?? null }) };
  }
  try {
    const result = await t.run(actor, parsed.data as never);
    return { ok: true, text: serializeResult(result) };
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, text: "Access denied: your role cannot see this information." };
    if (error instanceof NotFoundError) return { ok: false, text: "Not found (check the id with a search tool)." };
    if (error instanceof DomainError) return { ok: false, text: error.message };
    console.error(`[assistant] outil ${name} en erreur`, error);
    return { ok: false, text: "The tool failed unexpectedly. Try again or narrow the request." };
  }
}

export function serializeResult(result: unknown): string {
  const text = JSON.stringify(toJsonSafe(result));
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}… [truncated: narrow the filters to see more]`;
}

/** Pour les tests : toutes les définitions, sans filtrage. */
export const ALL_TOOL_NAMES = TOOLS.map((t) => t.name);
