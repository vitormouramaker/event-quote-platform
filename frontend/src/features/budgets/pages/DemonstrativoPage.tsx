import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { publicApi } from "../../../services/api";
import { hydrateCanonicalRuntimeConfig } from "../migration/canonicalRuntimeConfig";
import { buildBudgetEventsCatalog } from "../data/budgetCatalog";
import { mapBudget } from "../../../store/budgetStore";
import { buildBudgetPrintDocument } from "../print/budgetPrint";
import { DemonstrativoView } from "../components/DemonstrativoView";

const centerStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background: "#F4F1EA",
  color: "#16161A",
  fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  padding: "24px",
  textAlign: "center",
};

export function DemonstrativoPage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-demonstrativo", token],
    queryFn: async () => {
      const res = await publicApi.getDemonstrativo(token || "");
      if (!res.ok || !res.data) {
        throw new Error(res.message || "Demonstrativo não encontrado");
      }
      return res.data;
    },
    enabled: !!token,
    retry: false,
  });

  const document = useMemo(() => {
    if (!data) return null;
    hydrateCanonicalRuntimeConfig(data.runtimeCatalog);
    const catalog = buildBudgetEventsCatalog(data.eventTemplates);
    const budget = mapBudget(data.budget);
    return buildBudgetPrintDocument(budget, catalog);
  }, [data]);

  if (isLoading) {
    return (
      <div style={centerStyle}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Carregando…</div>
          <div style={{ color: "#9A9A8E", marginTop: 8 }}>
            Preparando o demonstrativo do orçamento.
          </div>
        </div>
      </div>
    );
  }

  if (isError || !document) {
    return (
      <div style={centerStyle}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#C5A158" }}>
            ORÇA EVENTOS
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 18 }}>
            Demonstrativo indisponível
          </div>
          <div style={{ color: "#9A9A8E", marginTop: 8, maxWidth: 360 }}>
            Este link é inválido ou expirou. Solicite um novo link à comissão ou
            à equipe comercial.
          </div>
        </div>
      </div>
    );
  }

  return <DemonstrativoView document={document} />;
}
