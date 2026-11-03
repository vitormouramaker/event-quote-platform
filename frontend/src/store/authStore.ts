import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi } from "../services/api";
import { toast } from "sonner";

export type UserRole =
  | "ADM_MASTER"
  | "ADM_GERENTE"
  | "ADM_ORCAMENTO"
  | "ADM_ANALISTA_ORCAMENTO";

export interface AuthUser {
  id: string;
  name: string;
  login: string;
  role: UserRole;
  // Permissões granulares vindas do banco
  perm_create_budget: boolean;
  perm_edit_budget: boolean;
  perm_delete_budget: boolean;
  perm_view_all_budgets: boolean;
  perm_approve_discounts: boolean;
  perm_approve_edit_requests: boolean;
  perm_manage_users: boolean;
  perm_view_dashboard: boolean;
  perm_view_logs: boolean;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  // Ação de login chamando a API
  login: (login: string, password: string) => Promise<boolean>;
  logout: () => void;
  // Compatibilidade com código legado que chama login(user)
  setUser: (user: AuthUser) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (login: string, password: string): Promise<boolean> => {
        set({ isLoading: true });
        try {
          const response = await authApi.login(login, password);
          if (!response.ok) {
            set({ isLoading: false });
            toast.error(response.message || "Login ou senha incorretos");
            return false;
          }
          const { token, ...userData } = response.data;
          set({
            user: userData as AuthUser,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
          return true;
        } catch (err) {
          console.error("Erro ao fazer login:", err);
          toast.error("Não foi possível conectar ao servidor. Verifique se o backend está rodando.");
          set({ isLoading: false });
          return false;
        }
      },

      logout: () => {
        void authApi.logout().catch(() => undefined);
        set({ user: null, token: null, isAuthenticated: false });
      },

      setUser: (user: AuthUser) => set({ user, isAuthenticated: true }),
    }),
    {
      name: "auth-storage",
      // Persistir apenas token e user (não isLoading)
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
