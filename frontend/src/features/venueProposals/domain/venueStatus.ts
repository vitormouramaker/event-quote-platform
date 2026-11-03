/**
 * Ciclo de vida da proposta de locação.
 *
 * É o mesmo do orçamento, e de propósito: o consultor monta, manda para
 * aprovação, o gestor aprova ou devolve com um motivo. Quem usa as duas telas
 * não precisa aprender dois fluxos.
 *
 *   PENDING ──enviar──▶ SENT_FOR_APPROVAL ──aprovar──▶ APPROVED
 *      ▲                      │
 *      └──── devolver ────────┘            qualquer uma ──cancelar──▶ CANCELLED
 */

export type VenueProposalStatus =
  | "PENDING"
  | "SENT_FOR_APPROVAL"
  | "APPROVED"
  | "CANCELLED";

export const VENUE_STATUS_LABEL: Record<VenueProposalStatus, string> = {
  PENDING: "Pendente",
  SENT_FOR_APPROVAL: "Enviado p/ aprovação",
  APPROVED: "Aprovada",
  CANCELLED: "Cancelada",
};

/** Qualquer coisa fora da lista é pendente — inclusive linha antiga sem status. */
export function resolveVenueStatus(raw: unknown): VenueProposalStatus {
  const valor = String(raw ?? "").toUpperCase();
  return valor === "SENT_FOR_APPROVAL" ||
    valor === "APPROVED" ||
    valor === "CANCELLED"
    ? valor
    : "PENDING";
}

/**
 * Quem pode mexer na proposta.
 *
 * Enviada ou aprovada, ela vira documento: o consultor não mexe mais, só o
 * gestor. Sem isso o valor aprovado — que entra no painel e na comissão —
 * mudaria depois da decisão.
 */
export function canEditVenueProposal(
  status: VenueProposalStatus,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  return status === "PENDING";
}

/** Por que a proposta está travada para quem não é gestor. */
export function venueLockReason(status: VenueProposalStatus): string | null {
  if (status === "SENT_FOR_APPROVAL") {
    return "Proposta enviada para aprovação. Enquanto o gestor não decidir, ela não pode ser alterada.";
  }
  if (status === "APPROVED") {
    return "Proposta aprovada. Para mudar algum valor, peça ao gestor.";
  }
  if (status === "CANCELLED") {
    return "Proposta cancelada.";
  }
  return null;
}

/** Os status que este usuário pode aplicar, a partir do atual. */
export function venueStatusOptions(
  atual: VenueProposalStatus,
  isAdmin: boolean,
): VenueProposalStatus[] {
  if (isAdmin) return ["PENDING", "SENT_FOR_APPROVAL", "APPROVED", "CANCELLED"];
  // Consultor manda para aprovação e pode voltar atrás enquanto ninguém decidiu.
  if (atual === "PENDING") return ["PENDING", "SENT_FOR_APPROVAL"];
  if (atual === "SENT_FOR_APPROVAL") return ["SENT_FOR_APPROVAL"];
  return [atual];
}
