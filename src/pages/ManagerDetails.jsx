import {
  ArrowLeft,
  CalendarDays,
  Mail,
  MessageCircle,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import "../styles/ManagerDetails.css";

import { profileService } from "../services/profileService";

const roleLabels = {
  leader: "Руководитель",
  manager: "Менеджер",
};

const statusLabels = {
  active: "Активен",
  inactive: "Неактивен",
  blocked: "Заблокирован",
};

export default function ManagerDetails() {
  const navigate = useNavigate();
  const { managerId } = useParams();

  const [manager, setManager] = useState(null);

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    telegram: "",
    hire_date: "",
    note: "",
  });

  const [isLoading, setIsLoading] =
    useState(true);

  const [isSaving, setIsSaving] =
    useState(false);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] =
    useState("");

  useEffect(() => {
    loadManager();
  }, [managerId]);

  async function loadManager() {
    setIsLoading(true);
    setError("");
    setSuccessMessage("");

    const { data, error: managerError } =
      await profileService.getManagerById(
        managerId
      );

    if (managerError) {
      console.error(
        "Ошибка загрузки менеджера:",
        managerError
      );

      setError(
        "Не удалось загрузить карточку менеджера"
      );

      setManager(null);
      setIsLoading(false);

      return;
    }

    if (!data) {
      setError("Такой менеджер не найден");
      setManager(null);
      setIsLoading(false);

      return;
    }

    setManager(data);

    setForm({
      full_name: data.full_name || "",
      phone: data.phone || "",
      telegram: data.telegram || "",
      hire_date: data.hire_date || "",
      note: data.note || "",
    });

    setIsLoading(false);
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setIsSaving(true);
    setError("");
    setSuccessMessage("");

    const { data, error: updateError } =
      await profileService.updateProfile(
        managerId,
        {
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
          telegram:
            form.telegram.trim() || null,
          hire_date: form.hire_date || null,
          note: form.note.trim() || null,
        }
      );

    if (updateError) {
      console.error(
        "Ошибка сохранения менеджера:",
        updateError
      );

      setError(
        "Не удалось сохранить изменения"
      );

      setIsSaving(false);

      return;
    }

    setManager(data);
    setSuccessMessage(
      "Данные менеджера сохранены"
    );
    setIsSaving(false);
  }

  if (isLoading) {
    return (
      <main className="manager-details-page">
        <div className="manager-details-state">
          <div className="manager-details-state__spinner" />
          <span>Загрузка карточки...</span>
        </div>
      </main>
    );
  }

  if (!manager) {
    return (
      <main className="manager-details-page">
        <div className="manager-details-not-found">
          <UserRound size={42} />

          <h1>Менеджер не найден</h1>

          <p>
            {error ||
              "Пользователь отсутствует или больше не является менеджером."}
          </p>

          <button
            type="button"
            onClick={() =>
              navigate("/managers")
            }
          >
            Вернуться к менеджерам
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="manager-details-page">
      <button
        className="manager-details-back"
        type="button"
        onClick={() => navigate("/managers")}
      >
        <ArrowLeft size={17} />
        <span>Назад к менеджерам</span>
      </button>

      <section className="manager-details-header">
        <div className="manager-details-header__person">
          <div className="manager-details-header__avatar">
            {getInitials(manager.full_name)}
          </div>

          <div>
            <span className="manager-details-header__eyebrow">
              Карточка сотрудника
            </span>

            <h1>
              {manager.full_name || "Без имени"}
            </h1>

            <div className="manager-details-header__meta">
              <span>
                <ShieldCheck size={14} />
                {roleLabels[manager.role] ||
                  manager.role}
              </span>

              <span
                className={`manager-details-status manager-details-status--${manager.status}`}
              >
                {statusLabels[manager.status] ||
                  manager.status}
              </span>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="manager-details-alert manager-details-alert--error">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="manager-details-alert manager-details-alert--success">
          {successMessage}
        </div>
      )}

      <div className="manager-details-layout">
        <aside className="manager-details-sidebar">
          <h2>Контакты</h2>

          <ContactItem
            icon={Mail}
            label="Email"
            value={manager.email}
          />

          <ContactItem
            icon={Phone}
            label="Телефон"
            value={
              manager.phone || "Не указан"
            }
          />

          <ContactItem
            icon={MessageCircle}
            label="Telegram"
            value={
              manager.telegram || "Не указан"
            }
          />

          <ContactItem
            icon={CalendarDays}
            label="Дата начала работы"
            value={
              manager.hire_date
                ? formatDate(manager.hire_date)
                : "Не указана"
            }
          />

          <ContactItem
            icon={CalendarDays}
            label="Профиль создан"
            value={formatDate(
              manager.created_at
            )}
          />
        </aside>

        <section className="manager-details-content">
          <div className="manager-details-card">
            <div className="manager-details-card__header">
              <div>
                <h2>Данные сотрудника</h2>

                <p>
                  Изменения сохраняются в
                  профиле пользователя Supabase.
                </p>
              </div>
            </div>

            <form
              className="manager-details-form"
              onSubmit={handleSubmit}
            >
              <label className="manager-details-field manager-details-field--wide">
                <span>ФИО</span>

                <input
                  type="text"
                  name="full_name"
                  value={form.full_name}
                  onChange={handleChange}
                  placeholder="Введите ФИО"
                  required
                />
              </label>

              <label className="manager-details-field">
                <span>Телефон</span>

                <input
                  type="text"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="+7 999 000-00-00"
                />
              </label>

              <label className="manager-details-field">
                <span>Telegram</span>

                <input
                  type="text"
                  name="telegram"
                  value={form.telegram}
                  onChange={handleChange}
                  placeholder="@username"
                />
              </label>

              <label className="manager-details-field">
                <span>
                  Дата начала работы
                </span>

                <input
                  type="date"
                  name="hire_date"
                  value={form.hire_date}
                  onChange={handleChange}
                />
              </label>

              <label className="manager-details-field manager-details-field--wide">
                <span>Заметка</span>

                <textarea
                  name="note"
                  value={form.note}
                  onChange={handleChange}
                  placeholder="Внутренняя заметка о сотруднике"
                  rows={6}
                />
              </label>

              <div className="manager-details-form__actions">
                <button
                  className="manager-details-save"
                  type="submit"
                  disabled={isSaving}
                >
                  <Save size={17} />

                  <span>
                    {isSaving
                      ? "Сохранение..."
                      : "Сохранить изменения"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

function ContactItem({
  icon: Icon,
  label,
  value,
}) {
  return (
    <div className="manager-details-contact">
      <div className="manager-details-contact__icon">
        <Icon size={17} />
      </div>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function getInitials(fullName) {
  if (!fullName) {
    return "М";
  }

  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(dateValue));
}