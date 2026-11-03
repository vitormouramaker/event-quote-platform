import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Bold,
  Italic,
  Printer,
  RemoveFormatting,
  Save,
  Underline,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/Button/Button";
import {
  CONTRACT_BLOCKS,
  CONTRACT_VARIABLES,
  type ContractBlock,
} from "../data/contractTemplate";
import letterhead from "../data/letterhead.svg";
import { useContractsQuery } from "../queries/useContractsQuery";
import { useContractMutations } from "../mutations/useContractMutations";
import styles from "../styles/ContractsPage.module.css";

// Chave reservada dentro de `variables` para guardar a formatacao dos blocos.
const STYLES_KEY = "__blockStyles";

const TOKEN_RE = /\{\{(\w+)\}\}/g;
const VARIABLE_BY_KEY = new Map(CONTRACT_VARIABLES.map((v) => [v.key, v]));

// Altura útil (px) da área de conteúdo por folha A4 (1123 - top 150 - bottom 95),
// com folga para não cortar a última linha por diferença de arredondamento.
const CONTENT_HEIGHT = 860;

/* O contrato guarda a data como texto em dd/mm/aaaa (é o que sai impresso), mas
   o <input type="date"> fala aaaa-mm-dd. A conversão é feita só com string —
   criar um Date a partir de uma data sem hora joga o dia para trás no fuso. */
