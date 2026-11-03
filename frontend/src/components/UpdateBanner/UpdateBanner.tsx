import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useVersionCheck } from "../../hooks/useVersionCheck";
import { forceAppRefresh } from "../../lib/appUpdate";

// Aviso fixo quando há versão nova publicada. O usuário clica "Atualizar" e o app
// recarrega na versão mais recente. Aparece sozinho em qualquer tela do app.
export function UpdateBanner() {
  const updateAvailable = useVersionCheck();
  const [refreshing, setRefreshing] = useState(false);

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: 14,
        maxWidth: "calc(100% - 24px)",
        padding: "10px 14px 10px 16px",
        borderRadius: 999,
        background: "#111827",
        color: "#fff",
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        fontSize: 14,
      }}
    >
      <span>Nova versão disponível.</span>
      <button
        type="button"
        onClick={() => {
          setRefreshing(true);
          void forceAppRefresh();
        }}
        disabled={refreshing}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "7px 14px",
          borderRadius: 999,
          border: "none",
          background: "#C5A158",
          color: "#1A1508",
          fontSize: 13,
          fontWeight: 700,
          cursor: refreshing ? "default" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <RefreshCw size={15} />
        {refreshing ? "Atualizando…" : "Atualizar"}
      </button>
    </div>
  );
}
