import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { LoginPage } from "./features/auth/pages/LoginPage";
import { MainLayout } from "./layout/MainLayout";
import { BudgetsDashboard } from "./features/budgets/pages/BudgetsDashboard";
import { DashboardPage } from "./features/dashboard/pages/DashboardPage";
import { CommissionsPage } from "./features/commissions/pages/CommissionsPage";
import { ContractsPage } from "./features/contracts/pages/ContractsPage";
import { CreateContractPage } from "./features/contracts/pages/CreateContractPage";
import { AnnexesPage } from "./features/annexes/pages/AnnexesPage";
import { AnnexDetailPage } from "./features/annexes/pages/AnnexDetailPage";
import { useAuthStore } from "./store/authStore";
import { CreateBudgetPage } from "./features/budgets/pages/CreateBudgetPage";
import { DiscountApprovalsPage } from "./features/budgets/pages/DiscountApprovalsPage";
import { UsersPage } from "./features/users/pages/UsersPage";
import { LogsPage } from "./features/logs/pages/LogsPage";
import { ItemsPage } from "./features/items/pages/ItemsPage";
import { CreateItemPage } from "./features/items/pages/CreateItemPage";
import { EventsPage } from "./features/events/pages/EventsPage";
import { CreateEventPage } from "./features/events/pages/CreateEventPage";
import { AuditoriumsPage } from "./features/auditoriums/pages/AuditoriumsPage";
import { CreateAuditoriumPage } from "./features/auditoriums/pages/CreateAuditoriumPage";
import { CitiesPage } from "./features/cities/pages/CitiesPage";
import { DemonstrativoPage } from "./features/budgets/pages/DemonstrativoPage";
import { VenueProposalsPage } from "./features/venueProposals/pages/VenueProposalsPage";
import { CreateVenueProposalPage } from "./features/venueProposals/pages/CreateVenueProposalPage";
import { VenueSettingsPage } from "./features/venueProposals/pages/VenueSettingsPage";

const PrivateRoute = () => {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

const RootRedirect = () => {
  const { user } = useAuthStore();
  const canViewDashboard = user?.role === "ADM_MASTER" || user?.role === "ADM_GERENTE" || user?.perm_view_dashboard === true;
  return <Navigate to={canViewDashboard ? "/dashboard" : "/budgets"} replace />;
};

const DashboardRoute = () => {
  const { user } = useAuthStore();
  const allowed = user?.role === "ADM_MASTER" || user?.role === "ADM_GERENTE" || user?.perm_view_dashboard === true;
  return allowed ? <Outlet /> : <Navigate to="/budgets" replace />;
};

const CommissionsRoute = () => {
  const { user } = useAuthStore();
  // Só administradores veem comissionamento (consultor não recebe nada).
  const allowed = user?.role === "ADM_MASTER" || user?.role === "ADM_GERENTE";
  return allowed ? <Outlet /> : <Navigate to="/budgets" replace />;
};

const AnnexesRoute = () => {
  const { user } = useAuthStore();
  // Anexo contratual e exclusivo de administradores.
  const allowed = user?.role === "ADM_MASTER" || user?.role === "ADM_GERENTE";
  return allowed ? <Outlet /> : <Navigate to="/budgets" replace />;
};

const ContractsRoute = () => {
  const { user } = useAuthStore();
  // Contratos: admin e consultor (quem fecha orçamento). Analista não gera.
  const allowed =
    user?.role === "ADM_MASTER" ||
    user?.role === "ADM_GERENTE" ||
    user?.role === "ADM_ORCAMENTO" ||
    user?.perm_create_budget === true;
  return allowed ? <Outlet /> : <Navigate to="/budgets" replace />;
};

const LogsRoute = () => {
  const { user } = useAuthStore();
  const allowed = user?.role === "ADM_MASTER" || user?.role === "ADM_GERENTE" || user?.perm_view_logs === true;
  return allowed ? <Outlet /> : <Navigate to="/budgets" replace />;
};

const ApprovalsRoute = () => {
  const { user } = useAuthStore();
  // Gate por permissão além do role: quem cria/edita orçamento gera
  // solicitações próprias e precisa acompanhá-las em Aprovações.
  const allowed =
    user?.role === "ADM_MASTER" ||
    user?.role === "ADM_GERENTE" ||
    user?.role === "ADM_ORCAMENTO" ||
    user?.perm_approve_discounts === true ||
    user?.perm_approve_edit_requests === true ||
    user?.perm_create_budget === true ||
    user?.perm_edit_budget === true;
  return allowed ? <Outlet /> : <Navigate to="/budgets" replace />;
};

const UsersRoute = () => {
  const { user } = useAuthStore();
  const allowed = user?.role === "ADM_MASTER" || user?.perm_manage_users === true;
  return allowed ? <Outlet /> : <Navigate to="/budgets" replace />;
};

const BaseCatalogRoute = () => {
  const { user } = useAuthStore();
  const allowed = user?.role === "ADM_MASTER" || user?.role === "ADM_GERENTE";
  return allowed ? <Outlet /> : <Navigate to="/budgets" replace />;
};

// Proposta de locacao do Aurora Hall: quem monta orcamento monta proposta.
// O analista so analisa orcamento de formatura, nao entra aqui.
const VenueProposalsRoute = () => {
  const { user } = useAuthStore();
  const allowed =
    user?.role === "ADM_MASTER" ||
    user?.role === "ADM_GERENTE" ||
    user?.role === "ADM_ORCAMENTO" ||
    user?.perm_create_budget === true;
  return allowed ? <Outlet /> : <Navigate to="/budgets" replace />;
};

// A tabela de precos e do gestor: o consultor usa, nao define.
const VenueSettingsRoute = () => {
  const { user } = useAuthStore();
  const allowed = user?.role === "ADM_MASTER" || user?.role === "ADM_GERENTE";
  return allowed ? <VenueSettingsPage /> : <Navigate to="/venue-proposals" replace />;
};

const BudgetEditorRoute = () => {
  const { user } = useAuthStore();
  const allowed = user?.role !== "ADM_ANALISTA_ORCAMENTO";
  return allowed ? <Outlet /> : <Navigate to="/budgets" replace />;
};

const PublicRoute = () => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Outlet />;
  const canViewDashboard = user?.role === "ADM_MASTER" || user?.role === "ADM_GERENTE" || user?.perm_view_dashboard === true;
  return <Navigate to={canViewDashboard ? "/dashboard" : "/budgets"} replace />;
};

