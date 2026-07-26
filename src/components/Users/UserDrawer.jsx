import {
  CalendarDays,
  LockKeyhole,
  Mail,
  Save,
  Shield,
  Trash2,
  UserRound,
  UserRoundCheck,
  UserRoundX,
  X,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import "../../styles/UserDrawer.css";

const emptyForm = {
  full_name: "",
  email: "",
  password: "",
  phone: "",
  telegram: "",
  hire_date: "",
  role: "manager",
  status: "active",
  note: "",
};

const roleOptions = [
  {
    value: "admin",
    label: "Администратор",
  },
  {
  value: "head",
  label: "Руководитель",
},
  {
    value: "manager",
    label: "Менеджер",
  },
];

const statusOptions = [
  {
    value: "active",
    label: "Активен",
  },
  {
    value: "inactive",
    label: "Неактивен",
  },
  {
    value: "blocked",
    label: "Заблокирован",
  },
];

function getUserForm(profile) {
  if (!profile) {
    return {
      ...emptyForm,
    };
  }

  return {
    full_name: profile.full_name || "",
    email: profile.email || "",
    password: "",
    phone: profile.phone || "",
    telegram: profile.telegram || "",
    hire_date: profile.hire_date || "",
    role: profile.role || "manager",
    status: profile.status || "active",
    note: profile.note || "",
  };
}

function normalizeTelegram(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "");
}

function getTelegramLink(value) {
  const username = normalizeTelegram(value);

  if (!username) {
    return null;
  }

  return `https://t.me/${username}`;
}