const DISPLAY_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function displayDateToIso(value: string) {
  const match = DISPLAY_DATE_RE.exec(value.trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

function isoDateToDisplay(value: string) {
  const match = ISO_DATE_RE.exec(value.trim());
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

function renderTemplateText(text: string, values: Record<string, string>) {
  const parts: Array<string | { key: string }> = [];
  let lastIndex = 0;
  for (const match of text.matchAll(TOKEN_RE)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) parts.push(text.slice(lastIndex, idx));
    parts.push({ key: match[1] });
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return parts.map((part, i) => {
    if (typeof part === "string") return <Fragment key={i}>{part}</Fragment>;
    const value = values[part.key]?.trim();
    if (value)
      return (
        <span key={i} className={styles.varFilled} data-var={part.key}>
          {value}
        </span>
      );
    const variable = VARIABLE_BY_KEY.get(part.key);
    return (
      <span key={i} className={styles.varEmpty} data-var={part.key}>
        {variable ? `[${variable.label}]` : "[preencher]"}
      </span>
    );
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Tags de estilo aceitas no bloco. Qualquer outra coisa e descartada na
// serializacao, entao o HTML guardado e sempre desta lista fechada.
const STYLE_TAG_BY_NAME: Record<string, string> = {
  b: "b",
  strong: "b",
  i: "i",
  em: "i",
  u: "u",
};

// DOM do bloco -> template de volta: as variaveis viram {{chave}} de novo, para
// continuarem vivas, e so as tags de estilo sobrevivem.
function serializeStyledBlock(el: HTMLElement): string {
  let out = "";
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += escapeHtml(node.textContent ?? "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const child = node as HTMLElement;
    const varKey = child.dataset?.var;
    if (varKey) {
      out += `{{${varKey}}}`;
      return;
    }
    const tag = STYLE_TAG_BY_NAME[child.tagName.toLowerCase()];
    const inner = serializeStyledBlock(child);
    out += tag ? `<${tag}>${inner}</${tag}>` : inner;
  });
  return out;
}

// Template estilizado -> HTML final, com os valores das variaveis aplicados.
function renderStyledBlockHtml(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = values[key]?.trim();
    if (value)
      return `<span class="${styles.varFilled}" data-var="${key}">${escapeHtml(value)}</span>`;
    const variable = VARIABLE_BY_KEY.get(key);
    const label = variable ? `[${variable.label}]` : "[preencher]";
    return `<span class="${styles.varEmpty}" data-var="${key}">${escapeHtml(label)}</span>`;
  });
}

function ContractBlockView({
  block,
  blockIndex,
  values,
  styledTemplate,
  editable,
}: {
  block: ContractBlock;
  blockIndex: number;
  values: Record<string, string>;
  styledTemplate?: string;
  editable?: boolean;
}) {
  const className =
    block.type === "title"
      ? styles.docTitle
      : block.type === "clause"
        ? styles.docClause
        : block.type === "sign"
          ? styles.docSign
          : styles.docParagraph;

  // contentEditable serve so para o navegador aplicar negrito/italico/sublinhado
  // na selecao; digitacao, colagem e arrastar sao bloqueados no onBeforeInput.
  const editableProps = editable
    ? {
        contentEditable: true,
        suppressContentEditableWarning: true,
        spellCheck: false,
        onBeforeInput: (event: React.FormEvent<HTMLElement>) => {
          const inputType = (event.nativeEvent as InputEvent).inputType ?? "";
          if (!inputType.startsWith("format")) event.preventDefault();
        },
        onPaste: (event: React.ClipboardEvent) => event.preventDefault(),
        onDrop: (event: React.DragEvent) => event.preventDefault(),
      }
    : {};

  const common = { className, "data-block": blockIndex, ...editableProps };

  if (styledTemplate !== undefined) {
    const html = { __html: renderStyledBlockHtml(styledTemplate, values) };
    if (block.type === "title")
      return <h1 {...common} dangerouslySetInnerHTML={html} />;
    return <p {...common} dangerouslySetInnerHTML={html} />;
  }

  const content = renderTemplateText(block.text, values);
  if (block.type === "title") return <h1 {...common}>{content}</h1>;
  return <p {...common}>{content}</p>;
}

function ContractPreview({
  values,
  previewRef,
  styledBlocks,
}: {
  values: Record<string, string>;
  previewRef: React.RefObject<HTMLDivElement | null>;
  styledBlocks: Record<number, string>;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][]>([]);

  // Mede a altura de cada bloco e quebra em folhas A4 (páginas reais).
  useLayoutEffect(() => {
    const container = measureRef.current;
    if (!container) return;
    const kids = Array.from(container.children) as HTMLElement[];
    const acc: number[][] = [];
    let current: number[] = [];
    let used = 0;
    kids.forEach((el, i) => {
      const s = getComputedStyle(el);
      const h =
        el.offsetHeight +
        parseFloat(s.marginTop || "0") +
        parseFloat(s.marginBottom || "0");
      if (used + h > CONTENT_HEIGHT && current.length) {
        acc.push(current);
        current = [];
        used = 0;
      }
      current.push(i);
      used += h;
    });
    if (current.length) acc.push(current);
    setPages(acc);
  }, [values, styledBlocks]);

  const renderedPages = pages.length
    ? pages
    : [CONTRACT_BLOCKS.map((_, i) => i)];

  return (
    <>
      <div ref={measureRef} className={styles.measure} aria-hidden>
        {CONTRACT_BLOCKS.map((block, i) => (
          <ContractBlockView
            key={i}
            block={block}
            blockIndex={i}
            values={values}
            styledTemplate={styledBlocks[i]}
          />
        ))}
      </div>

      <div ref={previewRef} className={`${styles.previewWrap} printArea`}>
        {renderedPages.map((idxs, pageIdx) => (
          <div
            key={pageIdx}
            className={styles.a4Page}
            style={{ backgroundImage: `url(${letterhead})` }}
          >
            <div className={styles.a4Content}>
              {idxs.map((bi) => (
                <ContractBlockView
                  key={bi}
                  block={CONTRACT_BLOCKS[bi]}
                  blockIndex={bi}
                  values={values}
                  styledTemplate={styledBlocks[bi]}
                  editable
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function CreateContractPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const autoPrint = searchParams.get("print") === "1";

  const { data: contracts = [] } = useContractsQuery();
  const { createMutation, updateMutation } = useContractMutations();
  const editing = id ? contracts.find((c) => c.id === id) : undefined;

  const previewRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(CONTRACT_VARIABLES.map((v) => [v.key, ""])),
  );
  const [loadedId, setLoadedId] = useState<string | null>(null);
  // Formatacao por bloco (negrito/italico/sublinhado aplicados na selecao).
  // Guardada junto das variaveis, numa chave reservada, para nao mexer no schema.
  const [styledBlocks, setStyledBlocks] = useState<Record<number, string>>({});

  // Preenche os campos ao abrir um contrato existente.
  useEffect(() => {
    if (editing && editing.id !== loadedId) {
      setValues(
        Object.fromEntries(
          CONTRACT_VARIABLES.map((v) => [v.key, editing.variables?.[v.key] ?? ""]),
        ),
      );
      try {
        const raw = editing.variables?.[STYLES_KEY];
        setStyledBlocks(raw ? (JSON.parse(raw) as Record<number, string>) : {});
      } catch {
        setStyledBlocks({});
      }
      setLoadedId(editing.id);
    }
  }, [editing, loadedId]);

  const setValue = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // Rola o preview até a seção do campo focado e destaca o trecho por um instante.
  const scrollToVar = (key: string) => {
    const target = previewRef.current?.querySelector<HTMLElement>(
      `[data-var="${key}"]`,
    );
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.remove(styles.varPulse);
    void target.offsetWidth; // reinicia a animação
    target.classList.add(styles.varPulse);
    window.setTimeout(() => target.classList.remove(styles.varPulse), 1500);
  };

  const title = values.turma?.trim() || "Contrato sem título";
  const saving = createMutation.isPending || updateMutation.isPending;

  // Aplica negrito/italico/sublinhado ao trecho selecionado no preview e guarda
  // o bloco resultante como template (com as variaveis ainda vivas).
  const applyFormat = (command: "bold" | "italic" | "underline") => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      toast.info("Selecione um trecho do documento para formatar.");
      return;
    }
    const anchor = selection.anchorNode;
    const blockEl = (anchor instanceof HTMLElement ? anchor : anchor?.parentElement)
      ?.closest<HTMLElement>("[data-block]");
    if (!blockEl || !previewRef.current?.contains(blockEl)) {
      toast.info("Selecione um trecho dentro do documento à direita.");
      return;
    }

    // styleWithCSS=false faz o navegador gerar <b>/<i>/<u> em vez de style inline.
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(command);

    const blockIndex = Number(blockEl.dataset.block);
    const serialized = serializeStyledBlock(blockEl);
    setStyledBlocks((prev) => ({ ...prev, [blockIndex]: serialized }));
  };

  const clearFormatting = () => {
    setStyledBlocks({});
    toast.success("Formatação removida do documento.");
  };

  const handleSave = () => {
    const payload = {
      title,
      variables: { ...values, [STYLES_KEY]: JSON.stringify(styledBlocks) },
    };
    if (id) {
      updateMutation.mutate(
        { id, data: payload },
        { onSuccess: () => navigate("/contracts") },
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => navigate("/contracts"),
      });
    }
  };

  // Impressão automática ao abrir com ?print=1 (a partir do card). Dispara UMA
  // vez: com `values` na dependência, cada tecla digitada reabria a impressão.
  const printedRef = useRef(false);
  useEffect(() => {
    if (!autoPrint || printedRef.current) return;
    printedRef.current = true;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [autoPrint]);

  return (
    <div className={styles.page}>
      <button
        type="button"
        className={styles.backLink}
        onClick={() => navigate("/contracts")}
      >
        <ArrowLeft size={16} /> Voltar para contratos
      </button>

      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>{id ? "Editar contrato" : "Criar contrato"}</h1>
          <p className={styles.subtitle}>
            Preencha os campos à esquerda; o documento à direita é atualizado em
            tempo real. Ao clicar num campo, o preview rola até a seção.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
          {/* Formatacao do trecho selecionado no documento ao lado. */}
          <div className={styles.formatBar} role="group" aria-label="Formatação">
            <button
              type="button"
              className={styles.formatButton}
              title="Negrito (selecione um trecho no documento)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat("bold")}
            >
              <Bold size={16} />
            </button>
            <button
              type="button"
              className={styles.formatButton}
              title="Itálico (selecione um trecho no documento)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat("italic")}
            >
              <Italic size={16} />
            </button>
            <button
              type="button"
              className={styles.formatButton}
              title="Sublinhado (selecione um trecho no documento)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFormat("underline")}
            >
              <Underline size={16} />
            </button>
            <button
              type="button"
              className={styles.formatButton}
              title="Remover toda a formatação"
              onMouseDown={(e) => e.preventDefault()}
              onClick={clearFormatting}
              disabled={Object.keys(styledBlocks).length === 0}
            >
              <RemoveFormatting size={16} />
            </button>
          </div>
          <Button
            variant="outline"
            onClick={() => window.print()}
            leftIcon={<Printer size={18} />}
          >
            Imprimir / PDF
          </Button>
          <Button
            onClick={handleSave}
            isLoading={saving}
            leftIcon={<Save size={18} />}
          >
            Salvar contrato
          </Button>
        </div>
      </div>

      <div className={styles.editor}>
        <div className={styles.formPanel}>
          {CONTRACT_VARIABLES.map((variable) => (
            <div key={variable.key} className={styles.field}>
              <label
                className={styles.fieldLabel}
                htmlFor={`contract-${variable.key}`}
              >
                {variable.label}
              </label>
              <span className={styles.fieldHint}>{variable.hint}</span>
              {variable.type === "date" ? (
                <input
                  id={`contract-${variable.key}`}
                  className={styles.fieldControl}
                  type="date"
                  value={displayDateToIso(values[variable.key] ?? "")}
                  onFocus={() => scrollToVar(variable.key)}
                  onChange={(e) =>
                    setValue(variable.key, isoDateToDisplay(e.target.value))
                  }
                />
              ) : variable.multiline ? (
                <textarea
                  id={`contract-${variable.key}`}
                  className={styles.fieldControl}
                  rows={3}
                  placeholder={variable.placeholder}
                  value={values[variable.key] ?? ""}
                  onFocus={() => scrollToVar(variable.key)}
                  onChange={(e) => setValue(variable.key, e.target.value)}
                />
              ) : (
                <input
                  id={`contract-${variable.key}`}
                  className={styles.fieldControl}
                  placeholder={variable.placeholder}
                  value={values[variable.key] ?? ""}
                  onFocus={() => scrollToVar(variable.key)}
                  onChange={(e) => setValue(variable.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>

        <ContractPreview
          values={values}
          previewRef={previewRef}
          styledBlocks={styledBlocks}
        />
      </div>
    </div>
  );
}
