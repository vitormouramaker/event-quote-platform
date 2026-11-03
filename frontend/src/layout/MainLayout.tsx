import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar/Sidebar";
import { UpdateBanner } from "../components/UpdateBanner/UpdateBanner";
import { IS_HOMOLOG } from "../config/env";
import styles from "./MainLayout.module.css";

export function MainLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setIsSidebarOpen(false);
    // Sempre abre a nova rota no topo (senão a lista volta rolada da tela anterior).
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className={styles.container}>
      {/* Homologação é visualmente inconfundível: aqui se mexe à vontade, em
          produção não. Sem a faixa, dá para editar um orçamento real achando
          que é teste. */}
      {IS_HOMOLOG && (
        <div className={styles.homologBadge}>Ambiente de homologação</div>
      )}
      <UpdateBanner />
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      {isSidebarOpen && (
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Fechar menu"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      <main className={styles.main}>
        <div className={styles.mobileTopbar}>
          <button
            type="button"
            className={styles.menuButton}
            aria-label="Abrir menu"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>
          <span className={styles.mobileTitle}>Orça Eventos</span>
        </div>
        <div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