function getInitials(value) {
  if (!value) {
    return "П";
  }

  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getRoleLabel(role) {
  const labels = {
    admin: "Администратор",
     head: "Руководитель",
    manager: "Менеджер",
  };

  return labels[role] || "Сотрудник";
}

export default function UserDrawer({
  isOpen,
  profile,
  currentUserId,
  actionLoading = false,
  onClose,
  onCreate,
  onSave,
  onDelete,
  onToggleStatus,
}) {
  const isCreateMode = !profile;

  const [form, setForm] = useState({
    ...emptyForm,
  });

  const [validationError, setValidationError] =
    useState("");

  useEffect(() => {
    setForm(getUserForm(profile));
    setValidationError("");
  }, [profile, isOpen]);

  const originalForm = useMemo(
    () => getUserForm(profile),
    [profile]
  );

  const hasChanges = useMemo(() => {
    if (isCreateMode) {
      return true;
    }

    return (
      JSON.stringify(form) !==
      JSON.stringify(originalForm)
    );
  }, [
    form,
    originalForm,
    isCreateMode,
  ]);

  if (!isOpen) {
    return null;
  }

  const isCurrentUser =
    Boolean(profile?.id) &&
    profile.id === currentUserId;

  const telegramLink =
    getTelegramLink(form.telegram);

  const isBlocked =
    form.status === "blocked";

  function handleChange(event) {
    const { name, value } = event.target;

    setValidationError("");

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  }

  function validateForm() {
    const fullName = form.full_name.trim();
    const email = form.email
      .trim()
      .toLowerCase();

    if (!fullName) {
      return "Укажите имя сотрудника";
    }

    if (!email) {
      return "Укажите email сотрудника";
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return "Укажите корректный email";
    }

    if (
      isCreateMode &&
      form.password.length < 8
    ) {
      return "Пароль должен содержать минимум 8 символов";
    }

    if (
      !roleOptions.some(
        (item) => item.value === form.role
      )
    ) {
      return "Выбрана недопустимая роль";
    }

    return "";
  }

  function handleSubmit(event) {
    event.preventDefault();

    const errorMessage = validateForm();

    if (errorMessage) {
      setValidationError(errorMessage);
      return;
    }

    const normalizedValues = {
      full_name: form.full_name.trim(),
      email: form.email
        .trim()
        .toLowerCase(),
      phone: form.phone.trim() || null,
      telegram:
        normalizeTelegram(form.telegram) ||
        null,
      hire_date: form.hire_date || null,
      role: form.role,
      status: form.status,
      note: form.note.trim() || null,
    };

    if (isCreateMode) {
      onCreate?.({
        ...normalizedValues,
        password: form.password,
      });

      return;
    }

    onSave?.(profile, normalizedValues);
  }

  function handleDelete() {
    if (!profile || isCurrentUser) {
      return;
    }

    const confirmed = window.confirm(
      `Удалить аккаунт "${
        profile.full_name || profile.email
      }"?`
    );

    if (!confirmed) {
      return;
    }

    onDelete?.(profile);
  }

  function handleToggleStatus() {
    if (!profile || isCurrentUser) {
      return;
    }

    onToggleStatus?.(profile);
  }

  return (
    <div className="user-drawer-layer">
      <button
        className="user-drawer-overlay"
        type="button"
        aria-label="Закрыть карточку пользователя"
        onClick={onClose}
      />

      <aside className="user-drawer">
        <header className="user-drawer__header">
          <div className="user-drawer__person">
            <div className="user-drawer__avatar">
              {isCreateMode
                ? (
                    <UserRound size={23} />
                  )
                : getInitials(
                    profile?.full_name
                  )}
            </div>

            <div className="user-drawer__title">
              <span>
                {isCreateMode
                  ? "Новый сотрудник"
                  : "Карточка сотрудника"}
              </span>

              <h2>
                {isCreateMode
                  ? "Создание аккаунта"
                  : profile?.full_name ||
                    "Без имени"}
              </h2>

              {!isCreateMode && (
                <small>
                  {getRoleLabel(
                    profile?.role
                  )}
                </small>
              )}
            </div>
          </div>

          <button
            className="user-drawer__close"
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            disabled={actionLoading}
          >
            <X size={20} />
          </button>
        </header>

        <form
          className="user-drawer__form"
          onSubmit={handleSubmit}
        >
          {validationError && (
            <div className="user-drawer__alert user-drawer__alert--error">
              {validationError}
            </div>
          )}

          {isCurrentUser && (
            <div className="user-drawer__alert">
              Это ваш аккаунт. Его нельзя
              заблокировать или удалить.
            </div>
          )}

          <section className="user-drawer__section">
            <div className="user-drawer__section-title">
              <UserRound size={17} />

              <div>
                <h3>Основная информация</h3>
                <p>
                  Данные сотрудника и контакты
                </p>
              </div>
            </div>

            <label className="user-drawer__field">
              <span>Имя сотрудника</span>

              <input
                type="text"
                name="full_name"
                value={form.full_name}
                onChange={handleChange}
                placeholder="Иван Иванов"
                disabled={actionLoading}
                autoComplete="name"
              />
            </label>

            <label className="user-drawer__field">
              <span>Email</span>

              <div className="user-drawer__input-icon">
                <Mail size={16} />

                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="employee@example.com"
                  disabled={
                    actionLoading ||
                    !isCreateMode
                  }
                  autoComplete="email"
                />
              </div>

              {!isCreateMode && (
                <small>
                  Email аккаунта пока нельзя
                  изменить из этой формы.
                </small>
              )}
            </label>

            {isCreateMode && (
              <label className="user-drawer__field">
                <span>Временный пароль</span>

                <div className="user-drawer__input-icon">
                  <LockKeyhole size={16} />

                  <input
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="Минимум 8 символов"
                    disabled={actionLoading}
                    autoComplete="new-password"
                  />
                </div>

                <small>
                  Сотрудник будет использовать
                  этот пароль при первом входе.
                </small>
              </label>
            )}

            <div className="user-drawer__grid">
              <label className="user-drawer__field">
                <span>Телефон</span>

                <input
                  type="text"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="+7 999 000-00-00"
                  disabled={actionLoading}
                />
              </label>

              <label className="user-drawer__field">
                <span>Telegram</span>

                <div className="user-drawer__telegram">
                  <input
                    type="text"
                    name="telegram"
                    value={form.telegram}
                    onChange={handleChange}
                    placeholder="@username"
                    disabled={actionLoading}
                  />

                  {telegramLink && (
                    <a
                      href={telegramLink}
                      target="_blank"
                      rel="noreferrer"
                      title="Открыть Telegram"
                    >
                      Открыть
                    </a>
                  )}
                </div>
              </label>
            </div>

            <label className="user-drawer__field">
              <span>Дата приёма</span>

              <div className="user-drawer__input-icon">
                <CalendarDays size={16} />

                <input
                  type="date"
                  name="hire_date"
                  value={form.hire_date}
                  onChange={handleChange}
                  disabled={actionLoading}
                />
              </div>
            </label>
          </section>

          <section className="user-drawer__section">
            <div className="user-drawer__section-title">
              <Shield size={17} />

              <div>
                <h3>Роль и доступ</h3>
                <p>
                  Права сотрудника внутри CRM
                </p>
              </div>
            </div>

            <div className="user-drawer__grid">
              <label className="user-drawer__field">
                <span>Роль</span>

                <select
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                  disabled={
                    actionLoading ||
                    isCurrentUser
                  }
                >
                  {roleOptions.map((role) => (
                    <option
                      key={role.value}
                      value={role.value}
                    >
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="user-drawer__field">
                <span>Статус</span>

                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  disabled={
                    actionLoading ||
                    isCurrentUser
                  }
                >
                  {statusOptions.map(
                    (status) => (
                      <option
                        key={status.value}
                        value={status.value}
                      >
                        {status.label}
                      </option>
                    )
                  )}
                </select>
              </label>
            </div>
          </section>

          <section className="user-drawer__section">
            <div className="user-drawer__section-title">
              <UserRoundCheck size={17} />

              <div>
                <h3>Комментарий</h3>
                <p>
                  Внутренняя заметка об
                  сотруднике
                </p>
              </div>
            </div>

            <label className="user-drawer__field">
              <div className="user-drawer__field-heading">
                <span>Заметка</span>

                <small>
                  {form.note.length}/2000
                </small>
              </div>

              <textarea
                name="note"
                value={form.note}
                onChange={handleChange}
                placeholder="Дополнительная информация..."
                maxLength={2000}
                disabled={actionLoading}
              />
            </label>
          </section>

          <footer className="user-drawer__footer">
            {!isCreateMode && (
              <div className="user-drawer__danger-actions">
                <button
                  className={[
                    "user-drawer__status-button",
                    isBlocked
                      ? "user-drawer__status-button--restore"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  type="button"
                  onClick={handleToggleStatus}
                  disabled={
                    actionLoading ||
                    isCurrentUser
                  }
                >
                  {isBlocked ? (
                    <UserRoundCheck size={17} />
                  ) : (
                    <UserRoundX size={17} />
                  )}

                  {isBlocked
                    ? "Разблокировать"
                    : "Заблокировать"}
                </button>

                <button
                  className="user-drawer__delete"
                  type="button"
                  onClick={handleDelete}
                  disabled={
                    actionLoading ||
                    isCurrentUser
                  }
                >
                  <Trash2 size={17} />
                  Удалить
                </button>
              </div>
            )}

            <button
              className="user-drawer__save"
              type="submit"
              disabled={
                actionLoading ||
                (!isCreateMode &&
                  !hasChanges)
              }
            >
              <Save size={17} />

              {actionLoading
                ? "Сохранение..."
                : isCreateMode
                  ? "Создать аккаунт"
                  : "Сохранить изменения"}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
}