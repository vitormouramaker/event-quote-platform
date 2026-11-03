import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "../../../components/Button/Button";
import { Input } from "../../../components/Input/Input";
import { CurrencyInput } from "../../../components/CurrencyInput/CurrencyInput";
import { Toggle } from "../../../components/Toggle/Toggle";
import { useCitiesQuery } from "../../cities/queries/useCitiesQuery";
import { useAuditoriumsQuery } from "../queries/useAuditoriumsQuery";
import { useAuditoriumMutations } from "../mutations/useAuditoriumMutations";

type AuditoriumFormValues = {
  name: string;
  slug: string;
  price: number;
  allow_budget_edit: boolean;
  // "" = disponivel em todas as cidades.
  city: string;
};

function toSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function CreateAuditoriumPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: auditoriums = [] } = useAuditoriumsQuery();
  const { data: cities = [] } = useCitiesQuery();
  const { createMutation, updateMutation } = useAuditoriumMutations();

  const editing = id ? auditoriums.find((a) => a.id === id) : undefined;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    setValue,
    formState: { errors },
  } = useForm<AuditoriumFormValues>({
    defaultValues: { name: "", slug: "", price: 0, allow_budget_edit: false, city: "" },
  });

  useEffect(() => {
    if (editing) {
      reset({
        name: editing.name,
        slug: editing.slug,
        price: editing.price,
        allow_budget_edit: Boolean(editing.allow_budget_edit),
        city: editing.city ?? "",
      });
    }
  }, [editing, reset]);

  const nameValue = watch("name");
  useEffect(() => {
    // Slug automático apenas na criação (não sobrescreve slug de auditório existente).
    if (!id) setValue("slug", toSlug(nameValue || ""));
  }, [nameValue, id, setValue]);

  const onSubmit = (data: AuditoriumFormValues) => {
    const payload = {
      name: data.name.trim(),
      slug: data.slug.trim(),
      price: Number(data.price) || 0,
      allow_budget_edit: Boolean(data.allow_budget_edit),
      city: data.city.trim() ? data.city.trim() : null,
    };
    if (id) {
      updateMutation.mutate(
        { id, data: payload },
        { onSuccess: () => navigate("/auditoriums") },
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => navigate("/auditoriums"),
      });
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div style={{ padding: "2rem", width: "100%" }}>
      <button
        type="button"
        onClick={() => navigate("/auditoriums")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          background: "none",
          border: "none",
          color: "var(--color-text-secondary)",
          cursor: "pointer",
          fontSize: "14px",
          padding: 0,
          marginBottom: "1rem",
        }}
      >
        <ArrowLeft size={16} /> Voltar para lista
      </button>
      <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        {id ? "Editar Auditório" : "Novo Auditório"}
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: "grid", gap: "1.5rem" }}>
        <section
          style={{
            backgroundColor: "var(--color-surface)",
            padding: "2rem",
            borderRadius: "12px",
            border: "1px solid var(--color-border)",
            display: "grid",
            gap: "1.25rem",
          }}
        >
          <Input
            label="Nome do Auditório"
            placeholder="Ex: Platina"
            error={errors.name?.message}
            {...register("name", { required: "Nome é obrigatório" })}
          />
          <Input
            label="Slug"
            placeholder="ex: platina"
            error={errors.slug?.message}
            {...register("slug", { required: "Slug é obrigatório" })}
          />
          <Controller
            name="price"
            control={control}
            render={({ field }) => (
              <CurrencyInput
                label="Valor (R$)"
                value={Number(field.value) || 0}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.price?.message}
              />
            )}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "14px", fontWeight: 500 }} htmlFor="auditorium-city">
              Cidade
            </label>
            <select
              id="auditorium-city"
              {...register("city")}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                backgroundColor: "var(--color-background)",
                color: "var(--color-text-main)",
              }}
            >
              <option value="">Todas as cidades</option>
              {cities.map((city) => (
                <option key={city.id} value={city.name}>
                  {city.name}
                </option>
              ))}
            </select>
            <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
              O auditório só aparece nos orçamentos desta cidade. "Todas as cidades"
              deixa disponível em qualquer orçamento.
            </span>
          </div>

          <Toggle
            label="Permite edição no orçamento"
            hint="Quando ativo, o consultor pode editar o valor deste auditório ao criar/editar um orçamento. Desativado, o valor fica fixo (o cadastrado aqui)."
            {...register("allow_budget_edit")}
          />
        </section>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
          <Button
            variant="outline"
            type="button"
            onClick={() => navigate("/auditoriums")}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="submit" leftIcon={<Save size={18} />} isLoading={saving}>
            {id ? "Salvar Alterações" : "Criar Auditório"}
          </Button>
        </div>
      </form>
    </div>
  );
}
