import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import App from "./App.tsx";
import { queryClient } from "./lib/queryClient";
import { setApiTokenProvider } from "./services/api";
import { useAuthStore } from "./store/authStore";
import "./styles/globals.css";

setApiTokenProvider(() => useAuthStore.getState().token ?? null);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  </StrictMode>,
);
