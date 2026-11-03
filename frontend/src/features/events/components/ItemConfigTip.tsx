import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import type { BaseItemDto } from "../../../services/api";

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

type Linha = { rotulo: string; valor: string };

/** O que foi configurado no cadastro do item, em forma de lista. */
function configuracoesDoItem(item: BaseItemDto): Linha[] {
  const sim = (v: unknown) => (v ? "Sim" : "Não");
  const linhas: Linha[] = [
    { rotulo: "Valor unitário", valor: moeda.format(Number(item.unit_price) || 0) },
    { rotulo: "Quantidade padrão", valor: String(Number(item.default_quantity) || 1) },
    { rotulo: "Permite edição no orçamento", valor: sim(item.editable) },
    { rotulo: "Dinâmico conforme formandos", valor: sim(item.dynamic_by_students) },
    { rotulo: "Valor aparece para cliente", valor: sim(item.value_visible_to_client) },
  ];

  // Os opcionais só entram quando ligados — listar "Não" para todos faria o
  // tooltip crescer sem informar nada.
  const subitens = Array.isArray(item.subitems) ? item.subitems : [];
  if (item.has_subitems && subitens.length > 0) {
    linhas.push({
      rotulo: `Sub-itens (${subitens.length})`,
      valor: subitens
        .map((s) => s.name)
        .slice(0, 4)
        .join(", ")
        .concat(subitens.length > 4 ? "…" : ""),
    });
  }
  if (item.has_additional && Number(item.additional_quantity) > 0) {
    linhas.push({
      rotulo: "Adicional",
      valor: `+${Number(item.additional_quantity)} un.`,
    });
  }
  if (item.has_multiplier && Number(item.multiplier_quantity) > 0) {
    linhas.push({
      rotulo: "Multiplicador",
      valor: `× ${Number(item.multiplier_quantity)}`,
    });
  }
  const variacoes = Array.isArray(item.variations) ? item.variations : [];
  if (variacoes.length > 0) {
    linhas.push({
      rotulo: `Variações (${variacoes.length})`,
      valor: variacoes
        .map((v) => v.name)
        .slice(0, 4)
        .join(", ")
        .concat(variacoes.length > 4 ? "…" : ""),
    });
  }

  return linhas;
}

/**
 * "i" no card do item, dentro da lista de itens do evento: mostra no hover o
 * que já foi configurado no cadastro daquele item, para o usuário escolher sem
 * precisar abrir a tela do item.
 */
export function ItemConfigTip({ item }: { item: BaseItemDto }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLButtonElement>(null);

  // Portal com position:fixed — o card tem overflow e transform, que cortariam
  // um tooltip posicionado dentro dele.
  const mostrar = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      const metade = 150;
      setPos({
        top: rect.bottom + 8,
        left: Math.min(
          Math.max(rect.left + rect.width / 2, metade + 8),
          window.innerWidth - metade - 8,
        ),
      });
    }
    setAberto(true);
  };

  const linhas = configuracoesDoItem(item);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={`Configurações de ${item.name}`}
        onMouseEnter={mostrar}
        onMouseLeave={() => setAberto(false)}
        onFocus={mostrar}
        onBlur={() => setAberto(false)}
        // O card inteiro seleciona o item no clique: o "i" nao pode selecionar.
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        style={{
          position: "absolute",
          top: "8px",
          right: "8px",
          width: "20px",
          height: "20px",
          padding: 0,
          borderRadius: "999px",
          border: "none",
          background: "none",
          color: "var(--color-text-secondary)",
          cursor: "help",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Info size={15} />
      </button>

      {aberto &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              transform: "translateX(-50%)",
              width: "max-content",
              maxWidth: "320px",
              padding: "10px 12px",
              borderRadius: "10px",
              background: "#111827",
              color: "#fff",
              fontSize: "12px",
              lineHeight: 1.5,
              boxShadow: "0 10px 22px rgba(0,0,0,0.22)",
              zIndex: 9999,
              pointerEvents: "none",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "6px" }}>{item.name}</div>
            {linhas.map((l) => (
              <div
                key={l.rotulo}
                style={{ display: "flex", gap: "10px", justifyContent: "space-between" }}
              >
                <span style={{ color: "rgba(255,255,255,0.7)" }}>{l.rotulo}</span>
                <span style={{ fontWeight: 600, textAlign: "right" }}>{l.valor}</span>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
