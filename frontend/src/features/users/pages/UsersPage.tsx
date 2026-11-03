import { useState } from "react";
import type { UserWriteDto } from "../../../services/api";
import {
  type AppUser,
  type UserRole,
  type UserPermissions,
  DEFAULT_PERMISSIONS,
} from "../../../store/userStore";
import { useAuthStore } from "../../../store/authStore";
import { Button } from "../../../components/Button/Button";
import {
  EmptyStatePanel,
  ErrorStatePanel,
  LoadingStatePanel,
} from "../../../components/AsyncState/AsyncState";
import { ModalShell } from "../../../components/ModalShell/ModalShell";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ShieldCheck, UserCircle } from "lucide-react";
import { useUsersQuery } from "../queries/useUsersQuery";
import {
  useCreateUserMutation,
  useDeleteUserMutation,
  useUpdateUserMutation,
} from "../mutations/useUserMutations";
import styles from "../styles/UsersPage.module.css";

const ROLE_LABELS: Record<UserRole, string> = {
  ADM_MASTER: "Master",
  ADM_GERENTE: "Coordenador",
  ADM_ORCAMENTO: "Orçamento",
  ADM_ANALISTA_ORCAMENTO: "Analista Orçamento",
};

const ROLE_COLORS: Record<UserRole, { bg: string; text: string }> = {
  ADM_MASTER: { bg: "#fef3c7", text: "#92400e" },
  ADM_GERENTE: { bg: "#dbeafe", text: "#1e40af" },
  ADM_ORCAMENTO: { bg: "#dcfce7", text: "#166534" },
  ADM_ANALISTA_ORCAMENTO: { bg: "#ede9fe", text: "#6d28d9" },
};

const PERMISSION_LABELS: {
  key: keyof UserPermissions;
  label: string;
  description: string;
}[] = [
  {
    key: "viewDashboard",
    label: "Ver Dashboard",
    description: "Acesso à tela de Dashboard",
  },
  {
    key: "viewLogs",
    label: "Ver Logs",
    description: "Acesso à tela de Logs do sistema",
  },
  {
    key: "createBudget",
    label: "Criar Orçamento",
    description: "Permite criar novos orçamentos",
  },
  {
    key: "editBudget",
    label: "Editar Orçamento (Direto)",
    description: "Pode editar orçamentos sem aprovação",
  },
  {
    key: "deleteBudget",
    label: "Excluir Orçamento",
    description: "Pode excluir orçamentos permanentemente",
  },
  {
    key: "approveDiscounts",
    label: "Aprovar Descontos",
    description: "Pode aprovar ou rejeitar solicitações de desconto",
  },
  {
    key: "approveEditRequests",
    label: "Aprovar Edições",
    description:
      "Pode aprovar ou rejeitar solicitações de edição de orçamentos",
  },
  {
    key: "manageUsers",
    label: "Gerenciar Usuários",
    description: "Pode criar, editar e excluir usuários",
  },
];

