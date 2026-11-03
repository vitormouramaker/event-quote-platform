import { useEffect, useState } from "react";

// Verifica periodicamente se há uma versão nova publicada (compara __APP_VERSION__
// embutido no bundle com o /version.json servido sem cache). Retorna true quando
// há deploy novo — aí o app mostra o aviso de "Atualizar".
export function useVersionCheck(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const current = __APP_VERSION__;
    let stopped = false;

    const check = async () => {
      try {
        const res = await fetch(`/version.json?_=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { version?: string };
        if (!stopped && data.version && data.version !== current) {
          setUpdateAvailable(true);
        }
      } catch {
        // offline / dev (sem version.json): ignora.
      }
    };

    check();

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    const intervalId = window.setInterval(check, 5 * 60 * 1000); // 5 min

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(intervalId);
    };
  }, []);

  return updateAvailable;
}
