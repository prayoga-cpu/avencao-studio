import "server-only";
import { publicAppUrl } from "../app-url";

/** Types d'éléments renvoyés par les outils d'écriture de Claude (et rattachables à une pièce). */
export type RecordType =
  | "CLIENT"
  | "CONTACT"
  | "NOTE"
  | "ACTIVITY"
  | "OPPORTUNITY"
  | "PROJECT"
  | "VIDEO"
  | "VIDEO_LINK"
  | "FEEDBACK"
  | "CHANGE_REQUEST"
  | "ASSIGNMENT"
  | "EDITOR"
  | "UNAVAILABILITY"
  | "SALES_ORDER"
  | "INVOICE"
  | "CREDIT_NOTE"
  | "CLIENT_PAYMENT"
  | "SUPPLIER_PAYMENT"
  | "EXPENSE"
  | "DIRECT_COST"
  | "LEGACY_PAYMENT"
  | "SETTINGS"
  | "USER";

/** Page du CRM d'un élément qui a sa propre fiche (sinon, la liste qui le montre). */
export function recordPath(type: RecordType, id: string): string {
  switch (type) {
    case "CLIENT":
      return `/clients/${id}`;
    case "OPPORTUNITY":
      return `/prospection/${id}`;
    case "PROJECT":
      return `/projets/${id}`;
    case "VIDEO":
      return `/videos/${id}`;
    case "EDITOR":
      return `/monteurs/${id}`;
    case "SALES_ORDER":
      return `/finances/ventes/${id}`;
    case "INVOICE":
      return `/finances/factures/${id}`;
    case "DIRECT_COST":
      return `/finances/couts/${id}`;
    case "CREDIT_NOTE":
      return "/finances?onglet=factures";
    case "CLIENT_PAYMENT":
      return "/finances?onglet=encaissements";
    case "SUPPLIER_PAYMENT":
      return "/finances?onglet=reglements";
    case "EXPENSE":
      return "/finances?onglet=charges";
    case "LEGACY_PAYMENT":
      return "/finances?onglet=historique";
    case "SETTINGS":
    case "USER":
      return "/reglages";
    default:
      return "/dashboard";
  }
}

export const appLink = (path: string) => `${publicAppUrl()}${path}`;
export const recordUrl = (type: RecordType, id: string) => appLink(recordPath(type, id));
