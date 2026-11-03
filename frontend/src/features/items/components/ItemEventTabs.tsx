import { useMemo, useState } from "react";
import { Calendar, MapPin, Package, Plus, X } from "lucide-react";
import type { EventTemplateDto, ItemEventConfigDto } from "../../../services/api";
import { Button } from "../../../components/Button/Button";
import styles from "./ItemEventTabs.module.css";

/** Aba do item "puro" — vale onde o evento não tiver versão própria. */
export const ABA_PADRAO = "__padrao__";

type Props = {
  eventos: ItemEventConfigDto[];
  abaAtiva: string;
  onTrocarAba: (aba: string) => void;
  /** Todos os eventos cadastrados — para oferecer os que faltam. */
  todosEventos: EventTemplateDto[];
  onIncluirEmEvento: (eventTemplateId: string) => void;
  onRetirarDoEvento: (eventTemplateId: string) => void;
  /** Item ainda nao salvo nao pode ser incluido em evento. */
  podeEditarEventos: boolean;
  ocupado?: boolean;
};

/**
 * Abas no topo da tela do item, no mesmo padrão das abas de cidade do evento:
 * os campos do cadastro são sempre os mesmos, o que muda é de qual evento são
 * os valores.
 */
export function ItemEventTabs({
  eventos,
  abaAtiva,
  onTrocarAba,
  todosEventos,
  onIncluirEmEvento,
  onRetirarDoEvento,
  podeEditarEventos,
  ocupado = false,
}: Props) {
  const [abrindoSeletor, setAbrindoSeletor] = useState(false);
  const [escolhido, setEscolhido] = useState("");

  // So faz sentido oferecer os eventos em que o item ainda nao esta.
  const disponiveis = useMemo(() => {
    const jaTem = new Set(eventos.map((e) => String(e.event_template_id)));
    return todosEventos
      .filter((e) => !jaTem.has(String(e.db_id ?? e.id)))
      .sort((a, b) => `${a.name}${a.city}`.localeCompare(`${b.name}${b.city}`, "pt-BR"));
  }, [eventos, todosEventos]);

  // Sem evento e sem poder incluir nao ha o que mostrar.
  if (eventos.length === 0 && !podeEditarEventos) return null;

  return (
    <div className={styles.wrapper}>
    <div className={styles.tabsScroller}>
      <button
        type="button"
        className={abaAtiva === ABA_PADRAO ? styles.tabActive : styles.tab}
        onClick={() => onTrocarAba(ABA_PADRAO)}
        title="O item como ele vale em qualquer evento sem versão própria"
      >
        <Package size={14} /> Padrão
      </button>

      {eventos.map((ev) => {
        const ativa = ev.event_template_id === abaAtiva;
        return (
          <button
            key={ev.event_template_id}
            type="button"
            className={ativa ? styles.tabActive : styles.tab}
            onClick={() => onTrocarAba(ev.event_template_id)}
            title={`${ev.event_name} — ${ev.event_city}`}
          >
            <Calendar size={14} />
            <span className={styles.tabName}>{ev.event_name}</span>
            <span className={styles.tabCity}>
              <MapPin size={11} /> {ev.event_city}
            </span>
            {ativa && podeEditarEventos && (
              <span
                role="button"
                tabIndex={0}
                className={styles.tabRemove}
                aria-label={`Retirar o item de ${ev.event_name}`}
                title={`Retirar o item de ${ev.event_name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (
                    window.confirm(
                      `Retirar este item de ${ev.event_name} (${ev.event_city})? A versão do item neste evento é perdida.`,
                    )
                  ) {
                    onRetirarDoEvento(ev.event_template_id);
                  }
                }}
              >
                <X size={13} />
              </span>
            )}
          </button>
        );
      })}

      {podeEditarEventos && disponiveis.length > 0 && (
        <button
          type="button"
          className={styles.tabAdd}
          onClick={() => setAbrindoSeletor((v) => !v)}
        >
          <Plus size={14} /> Novo evento
        </button>
      )}
    </div>

    {abrindoSeletor && (
      <div className={styles.picker}>
        <select
          className={styles.pickerSelect}
          value={escolhido}
          onChange={(e) => setEscolhido(e.target.value)}
        >
          <option value="">Escolha o evento...</option>
          {disponiveis.map((e) => {
            const valor = String(e.db_id ?? e.id);
            return (
              <option key={valor} value={valor}>
                {e.name} — {e.city}
              </option>
            );
          })}
        </select>
        <Button
          type="button"
          size="sm"
          disabled={!escolhido}
          isLoading={ocupado}
          onClick={() => {
            onIncluirEmEvento(escolhido);
            setEscolhido("");
            setAbrindoSeletor(false);
          }}
        >
          Incluir
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAbrindoSeletor(false)}
        >
          Cancelar
        </Button>
      </div>
    )}
    </div>
  );
}
