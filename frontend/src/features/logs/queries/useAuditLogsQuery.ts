import { useQuery } from "@tanstack/react-query";
import {
  auditLogsApi,
  type AuditLogsFiltersDto,
  type AuditLogsListDto,
} from "../../../services/api";
import { deepFixMojibake } from "../../../utils/textEncoding";

export const auditLogsQueryKey = ["audit-logs"] as const;

async function fetchAuditLogs(filters?: AuditLogsFiltersDto): Promise<AuditLogsListDto> {
  let res;
  try {
    res = await auditLogsApi.getAll(filters);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Cannot GET /web/logs")) {
      throw new Error("Endpoint de logs não encontrado. Reinicie o backend para carregar a nova rota.");
    }
    throw error;
  }
  if (!res.ok) {
    throw new Error(res.message || "Erro ao carregar logs");
  }
  return deepFixMojibake(res.data);
}

export function useAuditLogsQuery(filters: AuditLogsFiltersDto) {
  return useQuery({
    queryKey: [...auditLogsQueryKey, filters],
    queryFn: () => fetchAuditLogs(filters),
    staleTime: 15_000,
  });
}
