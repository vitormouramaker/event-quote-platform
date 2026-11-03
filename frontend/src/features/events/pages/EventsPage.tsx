import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, MapPin, Search, Copy } from "lucide-react";
import clsx from "clsx";
import { Table } from "../../../components/Table/Table";
import { Button } from "../../../components/Button/Button";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { Input } from "../../../components/Input/Input";
import { Pagination } from "../../../components/Pagination/Pagination";
import { ModalShell } from "../../../components/ModalShell/ModalShell";
import { useEventsQuery } from "../queries/useEventsQuery";
import { useEventMutations } from "../mutations/useEventMutations";
import { LoadingStatePanel, ErrorStatePanel } from "../../../components/AsyncState/AsyncState";
import { isDuplicateName } from "../../../utils/normalizeName";
import type { EventTemplateDto } from "../../../services/api";
import styles from "../styles/EventsPage.module.css";

const EVENTS_PER_PAGE = 20;

export function EventsPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const { data: events = [], isLoading, isError, error, refetch } = useEventsQuery();
  const { deleteMutation, cloneMutation } = useEventMutations();

  const [duplicateSource, setDuplicateSource] = useState<EventTemplateDto | null>(null);
  const [duplicateName, setDuplicateName] = useState("");

  const openDuplicateModal = (event: EventTemplateDto) => {
    setDuplicateSource(event);
    setDuplicateName(`${event.name} (cópia)`);
  };
  const closeDuplicateModal = () => {
    setDuplicateSource(null);
    setDuplicateName("");
  };

  const duplicateNameError = useMemo(() => {
    if (!duplicateSource) return undefined;
    if (!duplicateName.trim()) return undefined;
    // Nome único por cidade (irmãos de família em outras cidades não contam).
    return isDuplicateName(
      duplicateName,
      events.filter((e) => e.city === duplicateSource.city),
    )
      ? "Já existe um evento com esse nome nesta cidade."
      : undefined;
  }, [duplicateName, events, duplicateSource]);

  // Duplicar = novo evento NA MESMA CIDADE (família própria, não vira aba).
  // Usa o clone do backend, que copia itens, todas as configs e as regras de
  // resumo — o duplicar antigo (montado no front) perdia parte disso.
  const handleConfirmDuplicate = () => {
    if (!duplicateSource) return;
    const trimmed = duplicateName.trim();
    if (!trimmed || duplicateNameError) return;
    cloneMutation.mutate(
      {
        id: String(duplicateSource.db_id ?? duplicateSource.id),
        data: { city: duplicateSource.city, name: trimmed, new_family: true },
      },
      { onSuccess: closeDuplicateModal },
    );
  };

  // Lista agrupada por FAMÍLIA (group_id): um evento = uma linha, com as
  // cidades em que existe. Abrir leva à aba da cidade representante.
  type EventFamily = {
    key: string;
    rep: EventTemplateDto;
    members: EventTemplateDto[];
    cities: string[];
  };

  const families = useMemo<EventFamily[]>(() => {
    const term = searchTerm.toLowerCase();
    const map = new Map<string, EventTemplateDto[]>();
    for (const ev of events) {
      const key = ev.group_id || `single-${ev.db_id ?? ev.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return Array.from(map.entries())
      .map(([key, members]) => {
        const sorted = [...members].sort((a, b) => a.city.localeCompare(b.city, "pt-BR"));
        const rep = sorted.find((m) => m.city === "Capital") ?? sorted[0];
        return { key, rep, members: sorted, cities: sorted.map((m) => m.city) };
      })
      .filter(
        (f) =>
          f.rep.name.toLowerCase().includes(term) ||
          f.cities.some((c) => c.toLowerCase().includes(term)) ||
          f.rep.type.toLowerCase().includes(term),
      )
      .sort((a, b) => a.rep.name.localeCompare(b.rep.name, "pt-BR"));
  }, [events, searchTerm]);

  const totalPages = Math.ceil(families.length / EVENTS_PER_PAGE);
  const paginatedFamilies = families.slice(
    (currentPage - 1) * EVENTS_PER_PAGE,
    currentPage * EVENTS_PER_PAGE,
  );

  const repId = (f: EventFamily) => String(f.rep.db_id ?? f.rep.id);

  // Excluir = remove o evento em TODAS as cidades da família.
  const handleDeleteFamily = (family: EventFamily) => {
    const where =
      family.cities.length > 1
        ? `em todas as cidades (${family.cities.join(", ")})`
        : `em ${family.cities[0]}`;
    if (confirm(`Excluir o evento "${family.rep.name}" ${where}?`)) {
      family.members.forEach((m) => deleteMutation.mutate(String(m.db_id ?? m.id)));
    }
  };

  const cityChips = (cities: string[]) => (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      {cities.map((c) => (
        <span
          key={c}
          className={styles.tableLocation}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "2px 8px",
            borderRadius: "999px",
            border: "1px solid var(--color-border)",
            fontSize: "12px",
          }}
        >
          <MapPin size={12} color="var(--color-text-secondary)" />
          {c}
        </span>
      ))}
    </div>
  );

  const columns = [
    { header: "Evento", accessor: (row: EventFamily) => row.rep.name },
    {
      header: "Cidades",
      accessor: (row: EventFamily) => cityChips(row.cities),
    },
    {
      header: "Tipo",
      accessor: (row: EventFamily) => (
        <StatusPill
          bg={row.rep.type === "Pago" ? "#dcfce7" : "#f1f5f9"}
          color={row.rep.type === "Pago" ? "#166534" : "#475569"}
        >
          {row.rep.type}
        </StatusPill>
      ),
    },
    {
      header: "Itens",
      accessor: (row: EventFamily) => (
        <span className={styles.tableMuted}>{row.rep.items?.length || 0} itens vinculados</span>
      ),
    },
    {
      header: "Ações",
      accessor: (row: EventFamily) => (
        <div className={styles.tableActions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Duplicar ${row.rep.name}`}
            title="Duplicar (mesma cidade)"
            onClick={(e) => {
              e.stopPropagation();
              openDuplicateModal(row.rep);
            }}
          >
            <Copy size={18} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            title="Editar"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/events/${repId(row)}`);
            }}
          >
            <Pencil size={18} />
          </button>
          <button
            type="button"
            className={clsx(styles.iconButton, styles.iconButtonDanger)}
            title="Excluir em todas as cidades"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteFamily(row);
            }}
          >
            <Trash2 size={18} />
          </button>
        </div>
      ),
      width: "150px",
    },
  ];

  if (isLoading) return <LoadingStatePanel message="Carregando eventos..." />;

  if (isError) {
    return (
      <ErrorStatePanel
        title="Erro ao carregar eventos"
        message={error instanceof Error ? error.message : "Tente novamente."}
        actions={<Button onClick={() => refetch()}>Tentar novamente</Button>}
      />
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Eventos Base</h1>
          <p className={styles.subtitle}>Defina os tipos de eventos globais e seus itens padrão.</p>
        </div>
        <Button leftIcon={<Plus size={18} />} onClick={() => navigate("/events/create")}>
          Novo Evento
        </Button>
      </header>

      <div className={styles.content}>
        <div className={styles.toolbar}>
          <Input
            wrapperClassName={styles.searchBox}
            placeholder="Pesquisar eventos..."
            leftIcon={<Search size={18} />}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        {families.length === 0 ? (
          <div className={styles.emptyState}>
            <p>Nenhum evento encontrado.</p>
          </div>
        ) : (
          <>
            <div className={styles.desktopTableOnly}>
              <Table
                data={paginatedFamilies}
                columns={columns}
                keyExtractor={(family) => family.key}
                onRowClick={(family) => navigate(`/events/${repId(family)}`)}
              />
            </div>

            <div className={styles.mobileCardsOnly}>
              <div className={styles.cardsGrid}>
                {paginatedFamilies.map((family) => (
                  <article key={family.key} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitleGroup}>
                        <h3 className={styles.cardTitle}>{family.rep.name}</h3>
                        <div className={styles.cardMetaRow}>{cityChips(family.cities)}</div>
                      </div>

                      <div className={styles.cardActions}>
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={`Duplicar ${family.rep.name}`}
                          title="Duplicar (mesma cidade)"
                          onClick={() => openDuplicateModal(family.rep)}
                        >
                          <Copy size={18} />
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={`Editar ${family.rep.name}`}
                          onClick={() => navigate(`/events/${repId(family)}`)}
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          type="button"
                          className={clsx(styles.iconButton, styles.iconButtonDanger)}
                          aria-label={`Excluir ${family.rep.name}`}
                          onClick={() => handleDeleteFamily(family)}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>

                    <div className={styles.metricGrid}>
                      <div className={styles.metricCard}>
                        <span className={styles.metricLabel}>Tipo</span>
                        <div>
                          <StatusPill
                            bg={family.rep.type === "Pago" ? "#dcfce7" : "#f1f5f9"}
                            color={family.rep.type === "Pago" ? "#166534" : "#475569"}
                          >
                            {family.rep.type}
                          </StatusPill>
                        </div>
                      </div>
                      <div className={styles.metricCard}>
                        <span className={styles.metricLabel}>Itens</span>
                        <span className={styles.metricValue}>{family.rep.items?.length || 0}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </>
        )}

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </div>

      {duplicateSource && (
        <ModalShell onBackdropClick={closeDuplicateModal} maxWidth="420px">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleConfirmDuplicate();
            }}
          >
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)" }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Duplicar nesta cidade</h3>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <p
                style={{
                  margin: "0 0 12px",
                  color: "var(--color-text-secondary)",
                  fontSize: 13,
                }}
              >
                Cria um <strong>novo evento em {duplicateSource.city}</strong>, copiando itens,
                configurações e regras de <strong>{duplicateSource.name}</strong>. Informe o novo
                nome.
                <br />
                <span style={{ fontSize: 12 }}>
                  Para usar o mesmo evento em outra cidade, abra o evento e use as abas de cidade.
                </span>
              </p>
              <Input
                label="Nome do novo evento"
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                autoFocus
                required
                error={duplicateNameError}
              />
            </div>
            <div
              style={{
                padding: "12px 20px",
                borderTop: "1px solid var(--color-border)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <Button variant="outline" type="button" onClick={closeDuplicateModal}>
                Cancelar
              </Button>
              <Button
                type="submit"
                isLoading={cloneMutation.isPending}
                disabled={Boolean(duplicateNameError) || !duplicateName.trim()}
              >
                Duplicar
              </Button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
}
