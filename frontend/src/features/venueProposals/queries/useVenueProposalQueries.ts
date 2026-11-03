import { useQuery } from "@tanstack/react-query";
import { venueProposalsApi } from "../../../services/api";
import { normalizeVenueSettings } from "../data/venueSettings";

export const venueProposalsQueryKey = ["venue-proposals"] as const;
export const venueSettingsQueryKey = ["venue-settings"] as const;

/** Propostas de locação, da mais recente para a mais antiga. */
export function useVenueProposalsQuery() {
  return useQuery({
    queryKey: venueProposalsQueryKey,
    queryFn: async () => {
      const res = await venueProposalsApi.getAll();
      return res.ok ? res.data ?? [] : [];
    },
  });
}

/**
 * Propostas de locação esperando decisão sobre o desconto.
 *
 * Mora aqui, e não na tela, porque o contador do menu lateral também precisa
 * dela: sem isso o gestor só descobre que há pedido pendente entrando na tela.
 */
export function usePendingVenueDiscounts() {
  const { data: proposals = [] } = useVenueProposalsQuery();
  return proposals.filter((row) => row.discount_status === "PENDING");
}

/**
 * Propostas esperando o gestor aprovar ou devolver.
 *
 * Fica aqui pelo mesmo motivo das pendencias de desconto: o contador do menu
 * lateral precisa dela sem abrir a tela.
 */
export function usePendingVenueApprovals() {
  const { data: proposals = [] } = useVenueProposalsQuery();
  return proposals.filter((row) => row.status === "SENT_FOR_APPROVAL");
}

export function useVenueProposalQuery(id: string | undefined) {
  return useQuery({
    queryKey: [...venueProposalsQueryKey, id],
    queryFn: async () => {
      if (!id) return null;
      const res = await venueProposalsApi.getById(id);
      return res.ok ? res.data : null;
    },
    enabled: !!id,
  });
}

/**
 * Tabela de preços do espaço. Sempre devolve algo utilizável: sem isso a tela
 * abriria sem nenhuma opção de locação se a API falhasse.
 */
export function useVenueSettingsQuery() {
  return useQuery({
    queryKey: venueSettingsQueryKey,
    queryFn: async () => {
      const res = await venueProposalsApi.getSettings();
      return normalizeVenueSettings(res.ok ? res.data?.data : undefined);
    },
  });
}
