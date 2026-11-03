import { create } from "zustand";
import { usersApi } from "../services/api";
import type { UserRowDto, UserRoleDto, UserWriteDto } from "../services/api";
import { toast } from "sonner";
import { fixMojibakeText } from "../utils/textEncoding";

export type UserRole = UserRoleDto;

export interface UserPermissions {
  createBudget: boolean;
  editBudget: boolean;
  deleteBudget: boolean;
  viewAllBudgets: boolean;
  approveDiscounts: boolean;
  approveEditRequests: boolean;
  manageUsers: boolean;
  viewDashboard: boolean;
  viewLogs: boolean;
}

export interface AppUser {
  id: string;
  name: string;
  login: string;
  password: string;
  role: UserRole;
  permissions: UserPermissions;
  createdAt: string;
  active: boolean;
}

export const DEFAULT_PERMISSIONS: Record<UserRole, UserPermissions> = {
  ADM_MASTER: {
    createBudget: true, editBudget: true, deleteBudget: true,
    viewAllBudgets: true, approveDiscounts: true,
    approveEditRequests: true, manageUsers: true,
    viewDashboard: true, viewLogs: true,
  },
  ADM_GERENTE: {
    createBudget: true, editBudget: true, deleteBudget: false,
    viewAllBudgets: true, approveDiscounts: true,
    approveEditRequests: true, manageUsers: false,
    viewDashboard: true, viewLogs: true,
  },
  ADM_ORCAMENTO: {
    createBudget: true, editBudget: false, deleteBudget: false,
    viewAllBudgets: false, approveDiscounts: false,
    approveEditRequests: false, manageUsers: false,
    viewDashboard: false, viewLogs: false,
  },
  ADM_ANALISTA_ORCAMENTO: {
    createBudget: false, editBudget: false, deleteBudget: false,
    viewAllBudgets: true, approveDiscounts: false,
    approveEditRequests: false, manageUsers: false,
    viewDashboard: false, viewLogs: false,
  },
};

// Mapeia snake_case do banco para AppUser
export function mapUser(row: UserRowDto): AppUser {
  return {
    id: row.id,
    name: fixMojibakeText(row.name),
    login: row.login,
    password: "******",
    role: row.role as UserRole,
    permissions: {
      createBudget:         row.perm_create_budget,
      editBudget:           row.perm_edit_budget,
      deleteBudget:         row.perm_delete_budget,
      viewAllBudgets:       row.perm_view_all_budgets,
      approveDiscounts:     row.perm_approve_discounts,
      approveEditRequests:  row.perm_approve_edit_requests,
      manageUsers:          row.perm_manage_users,
      viewDashboard:        row.perm_view_dashboard ?? false,
      viewLogs:             row.perm_view_logs ?? false,
    },
    createdAt: row.created_at,
    active: row.active,
  };
}

interface UserState {
  users: AppUser[];
  isLoading: boolean;
  fetchUsers: () => Promise<void>;
  addUser: (user: Omit<AppUser, "id" | "createdAt"> & { password: string }) => Promise<void>;
  updateUser: (id: string, updates: Partial<AppUser> & { password?: string }) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  getUserById: (id: string) => AppUser | undefined;
  getUserByLogin: (login: string) => AppUser | undefined;
}

export const useUserStore = create<UserState>((set, get) => ({
  users: [],
  isLoading: false,

  fetchUsers: async () => {
    set({ isLoading: true });
    try {
      const res = await usersApi.getAll();
      if (res.ok) {
        set({ users: (res.data ?? []).map(mapUser) });
      }
    } catch (err) {
      console.error("fetchUsers:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  addUser: async (data) => {
    try {
      const payload: UserWriteDto = {
        name: data.name,
        login: data.login,
        password: data.password,
        role: data.role,
        active: data.active ?? true,
        permissions: data.permissions,
      };
      const res = await usersApi.create(payload);
      if (res.ok) {
        await get().fetchUsers();
        toast.success("Usuário criado com sucesso!");
      } else {
        toast.error(res.message || "Erro ao criar usuário");
      }
    } catch (err) {
      console.error("addUser:", err);
      toast.error("Erro ao criar usuário");
    }
  },

  updateUser: async (id, data) => {
    try {
      const payload: UserWriteDto = {
        name: data.name,
        login: data.login,
        password: data.password ?? "",
        role: data.role,
        active: data.active ?? true,
        permissions: data.permissions,
      };
      const res = await usersApi.update(id, payload);
      if (res.ok) {
        await get().fetchUsers();
        toast.success("Usuário atualizado!");
      } else {
        toast.error(res.message || "Erro ao atualizar usuário");
      }
    } catch (err) {
      console.error("updateUser:", err);
      toast.error("Erro ao atualizar usuário");
    }
  },

  deleteUser: async (id) => {
    try {
      const res = await usersApi.remove(id);
      if (res.ok) {
        set((state) => ({ users: state.users.filter((u) => u.id !== id) }));
        toast.success("Usuário excluído!");
      } else {
        toast.error(res.message || "Erro ao excluir usuário");
      }
    } catch (err) {
      console.error("deleteUser:", err);
      toast.error("Erro ao excluir usuário");
    }
  },

  getUserById: (id) => get().users.find((u) => u.id === id),
  getUserByLogin: (login) => get().users.find((u) => u.login === login),
}));
