import { useQuery } from "@tanstack/react-query";
import {
  dashboardApi,
  type DashboardSummaryDto,
  type DashboardSummaryFiltersDto,
} from "../../../services/api";
import { deepFixMojibake } from "../../../utils/textEncoding";
import { buildDashboardSummaryFallback } from "./dashboardSummaryFallback";

export const dashboardSummaryQueryKey = ["dashboard-summary"] as const;

async function fetchDashboardSummary(
  filters?: DashboardSummaryFiltersDto,
): Promise<DashboardSummaryDto> {
  let res;
  try {
    res = await dashboardApi.getSummary(filters);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const missingEndpoint =
      message.includes("Cannot GET /web/dashboard/summary") ||
      (message.includes("/web/dashboard/summary") && message.includes("404"));

    if (missingEndpoint) {
      console.warn(
        "[dashboard] Endpoint /web/dashboard/summary indisponivel no backend em execucao. Usando fallback no frontend.",
      );
      try {
        const fallback = await buildDashboardSummaryFallback(filters);
        return deepFixMojibake(fallback);
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(
          `O backend em execucao nao possui o endpoint do dashboard e o fallback falhou (${fallbackMessage}). Reinicie/atualize o backend.`,
        );
      }
    }

    throw error;
  }

  if (!res.ok) {
    throw new Error(res.message || "Erro ao carregar dashboard");
  }

  return deepFixMojibake(res.data);
}

export function useDashboardSummaryQuery(
  filters?: DashboardSummaryFiltersDto,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...dashboardSummaryQueryKey, filters ?? {}],
    queryFn: () => fetchDashboardSummary(filters),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}