function generateLogin(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(
    { length: 6 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

const emptyPermissions = (): UserPermissions => ({
  viewDashboard: false,
  viewLogs: false,
  createBudget: false,
  editBudget: false,
  deleteBudget: false,
  viewAllBudgets: false,
  approveDiscounts: false,
  approveEditRequests: false,
  manageUsers: false,
});

type ModalMode = "create" | "edit" | null;

export function UsersPage() {
  const { user: currentUser } = useAuthStore();
  const {
    data: users = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useUsersQuery();
  const createUserMutation = useCreateUserMutation();
  const updateUserMutation = useUpdateUserMutation();
  const deleteUserMutation = useDeleteUserMutation();
  const canManageUsers =
    currentUser?.role === "ADM_MASTER" ||
    currentUser?.perm_manage_users === true;

  const [modal, setModal] = useState<{ mode: ModalMode; user: AppUser | null }>(
    { mode: null, user: null },
  );
  const [form, setForm] = useState({
    name: "",
    login: "",
    password: "",
    role: "ADM_ORCAMENTO" as UserRole,
    permissions: emptyPermissions(),
    active: true,
  });

  const openCreate = () => {
    const defaultRole: UserRole = "ADM_ORCAMENTO";
    setForm({
      name: "",
      login: generateLogin(),
      password: "",
      role: defaultRole,
      permissions: { ...DEFAULT_PERMISSIONS[defaultRole] },
      active: true,
    });
    setModal({ mode: "create", user: null });
  };

  const openEdit = (u: AppUser) => {
    setForm({
      name: u.name,
      login: u.login,
      password: "",
      role: u.role,
      permissions: { ...u.permissions },
      active: u.active,
    });
    setModal({ mode: "edit", user: u });
  };

  const handleRoleChange = (role: UserRole) => {
    setForm((prev) => ({
      ...prev,
      role,
      permissions: { ...DEFAULT_PERMISSIONS[role] },
    }));
  };

  const handlePermissionToggle = (key: keyof UserPermissions) => {
    if (form.role === "ADM_ANALISTA_ORCAMENTO") return;
    setForm((prev) => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: !prev.permissions[key] },
    }));
  };
  const isFixedAnalystRole = form.role === "ADM_ANALISTA_ORCAMENTO";

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Informe o nome do usuário.");
      return;
    }
    if (!form.login.trim()) {
      toast.error("Informe o login.");
      return;
    }
    if (modal.mode === "create" && !form.password.trim()) {
      toast.error("Informe a senha.");
      return;
    }

    if (modal.mode === "create") {
      const existingInQuery = users.find((user) => user.login === form.login);
      if (existingInQuery) {
        toast.error("Este login já está em uso.");
        return;
      }

      const payload: UserWriteDto = {
        name: form.name.trim(),
        login: form.login.trim(),
        password: form.password,
        role: form.role,
        permissions: form.permissions,
        active: form.active,
      };
      createUserMutation.mutate(payload);
    } else if (modal.mode === "edit" && modal.user) {
      const payload: UserWriteDto = {
        name: form.name.trim(),
        login: form.login.trim(),
        ...(form.password.trim() ? { password: form.password } : {}),
        role: form.role,
        permissions: form.permissions,
        active: form.active,
      };
      updateUserMutation.mutate({ id: modal.user.id, data: payload });
    }
    setModal({ mode: null, user: null });
  };

  const handleDelete = (u: AppUser) => {
    if (u.id === "master-1") {
      toast.error("O usuário Master padrão não pode ser excluído.");
      return;
    }
    if (
      confirm(`Excluir o usuário "${u.name}"? Esta ação não pode ser desfeita.`)
    ) {
      deleteUserMutation.mutate(u.id);
      toast.success("Usuário excluído.");
    }
  };

  return (
    <div
      className={styles.page}
      style={{ }}
    >
      {/* Header */}
      <header
        className={styles.header}
        style={{ marginBottom: "2rem" }}
      >
        <div>
          <h1
            className={styles.title}
            style={{
              fontSize: "1.875rem",
              fontWeight: "700",
              color: "var(--color-text-main)",
              marginBottom: "4px",
            }}
          >
            Usuários
          </h1>
          <p style={{ color: "var(--color-text-secondary)" }}>
            Gerencie os acessos e permissões do sistema
          </p>
        </div>
        {canManageUsers && (
          <Button
            className={styles.headerAction}
            onClick={openCreate}
            leftIcon={<Plus size={18} />}
          >
            Novo Usuário
          </Button>
        )}
      </header>

      {/* Lista */}
      {isLoading && <LoadingStatePanel message="Carregando usuários..." />}

      {isError && (
        <ErrorStatePanel
          title="Erro ao carregar usuários"
          message={error instanceof Error ? error.message : "Tente novamente."}
          actions={
            <Button variant="outline" onClick={() => void refetch()}>
              Tentar novamente
            </Button>
          }
        />
      )}

      {!isLoading && !isError && users.length === 0 && (
        <EmptyStatePanel message="Nenhum usuário cadastrado." />
      )}

      <div className={styles.list} style={{ gap: "1rem" }}>
        {users.map((u) => {
          const roleColor = ROLE_COLORS[u.role];
          return (
            <div
              key={u.id}
              className={styles.userCard}
              style={{
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "12px",
                padding: "1.25rem 1.5rem",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              {/* Avatar */}
              <div
                className={styles.avatar}
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  backgroundColor: roleColor.bg,
                  color: roleColor.text,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: "bold",
                  fontSize: "1.25rem",
                  flexShrink: 0,
                }}
              >
                {u.name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div className={styles.userInfo} style={{ flex: 1, minWidth: 0 }}>
                <div
                  className={styles.userTitleRow}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "2px",
                  }}
                >
                  <span
                    className={styles.userName}
                    style={{
                      fontWeight: "600",
                      fontSize: "1rem",
                      color: "var(--color-text-main)",
                    }}
                  >
                    {u.name}
                  </span>
                  <StatusPill bg={roleColor.bg} color={roleColor.text}>
                    {ROLE_LABELS[u.role]}
                  </StatusPill>
                  {!u.active && (
                    <StatusPill bg="#fee2e2" color="#dc2626">
                      Inativo
                    </StatusPill>
                  )}
                </div>
                <div
                  className={styles.userMetaRow}
                  style={{
                    display: "flex",
                    gap: "16px",
                    fontSize: "0.8rem",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <span>
                    Login:{" "}
                    <strong style={{ color: "var(--color-text-main)" }}>
                      {u.login}
                    </strong>
                  </span>
                  <span>
                    Criado em{" "}
                    {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                {/* Permissões resumidas */}
                <div
                  className={styles.permissionPills}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "4px",
                    marginTop: "6px",
                  }}
                >
                  {PERMISSION_LABELS.filter((p) => u.permissions[p.key]).map(
                    (p) => (
                      <span
                        key={p.key}
                        style={{
                          fontSize: "0.65rem",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          backgroundColor: "var(--color-background)",
                          border: "1px solid var(--color-border)",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {p.label}
                      </span>
                    ),
                  )}
                </div>
              </div>

              {/* Actions */}
              {canManageUsers && (
                <div
                  className={styles.cardActions}
                  style={{ display: "flex", gap: "8px", flexShrink: 0 }}
                >
                  <button
                    onClick={() => openEdit(u)}
                    title="Editar"
                    style={{
                      padding: "8px",
                      borderRadius: "8px",
                      border: "1px solid var(--color-border)",
                      backgroundColor: "transparent",
                      cursor: "pointer",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(u)}
                    title="Excluir"
                    style={{
                      padding: "8px",
                      borderRadius: "8px",
                      border: "1px solid #fecaca",
                      backgroundColor: "#fee2e2",
                      cursor: "pointer",
                      color: "#ef4444",
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal Criar/Editar */}
      {modal.mode && (
        <ModalShell
          zIndex={100}
          maxWidth="600px"
          panelStyle={{
            maxHeight: "90vh",
            overflow: "auto",
            borderRadius: "16px",
          }}
        >
          {/* Modal Header */}
          <div
            className={styles.modalHeader}
            style={{
              padding: "24px 24px 0",
              borderBottom: "1px solid var(--color-border)",
              paddingBottom: "16px",
              marginBottom: "0",
            }}
          >
            <div
              className={styles.modalHeaderRow}
              style={{ display: "flex", alignItems: "center", gap: "10px" }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  backgroundColor: "#dbeafe",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {modal.mode === "create" ? (
                  <UserCircle size={20} color="#1e40af" />
                ) : (
                  <ShieldCheck size={20} color="#1e40af" />
                )}
              </div>
              <h2
                style={{
                  fontSize: "1.25rem",
                  fontWeight: "700",
                  color: "var(--color-text-main)",
                }}
              >
                {modal.mode === "create" ? "Novo Usuário" : "Editar Usuário"}
              </h2>
            </div>
          </div>

          <div className={styles.modalBody} style={{ padding: "24px" }}>
            {/* Nome */}
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  marginBottom: "6px",
                }}
              >
                Nome Completo
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="Ex: João Silva"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  backgroundColor: "var(--color-background)",
                  color: "var(--color-text-main)",
                  fontSize: "14px",
                }}
              />
            </div>

            {/* Login + Gerar */}
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  marginBottom: "6px",
                }}
              >
                Login
              </label>
              <div
                className={styles.loginRow}
                style={{ display: "flex", gap: "8px" }}
              >
                <input
                  type="text"
                  value={form.login}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      login: e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]/g, "")
                        .slice(0, 6),
                    }))
                  }
                  maxLength={6}
                  placeholder="6 dígitos alfanuméricos"
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    backgroundColor: "var(--color-background)",
                    color: "var(--color-text-main)",
                    fontSize: "14px",
                    fontFamily: "monospace",
                    letterSpacing: "2px",
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    setForm((p) => ({ ...p, login: generateLogin() }))
                  }
                  style={{ whiteSpace: "nowrap" }}
                >
                  Gerar Aleatório
                </Button>
              </div>
              <p
                style={{
                  fontSize: "11px",
                  color: "var(--color-text-secondary)",
                  marginTop: "4px",
                }}
              >
                Apenas letras minúsculas e números, máximo 6 caracteres
              </p>
            </div>

            {/* Senha */}
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  marginBottom: "6px",
                }}
              >
                Senha
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm((p) => ({ ...p, password: e.target.value }))
                }
                placeholder={
                  modal.mode === "edit"
                    ? "Deixe em branco para manter"
                    : "Digite a senha"
                }
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  backgroundColor: "var(--color-background)",
                  color: "var(--color-text-main)",
                  fontSize: "14px",
                }}
              />
            </div>

            {/* Role */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  marginBottom: "8px",
                }}
              >
                Credencial
              </label>
              <div
                className={styles.roleRow}
                style={{ display: "flex", gap: "8px" }}
              >
                {(
                  ["ADM_MASTER", "ADM_GERENTE", "ADM_ORCAMENTO", "ADM_ANALISTA_ORCAMENTO"] as UserRole[]
                ).map((role) => {
                  const rc = ROLE_COLORS[role];
                  const isSelected = form.role === role;
                  return (
                    <button
                      key={role}
                      onClick={() => handleRoleChange(role)}
                      style={{
                        flex: 1,
                        padding: "10px 8px",
                        borderRadius: "8px",
                        cursor: "pointer",
                        border: isSelected
                          ? `2px solid ${rc.text}`
                          : "2px solid var(--color-border)",
                        backgroundColor: isSelected ? rc.bg : "transparent",
                        color: isSelected
                          ? rc.text
                          : "var(--color-text-secondary)",
                        fontWeight: isSelected ? "700" : "500",
                        fontSize: "13px",
                        transition: "all 0.15s",
                      }}
                    >
                      {ROLE_LABELS[role]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Status Ativo */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, active: e.target.checked }))
                  }
                  style={{ width: "16px", height: "16px" }}
                />
                <span style={{ fontSize: "14px", fontWeight: "500" }}>
                  Usuário ativo
                </span>
              </label>
            </div>

            {/* Permissões */}
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  marginBottom: "12px",
                  color: "var(--color-text-main)",
                }}
              >
                Permissões
              </label>
              {isFixedAnalystRole && (
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--color-text-secondary)",
                    marginBottom: "10px",
                  }}
                >
                  Perfil fixo: visualiza todos os orçamentos em modo somente leitura.
                </p>
              )}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: "8px",
                }}
              >
                {PERMISSION_LABELS.map(({ key, label, description }) => (
                  <label
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      cursor: "pointer",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      backgroundColor: form.permissions[key]
                        ? "#f0fdf4"
                        : "var(--color-background)",
                      border: `1px solid ${form.permissions[key] ? "#86efac" : "var(--color-border)"}`,
                      transition: "all 0.15s",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.permissions[key]}
                      onChange={() => handlePermissionToggle(key)}
                      disabled={isFixedAnalystRole}
                      style={{
                        marginTop: "2px",
                        width: "15px",
                        height: "15px",
                        cursor: isFixedAnalystRole ? "not-allowed" : "pointer",
                      }}
                    />
                    <div>
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: "600",
                          color: "var(--color-text-main)",
                        }}
                      >
                        {label}
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div
              className={styles.modalActions}
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <Button
                variant="outline"
                onClick={() => setModal({ mode: null, user: null })}
              >
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                {modal.mode === "create"
                  ? "Criar Usuário"
                  : "Salvar Alterações"}
              </Button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
