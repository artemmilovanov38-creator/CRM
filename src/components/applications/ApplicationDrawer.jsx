import {
  useEffect,
  useState,
} from "react";

import {
  ExternalLink,
  MessageCircle,
  Phone,
  Save,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import "../../styles/ApplicationDrawer.css";

const statusOptions = [
  {
    value: "in_progress",
    label: "В работе",
  },
  {
    value: "approved",
    label: "Успешная",
  },
  {
    value: "rejected",
    label: "Отказ",
  },
];

const emptyForm = {
  full_name: "",
  phone: "",
  telegram: "",
  source: "",
  product: "",
  status: "in_progress",
  assigned_manager_id: "",
  amount: "",
  comment: "",
};

function getApplicationForm(application) {
  if (!application) {
    return emptyForm;
  }

  return {
    full_name: application.full_name || "",
    phone: application.phone || "",
    telegram: application.telegram || "",
    source: application.source || "",
    product: application.product || "",
    status:
  application.status === "new" ||
  application.status === "waiting"
    ? "in_progress"
    : application.status || "in_progress",

    assigned_manager_id:
      application.assigned_manager_id || "",

    amount:
      application.amount === null ||
      application.amount === undefined
        ? ""
        : String(application.amount),

    comment: application.comment || "",
  };
}

function getTelegramLink(value) {
  if (!value) {
    return null;
  }

  const username = String(value)
    .trim()
    .replace(/^@/, "");

  if (!username) {
    return null;
  }

  return `https://t.me/${username}`;
}
function formatDate(value) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDays(sentAt, createdAt) {
  if (!sentAt || !createdAt) {
    return "—";
  }

  const diff =
    new Date(createdAt) -
    new Date(sentAt);

  if (Number.isNaN(diff) || diff < 0) {
    return "—";
  }

  const days = Math.floor(
    diff / (1000 * 60 * 60 * 24)
  );

  return days === 0
    ? "В тот же день"
    : `${days} дн.`;
}

export default function ApplicationDrawer({
  application,
  isOpen,
  managers = [],
  actionLoading = false,
  onClose,
  onSave,
  onDelete,
}) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    setForm(getApplicationForm(application));
  }, [application]);

  if (!isOpen || !application) {
    return null;
  }

  const originalForm =
    getApplicationForm(application);

  const hasChanges =
    JSON.stringify(form) !==
    JSON.stringify(originalForm);

  const telegramLink =
    getTelegramLink(form.telegram);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!form.full_name.trim()) {
      alert("Укажите имя клиента.");
      return;
    }

    onSave?.(application, form);
  }

  function handleDelete() {
    const confirmed = window.confirm(
      `Удалить заявку "${
        application.full_name || "Без имени"
      }"?`
    );

    if (!confirmed) {
      return;
    }

    onDelete?.(application);
  }

  return (
    <div className="application-drawer-layer">
      <button
        type="button"
        className="application-drawer-overlay"
        onClick={onClose}
        aria-label="Закрыть карточку заявки"
      />

      <aside className="application-drawer">
        <header className="application-drawer-header">
          <div className="application-drawer-person">
            <div className="application-drawer-avatar">
              <UserRound size={22} />
            </div>

            <div>
              <span>Карточка заявки</span>

              <h2>
                {application.full_name ||
                  "Без имени"}
              </h2>
            </div>
          </div>

          <button
            type="button"
            className="application-drawer-close"
            onClick={onClose}
            disabled={actionLoading}
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </header>

        <form
          className="application-drawer-content"
          onSubmit={handleSubmit}
        >

          <section className="application-drawer-section">
  <h3>История рассылки</h3>

  <div className="application-history">

    <div className="application-history-row">
      <span>Дата рассылки</span>

      <strong>
        {formatDate(
          application.mailing_contact?.sent_at
        )}
      </strong>
    </div>

    <div className="application-history-row">
      <span>Дата отклика</span>

      <strong>
        {formatDate(
          application.mailing_contact?.responded_at
        )}
      </strong>
    </div>

    <div className="application-history-row">
      <span>Дата заявки</span>

      <strong>
        {formatDate(
          application.mailing_contact
            ?.application_created_at ||
            application.created_at
        )}
      </strong>
    </div>

    <div className="application-history-row">
      <span>До заявки</span>

      <strong>
        {formatDays(
          application.mailing_contact?.sent_at,
          application.mailing_contact
            ?.application_created_at ||
            application.created_at
        )}
      </strong>
    </div>

  </div>
</section>
          <section className="application-drawer-section">
            <h3>Клиент</h3>

            <label className="application-drawer-field">
              <span>Имя клиента</span>

              <input
                type="text"
                name="full_name"
                value={form.full_name}
                onChange={handleChange}
                disabled={actionLoading}
                placeholder="Имя клиента"
              />
            </label>

            <label className="application-drawer-field">
              <span>Телефон</span>

              <div className="application-drawer-input-action">
                <input
                  type="text"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  disabled={actionLoading}
                  placeholder="+7 999 000-00-00"
                />

                {form.phone && (
                  <a
                    href={`tel:${form.phone}`}
                    aria-label="Позвонить"
                  >
                    <Phone size={17} />
                  </a>
                )}
              </div>
            </label>

            <label className="application-drawer-field">
              <span>Telegram</span>

              <div className="application-drawer-input-action">
                <input
                  type="text"
                  name="telegram"
                  value={form.telegram}
                  onChange={handleChange}
                  disabled={actionLoading}
                  placeholder="@username"
                />

                {telegramLink && (
                  <a
                    href={telegramLink}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Открыть Telegram"
                  >
                    <ExternalLink size={17} />
                  </a>
                )}
              </div>
            </label>

            <label className="application-drawer-field">
              <span>Источник</span>

              <input
                type="text"
                name="source"
                value={form.source}
                onChange={handleChange}
                disabled={actionLoading}
                placeholder="Источник заявки"
              />
            </label>
          </section>

          <section className="application-drawer-section">
            <h3>Сделка</h3>

            <label className="application-drawer-field">
              <span>Продукт</span>

              <input
                type="text"
                name="product"
                value={form.product}
                onChange={handleChange}
                disabled={actionLoading}
                placeholder="Продукт"
              />
            </label>

            <label className="application-drawer-field">
              <span>Сумма</span>

              <input
                type="number"
                name="amount"
                value={form.amount}
                onChange={handleChange}
                disabled={actionLoading}
                min="0"
                step="0.01"
                placeholder="0"
              />
            </label>

            <label className="application-drawer-field">
              <span>Статус</span>

              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                disabled={actionLoading}
              >
                {statusOptions.map((status) => (
                  <option
                    key={status.value}
                    value={status.value}
                  >
                    {status.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="application-drawer-field">
              <span>Менеджер</span>

              <select
                name="assigned_manager_id"
                value={
                  form.assigned_manager_id
                }
                onChange={handleChange}
                disabled={actionLoading}
              >
                <option value="">
                  Не назначен
                </option>

                {managers.map((manager) => (
                  <option
                    key={manager.id}
                    value={manager.id}
                  >
                    {manager.full_name ||
                      manager.email ||
                      "Без имени"}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="application-drawer-section">
            <div className="application-drawer-section-heading">
              <h3>Комментарий</h3>

              <span>
                {form.comment.length}/2000
              </span>
            </div>

            <div className="application-drawer-comment-icon">
              <MessageCircle size={17} />
            </div>

            <textarea
              className="application-drawer-comment"
              name="comment"
              value={form.comment}
              onChange={handleChange}
              disabled={actionLoading}
              maxLength={2000}
              placeholder="Комментарий по заявке..."
            />
          </section>

          <section className="application-drawer-footer">
            <button
              type="button"
              className="application-drawer-delete"
              onClick={handleDelete}
              disabled={actionLoading}
            >
              <Trash2 size={17} />
              Удалить
            </button>

            <button
              type="submit"
              className="application-drawer-save"
              disabled={
                actionLoading ||
                !hasChanges ||
                !form.full_name.trim()
              }
            >
              <Save size={17} />

              {actionLoading
                ? "Сохраняем..."
                : "Сохранить изменения"}
            </button>
          </section>
        </form>
      </aside>
    </div>
  );
}