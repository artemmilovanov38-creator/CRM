import { useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import {
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../context/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    isAuthenticated,
    isAuthLoading,
    login,
  } = useAuth();

  const [form, setForm] = useState({
  email: "",
  password: "",
  remember: true,
});

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectPath =
    location.state?.from || "/dashboard";

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    if (error) {
      setError("");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.email.trim() || !form.password) {
      setError("Введите email и пароль");
      return;
    }

    setIsSubmitting(true);
    setError("");

  

  const result = await login(
  form.email,
  form.password
);

    if (!result.success) {
      setError(result.message);
      setIsSubmitting(false);
      return;
    }

    navigate(redirectPath, {
      replace: true,
    });
  }

  if (isAuthLoading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading__spinner" />
        <span>Проверяем авторизацию...</span>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="login-visual__glow login-visual__glow--one" />
        <div className="login-visual__glow login-visual__glow--two" />

        <div className="login-brand">
          <div className="login-brand__mark">
            <BarChart3 size={24} />
          </div>

          <div>
            <strong>CRM Stats</strong>
            <span>Аналитика команды</span>
          </div>
        </div>

        <div className="login-visual__content">
          <span className="login-visual__badge">
            <ShieldCheck size={15} />
            Защищённая панель управления
          </span>

          <h1>
            Управляйте командой,
            <br />
            заявками и результатами
            <br />
            в одной системе
          </h1>

          <p>
            Контролируйте работу менеджеров, анализируйте
            эффективность рассылок и автоматически рассчитывайте
            зарплаты.
          </p>

          <div className="login-metrics">
            <article>
              <strong>24/7</strong>
              <span>Контроль процессов</span>
            </article>

            <article>
              <strong>100%</strong>
              <span>Прозрачная аналитика</span>
            </article>

            <article>
              <strong>1 CRM</strong>
              <span>Все данные команды</span>
            </article>
          </div>
        </div>

        <div className="login-visual__footer">
          CRM Stats · Внутренняя система управления
        </div>
      </section>

      <section className="login-form-section">
        <div className="login-form-container">
          <div className="login-form-heading">
            <span>Добро пожаловать</span>

            <h2>Вход в CRM</h2>

            <p>
              Введите данные своей учётной записи
            </p>
          </div>

          <form
            className="login-form"
            onSubmit={handleSubmit}
          >
            <label className="login-field">
              <span>Email</span>

              <div className="login-field__control">
                <Mail size={17} />

                <input
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.ru"
                  value={form.email}
                  onChange={(event) =>
                    updateField("email", event.target.value)
                  }
                />
              </div>
            </label>

            <label className="login-field">
              <span>Пароль</span>

              <div className="login-field__control">
                <LockKeyhole size={17} />

                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Введите пароль"
                  value={form.password}
                  onChange={(event) =>
                    updateField("password", event.target.value)
                  }
                />

                <button
                  type="button"
                  aria-label={
                    showPassword
                      ? "Скрыть пароль"
                      : "Показать пароль"
                  }
                  onClick={() =>
                    setShowPassword((current) => !current)
                  }
                >
                  {showPassword ? (
                    <EyeOff size={17} />
                  ) : (
                    <Eye size={17} />
                  )}
                </button>
              </div>
            </label>

            <div className="login-form-options">
              <label className="login-checkbox">
                <input
                  type="checkbox"
                  checked={form.remember}
                  onChange={(event) =>
                    updateField(
                      "remember",
                      event.target.checked
                    )
                  }
                />

                <span>Запомнить меня</span>
              </label>

              <button
                className="login-forgot-button"
                type="button"
              >
                Забыли пароль?
              </button>
            </div>

            {error && (
              <div className="login-error">
                {error}
              </div>
            )}

            <button
              className="login-submit"
              type="submit"
              disabled={isSubmitting}
            >
              <span>
                {isSubmitting
                  ? "Выполняется вход..."
                  : "Войти в систему"}
              </span>

              {!isSubmitting && <ArrowRight size={17} />}
            </button>
          </form>

        

          <p className="login-security">
            <ShieldCheck size={14} />
            Доступ разрешён только сотрудникам компании
          </p>
        </div>
      </section>
    </main>
  );
}