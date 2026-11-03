import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "../../../components/Button/Button";
import { Input } from "../../../components/Input/Input";
import { mascaraReais, textoDoValor } from "../../budgets/components/DiscountInputField";
import type {
  VenueEntrance,
  VenueOptional,
  VenueSettings,
} from "../domain/venueProposal";
import { useVenueSettingsQuery } from "../queries/useVenueProposalQueries";
import { useVenueProposalMutations } from "../mutations/useVenueProposalMutations";
import { VENUE_SETTINGS_FALLBACK } from "../data/venueSettings";
import styles from "./VenueProposal.module.css";

/** Id estável a partir do nome, para a linha nova não colidir com as de cima. */
function idPeloNome(nome: string, usados: string[]) {
  const base =
    nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "item";
  let id = base;
  let n = 2;
  while (usados.includes(id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  return id;
}

/** Campo de dinheiro com a máscara do real, no padrão do resto do sistema. */
function CampoReais({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (valor: number) => void;
}) {
  const [texto, setTexto] = useState(() => textoDoValor(value, "FIXED"));
  const ultimo = useRef(value);

  useEffect(() => {
    if (value === ultimo.current) return;
    ultimo.current = value;
    setTexto(textoDoValor(value, "FIXED"));
  }, [value]);

  return (
    <Input
      label={label}
      type="text"
      inputMode="decimal"
      leftIcon="R$"
      value={texto}
      onChange={(e) => {
        const { texto: proximo, valor } = mascaraReais(e.target.value);
        setTexto(proximo);
        ultimo.current = valor;
        onChange(valor);
      }}
    />
  );
}

/**
 * Tabela de preços do Centro de Eventos Aurora Hall.
 *
 * Existe para o gestor mudar valor sem depender de deploy. O que se edita aqui
 * vale para as propostas NOVAS: cada proposta guarda a tabela com que foi
 * feita, então nada do que já foi emitido muda de valor.
 */
export function VenueSettingsPage() {
  const navigate = useNavigate();
  const { data: settings } = useVenueSettingsQuery();
  const { updateSettingsMutation } = useVenueProposalMutations();

  const [form, setForm] = useState<VenueSettings | null>(null);
  const inicializado = useRef(false);

  // Carrega uma vez: recarregar a cada refetch apagaria o que está sendo
  // editado.
  useEffect(() => {
    if (!settings || inicializado.current) return;
    inicializado.current = true;
    setForm(settings);
  }, [settings]);

  if (!form) {
    return <div className={styles.empty}>Carregando a tabela de preços…</div>;
  }

  const alterar = <K extends keyof VenueSettings>(campo: K, valor: VenueSettings[K]) =>
    setForm((atual) => (atual ? { ...atual, [campo]: valor } : atual));

  const alterarEntrada = (indice: number, patch: Partial<VenueEntrance>) =>
    alterar(
      "entrances",
      form.entrances.map((item, i) => (i === indice ? { ...item, ...patch } : item)),
    );

  const alterarOpcional = (indice: number, patch: Partial<VenueOptional>) =>
    alterar(
      "optionals",
      form.optionals.map((item, i) => (i === indice ? { ...item, ...patch } : item)),
    );

  const salvar = async () => {
    if (form.entrances.length === 0) {
      toast.error("Deixe ao menos uma configuração de locação.");
      return;
    }
    if (form.entrances.some((entrada) => !entrada.name.trim())) {
      toast.error("Toda configuração de locação precisa de um nome.");
      return;
    }
    if (form.optionals.some((opcional) => !opcional.name.trim())) {
      toast.error("Todo serviço opcional precisa de um nome.");
      return;
    }
    await updateSettingsMutation.mutateAsync(form);
    navigate("/venue-proposals");
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Tabela de Preços</h1>
          <p className={styles.subtitle}>
            Centro de Eventos Aurora Hall · vale para as próximas propostas
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="outline"
            leftIcon={<ArrowLeft size={18} />}
            onClick={() => navigate("/venue-proposals")}
          >
            Voltar
          </Button>
          <Button
            variant="outline"
            leftIcon={<RotateCcw size={18} />}
            title="Voltar aos valores da proposta comercial de referência"
            onClick={() => {
              if (
                window.confirm(
                  "Restaurar os valores da proposta comercial de referência? O que estiver na tela é substituído (nada é salvo até você clicar em Salvar).",
                )
              ) {
                setForm(VENUE_SETTINGS_FALLBACK);
              }
            }}
          >
            Restaurar padrão
          </Button>
        </div>
      </header>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Configurações de locação</h2>
        <p className={styles.hint} style={{ marginBottom: "12px" }}>
          As formas de acesso ao salão. O consultor escolhe uma por proposta, e é a
          tarifa dela que define a diária adicional de montagem.
        </p>

        {form.entrances.map((entrada, indice) => (
          <div key={entrada.id || indice} className={styles.settingsRow}>
            <Input
              label="Nome"
              value={entrada.name}
              onChange={(e) => alterarEntrada(indice, { name: e.target.value })}
              placeholder="Entrada Principal"
            />
            <Input
              label="Descrição"
              value={entrada.description}
              onChange={(e) => alterarEntrada(indice, { description: e.target.value })}
              placeholder="Acesso pelo salão principal"
            />
            <CampoReais
              label="Valor da locação"
              value={entrada.price}
              onChange={(valor) => alterarEntrada(indice, { price: valor })}
            />
            <Button
              variant="ghost"
              size="sm"
              title="Remover esta configuração"
              style={{ color: "#ef4444" }}
              onClick={() =>
                alterar(
                  "entrances",
                  form.entrances.filter((_, i) => i !== indice),
                )
              }
            >
              <Trash2 size={18} />
            </Button>
          </div>
        ))}

        <Button
          variant="outline"
          size="sm"
          leftIcon={<Plus size={16} />}
          onClick={() =>
            alterar("entrances", [
              ...form.entrances,
              {
                id: idPeloNome("nova entrada", form.entrances.map((e) => e.id)),
                name: "",
                description: "",
                price: 0,
              },
            ])
          }
        >
          Adicionar configuração
        </Button>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Serviços opcionais</h2>
        <p className={styles.hint} style={{ marginBottom: "12px" }}>
          "Cobrado por diária" faz o serviço multiplicar pelos dias escolhidos na
          proposta, limitado à duração do evento.
        </p>

        {form.optionals.map((opcional, indice) => (
          <div key={opcional.id || indice} className={styles.settingsRow}>
            <Input
              label="Nome"
              value={opcional.name}
              onChange={(e) => alterarOpcional(indice, { name: e.target.value })}
              placeholder="Estacionamento"
            />
            <Input
              label="Condição (sai na proposta)"
              value={opcional.condition}
              onChange={(e) => alterarOpcional(indice, { condition: e.target.value })}
              placeholder="Opcional"
            />
            <CampoReais
              label="Valor"
              value={opcional.price}
              onChange={(valor) => alterarOpcional(indice, { price: valor })}
            />
            <label className={styles.settingsCheck}>
              <input
                type="checkbox"
                checked={opcional.perDay}
                onChange={(e) => alterarOpcional(indice, { perDay: e.target.checked })}
              />
              Cobrado por diária
            </label>
            <Button
              variant="ghost"
              size="sm"
              title="Remover este serviço"
              style={{ color: "#ef4444" }}
              onClick={() =>
                alterar(
                  "optionals",
                  form.optionals.filter((_, i) => i !== indice),
                )
              }
            >
              <Trash2 size={18} />
            </Button>
          </div>
        ))}

        <Button
          variant="outline"
          size="sm"
          leftIcon={<Plus size={16} />}
          onClick={() =>
            alterar("optionals", [
              ...form.optionals,
              {
                id: idPeloNome("novo servico", form.optionals.map((o) => o.id)),
                name: "",
                condition: "Opcional",
                price: 0,
                perDay: false,
              },
            ])
          }
        >
          Adicionar serviço
        </Button>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Regras da locação</h2>
        <div className={styles.grid}>
          <CampoReais
            label="Climatização fora do evento (por dia)"
            value={form.climateControlDailyRate}
            onChange={(valor) => alterar("climateControlDailyRate", valor)}
          />
          <Input
            label="Diária adicional (% da tarifa)"
            type="number"
            min="0"
            max="100"
            value={form.extraDailyPercent}
            onChange={(e) => alterar("extraDailyPercent", Number(e.target.value))}
          />
          <Input
            label="Dias de montagem inclusos"
            type="number"
            min="0"
            value={form.includedSetupDays}
            onChange={(e) => alterar("includedSetupDays", Number(e.target.value))}
          />
          <Input
            label="Dias de desmontagem inclusos"
            type="number"
            min="0"
            value={form.includedTeardownDays}
            onChange={(e) => alterar("includedTeardownDays", Number(e.target.value))}
          />
          <Input
            label="Validade da proposta (dias)"
            type="number"
            min="0"
            value={form.validityDays}
            onChange={(e) => alterar("validityDays", Number(e.target.value))}
          />
        </div>
        <p className={styles.hint} style={{ marginTop: "10px" }}>
          Dias de montagem/desmontagem além dos inclusos entram automaticamente na
          proposta, cobrados a {form.extraDailyPercent}% da tarifa do espaço escolhido.
        </p>
      </section>

      <div className={styles.stickyBar}>
        <div className={styles.stickyInner}>
          <span className={styles.stickyItem}>
            <span className={styles.stickyLabel}>Propostas já emitidas</span>
            <strong>não mudam de valor</strong>
          </span>
          <Button
            leftIcon={<Save size={18} />}
            isLoading={updateSettingsMutation.isPending}
            onClick={() => void salvar()}
          >
            Salvar tabela
          </Button>
        </div>
      </div>
    </div>
  );
}
