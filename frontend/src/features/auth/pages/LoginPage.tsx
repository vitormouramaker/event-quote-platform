import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, User } from "lucide-react";
import { useAuthStore } from "../../../store/authStore";
import { Button } from "../../../components/Button/Button";
import styles from "../styles/LoginPage.module.css";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading } = useAuthStore();
  const [form, setForm] = useState({ login: "", password: "" });
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.login.trim() || !form.password.trim()) {
      setError("Preencha login e senha.");
      return;
    }
    const success = await login(form.login.trim(), form.password);
    if (success) {
      navigate("/dashboard");
    } else {
      setError("Login ou senha incorretos.");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logo}>Orça Eventos</div>
          <h1 className={styles.title}>Acesso ao Sistema</h1>
          <p className={styles.subtitle}>Entre com suas credenciais</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Login */}
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "500", marginBottom: "6px", color: "var(--color-text-main)" }}>
              Login
            </label>
            <div style={{ position: "relative" }}>
              <User
                size={16}
                style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-secondary)" }}
              />
              <input
                type="text"
                value={form.login}
                onChange={(e) => setForm((p) => ({ ...p, login: e.target.value }))}
                placeholder="Seu login"
                autoComplete="username"
                style={{
                  width: "100%",
                  paddingLeft: "36px",
                  paddingRight: "12px",
                  paddingTop: "10px",
                  paddingBottom: "10px",
                  border: "1.5px solid var(--color-border)",
                  borderRadius: "8px",
                  fontSize: "14px",
                  backgroundColor: "var(--color-background)",
                  color: "var(--color-text-main)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Senha */}
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "500", marginBottom: "6px", color: "var(--color-text-main)" }}>
              Senha
            </label>
            <div style={{ position: "relative" }}>
              <Lock
                size={16}
                style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-secondary)" }}
              />
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Sua senha"
                autoComplete="current-password"
                style={{
                  width: "100%",
                  paddingLeft: "36px",
                  paddingRight: "12px",
                  paddingTop: "10px",
                  paddingBottom: "10px",
                  border: "1.5px solid var(--color-border)",
                  borderRadius: "8px",
                  fontSize: "14px",
                  backgroundColor: "var(--color-background)",
                  color: "var(--color-text-main)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Erro */}
          {error && (
            <div style={{
              padding: "10px 14px",
              backgroundColor: "#fee2e2",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              color: "#dc2626",
              fontSize: "13px",
            }}>
              {error}
            </div>
          )}

          <Button
            type="submit"
            isLoading={isLoading}
            style={{ width: "100%", marginTop: "4px" }}
          >
            Entrar
          </Button>
        </form>

        <div className={styles.footer}>
          <p style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
            Orça Eventos © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