export const router = createBrowserRouter([
  {
    element: <PublicRoute />,
    children: [
      {
        path: "/login",
        element: <LoginPage />,
      },
      {
        path: "/forgot-password",
        element: <div>Forgot Password - Coming Soon</div>,
      },
    ],
  },
  {
    element: <PrivateRoute />,
    children: [
      {
        element: <MainLayout />,
        children: [
          {
            element: <DashboardRoute />,
            children: [
              {
                path: "/dashboard",
                element: <DashboardPage />,
              },
            ],
          },
          {
            element: <CommissionsRoute />,
            children: [
              {
                path: "/commissions",
                element: <CommissionsPage />,
              },
            ],
          },
          {
            element: <AnnexesRoute />,
            children: [
              {
                path: "/annexes",
                element: <AnnexesPage />,
              },
              {
                path: "/annexes/:id",
                element: <AnnexDetailPage />,
              },
            ],
          },
          {
            element: <ContractsRoute />,
            children: [
              {
                path: "/contracts",
                element: <ContractsPage />,
              },
              {
                path: "/contracts/create",
                element: <CreateContractPage />,
              },
              {
                path: "/contracts/:id",
                element: <CreateContractPage />,
              },
            ],
          },
          {
            path: "/budgets",
            element: <BudgetsDashboard />,
          },
          {
            element: <BudgetEditorRoute />,
            children: [
              {
                path: "/budgets/create",
                element: <CreateBudgetPage />,
              },
              {
                path: "/budgets/:id",
                element: <CreateBudgetPage />,
              },
            ],
          },
          {
            element: <ApprovalsRoute />,
            children: [
              {
                path: "/budgets/approvals",
                element: <DiscountApprovalsPage />,
              },
            ],
          },
          {
            element: <VenueProposalsRoute />,
            children: [
              {
                path: "/venue-proposals",
                element: <VenueProposalsPage />,
              },
              {
                path: "/venue-proposals/new",
                element: <CreateVenueProposalPage />,
              },
              {
                // Antes de "/:id" na ordem de leitura; o React Router ja
                // prefere o segmento fixo, mas fica explicito.
                path: "/venue-proposals/settings",
                element: <VenueSettingsRoute />,
              },
              {
                path: "/venue-proposals/:id",
                element: <CreateVenueProposalPage />,
              },
            ],
          },
          {
            element: <UsersRoute />,
            children: [
              {
                path: "/users",
                element: <UsersPage />,
              },
            ],
          },
          {
            element: <BaseCatalogRoute />,
            children: [
              {
                path: "/items",
                element: <ItemsPage />,
              },
              {
                path: "/items/create",
                element: <CreateItemPage />,
              },
              {
                path: "/items/:id",
                element: <CreateItemPage />,
              },
              {
                path: "/events",
                element: <EventsPage />,
              },
              {
                path: "/events/create",
                element: <CreateEventPage />,
              },
              {
                path: "/events/:id",
                element: <CreateEventPage />,
              },
              {
                path: "/auditoriums",
                element: <AuditoriumsPage />,
              },
              {
                path: "/auditoriums/create",
                element: <CreateAuditoriumPage />,
              },
              {
                path: "/auditoriums/:id",
                element: <CreateAuditoriumPage />,
              },
              {
                path: "/cities",
                element: <CitiesPage />,
              },
            ],
          },
          {
            element: <LogsRoute />,
            children: [
              {
                path: "/logs",
                element: <LogsPage />,
              },
            ],
          },

          {
            path: "/notifications",
            element: <div>Notifications - Coming Soon</div>,
          },
        ],
      },
      {
        path: "/",
        element: <RootRedirect />,
      },
    ],
  },
  {
    // Página pública do demonstrativo do cliente (read-only, sem login),
    // acessível apenas via token no link.
    path: "/demonstrativo/:token",
    element: <DemonstrativoPage />,
  },
  {
    path: "*",
    element: <Navigate to="/login" replace />,
  },
]);
