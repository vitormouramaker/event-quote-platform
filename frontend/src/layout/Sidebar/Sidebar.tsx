import { NavLink } from "react-router-dom";
import clsx from "clsx";
import {
  LayoutDashboard,
  FileText,
  Users,
  ScrollText,
  LogOut,
  CheckCircle,
  X,
  Package,
  Calendar,
  Building2,
  MapPin,
  RefreshCw,
  BadgePercent,
  FileSignature,
  FileSpreadsheet,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { forceAppRefresh } from "../../lib/appUpdate";
import { usePendingApprovalsCount } from "../../features/budgets/queries/usePendingApprovalsCount";
import styles from "./Sidebar.module.css";

type SidebarProps = {
  isOpen?: boolean;
  onClose?: () => void;
};

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const { logout, user } = useAuthStore();
  const { total: pendingApprovalsCount } = usePendingApprovalsCount();

  const isAdminByRole =
    user?.role === "ADM_MASTER" || user?.role === "ADM_GERENTE";
  // Aprovações fica visível para quem aprova (admin/gerente ou flags de
  // aprovação) e também para quem gera solicitações próprias — orçamento.
  // Gate por permissão (não só pela string do role) para não depender de
  // como o backend devolve `role` no login.
  const canViewApprovals =
    isAdminByRole ||
    user?.role === "ADM_ORCAMENTO" ||
    user?.perm_approve_discounts === true ||
    user?.perm_approve_edit_requests === true ||
    user?.perm_create_budget === true ||
    user?.perm_edit_budget === true;

  const navItems = [
    {
      to: "/dashboard",
      icon: LayoutDashboard,
      label: "Dashboard",
      visible: isAdminByRole || user?.perm_view_dashboard === true,
      end: true,
    },
    {
      to: "/budgets",
      icon: FileText,
      label: "Orçamentos",
      visible: true,
      end: true,
    },
    {
      to: "/budgets/approvals",
      icon: CheckCircle,
      label: "Aprovações",
      visible: canViewApprovals,
      end: false,
    },
    {
      to: "/venue-proposals",
      icon: Building2,
      label: "Propostas de Locação",
      visible:
        isAdminByRole ||
        user?.role === "ADM_ORCAMENTO" ||
        user?.perm_create_budget === true,
      end: false,
    },
    {
      to: "/commissions",
      icon: BadgePercent,
      label: "Comissões",
      visible: isAdminByRole,
      end: false,
    },
    {
      to: "/annexes",
      icon: FileSpreadsheet,
      label: "Anexos Contratuais",
      visible: isAdminByRole,
      end: false,
    },
    {
      to: "/contracts",
      icon: FileSignature,
      label: "Contratos",
      visible:
        isAdminByRole ||
        user?.role === "ADM_ORCAMENTO" ||
        user?.perm_create_budget === true,
      end: false,
    },
    {
      to: "/items",
      icon: Package,
      label: "Itens Base",
      visible: isAdminByRole,
      end: false,
    },
    {
      to: "/events",
      icon: Calendar,
      label: "Eventos Base",
      visible: isAdminByRole,
      end: false,
    },
    {
      to: "/auditoriums",
      icon: Building2,
      label: "Auditórios",
      visible: isAdminByRole,
      end: false,
    },
    {
      to: "/cities",
      icon: MapPin,
      label: "Cidades",
      visible: isAdminByRole,
      end: false,
    },
    {
      to: "/users",
      icon: Users,
      label: "Usuários",
      visible: isAdminByRole || user?.perm_manage_users === true,
      end: false,
    },
    {
      to: "/logs",
      icon: ScrollText,
      label: "Logs",
      visible: isAdminByRole || user?.perm_view_logs === true,
      end: false,
    },
    // { to: "/notifications", icon: Bell, label: "Notificações", visible: true, end: false },
  ];

  return (
    <aside
      className={clsx(styles.sidebar, isOpen && styles.open)}
      aria-hidden={!isOpen ? undefined : false}
    >
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <div className={styles.logo}>Orça Eventos</div>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Fechar menu"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {/* <div className={styles.subtitle}>Gerenciador</div> */}
      </div>

      <nav className={styles.nav}>
        {navItems.map((item) => {
          if (!item.visible) return null;

          const badge =
            item.to === "/budgets/approvals" && pendingApprovalsCount > 0
              ? pendingApprovalsCount
              : undefined;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(styles.navItem, isActive && styles.active)
              }
              onClick={onClose}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
              {badge !== undefined && (
                <span className={styles.navBadge}>
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className={styles.footer}>
        <button
          onClick={() => void forceAppRefresh()}
          className={styles.navItem}
          title="Recarrega o app na versão mais recente"
        >
          <RefreshCw size={20} />
          <span>Forçar atualização</span>
        </button>
        <button
          onClick={logout}
          className={clsx(styles.navItem, styles.logout)}
        >
          <LogOut size={20} />
          <span>Sair</span>
        </button>

        <div className={styles.userInfo}>
          <div className={styles.userAvatar}>
            {user?.name?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className={styles.userDetails}>
            <span className={styles.userName}>{user?.name}</span>
            <span className={styles.userRole}>
              {user?.role === "ADM_MASTER"
                ? "Master"
                : user?.role === "ADM_GERENTE"
                  ? "Coordenador"
                  : user?.role === "ADM_ANALISTA_ORCAMENTO"
                    ? "Analista Orçamento"
                    : "Orçamentos"}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
