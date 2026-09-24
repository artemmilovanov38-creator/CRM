import { useEffect, useState } from "react";

import {
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  Phone,
  Save,
  Send,
  Stamp,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import "../../styles/ApplicationDrawer.css";
import {
  getApplicationOpenedAt,
  getApplicationPayout,
  isApplicationReceiptOpened,
} from "../../services/applicationService";
import { applicationHistoryService } from "../../services/applicationHistoryService";
import { getTelegramHref } from "../../utils/telegram";
import {
  isoToDateInput,
  todayDateInput,
} from "../../utils/periodRange";
import ApplicationTimeline from "./ApplicationTimeline";

const statusOptions = [
  {
    value: "new",
    label: "Новая",
  },
  {
    value: "in_progress",
    label: "В работе",
  },
  {
    value: "approved",
    label: "Успешно открыта",
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
  product_id: "",
  product: "",
  status: "new",
  assigned_manager_id: "",
  amount: "",
  comment: "",
  pp_id: "",
  opened_on: "",
};

function getApplicationForm(application) {
  if (!application) {
    return emptyForm;
  }

  return {
    full_name:
      application.full_name || "",

    phone:
      application.phone || "",

    telegram:
      application.telegram || "",

    source:
      application.source || "",

    product_id:
      application.product_id || "",

    product:
      application.product_data?.name ||
      application.product ||
      "",

    status:
      application.status === "waiting"
        ? "new"
        : application.status || "new",

    assigned_manager_id:
      application.assigned_manager_id ||
      "",

    amount:
      getApplicationPayout(application) ===
        null
        ? ""
        : String(
            getApplicationPayout(
              application
            )
          ),

    comment:
      application.comment || "",

    pp_id:
      application.pp_id || "",

    opened_on:
      isoToDateInput(
        application.opened_at ||
          application.approved_at
      ) ||
      (application.status === "approved"
        ? todayDateInput()
        : ""),
  };
}

export default function ApplicationDrawer({
  application,
  isOpen,
  managers = [],
  actionLoading = false,
  onClose,
  onSave,
  onDelete,
  onMarkOpened,
}) {
  const [form, setForm] =
    useState(emptyForm);
  const [history, setHistory] =
    useState([]);

  useEffect(() => {
    setForm(
      getApplicationForm(application)
    );
  }, [application]);

  useEffect(() => {
    if (!isOpen || !application?.id) {
      setHistory([]);
      return undefined;
    }

    let cancelled = false;

    applicationHistoryService
      .getHistory(application.id)
      .then((result) => {
        if (!cancelled) {
          setHistory(result.data || []);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, application?.id]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const oldOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function handleEscape(event) {
      if (
        event.key === "Escape" &&
        !actionLoading
      ) {
        onClose?.();
      }
    }

    window.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      document.body.style.overflow =
        oldOverflow;

      window.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, [
    isOpen,
    actionLoading,
    onClose,
  ]);

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

  const statusLabel =
    getStatusLabel(form.status);

  function handleChange(event) {
    const { name, value } =
      event.target;

    setForm((currentForm) => {
      const next = {
        ...currentForm,
        [name]: value,
      };

      if (
        name === "status" &&
        value === "approved" &&
        !currentForm.opened_on
      ) {
        next.opened_on = todayDateInput();
      }

      return next;
    });
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!form.full_name.trim()) {
      window.alert(
        "Укажите имя клиента."
      );

      return;
    }

    onSave?.(application, form);
  }

  function handleDelete() {
    const confirmed =
      window.confirm(
        `Удалить заявку "${
          application.full_name ||
          "Без имени"
        }"?`
      );

    if (!confirmed) {
      return;
    }

    onDelete?.(application);
  }

  const receiptOpened =
    isApplicationReceiptOpened(application);

  const openedAt =
    getApplicationOpenedAt(application);

  return (
    <div className="application-drawer-layer">
      <button
        type="button"
        className="application-drawer-overlay"
        onClick={onClose}
        disabled={actionLoading}
        aria-label="Закрыть заявку"
      />

      <aside
        className="application-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-drawer-title"
      >
        <header className="application-drawer-header">
          <div className="application-drawer-person">
            <div className="application-drawer-avatar">
              {getInitials(
                application.full_name
              )}
            </div>

            <div>
              <span>Карточка заявки</span>

              <h2 id="application-drawer-title">
                {application.full_name ||
                  "Без имени"}
              </h2>

              <div
                className={`application-drawer-status application-drawer-status--${form.status}`}
              >
                {statusLabel}
              </div>
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
          <section className="application-drawer-quick-actions">
            <QuickAction
              icon={Phone}
              title="Позвонить"
              value={
                form.phone ||
                "Телефон не указан"
              }
              href={
                form.phone
                  ? `tel:${form.phone}`
                  : null
              }
            />

            <QuickAction
              icon={Send}
              title="Открыть Telegram"
              value={
                form.telegram ||
                "Telegram не указан"
              }
              href={telegramLink}
              external
            />
          </section>

          <section className="application-drawer-section application-drawer-section--receipt">
            {receiptOpened ? (
              <div className="application-drawer-receipt application-drawer-receipt--done">
                <Stamp size={18} />
                <div>
                  <span>Квит открыт</span>
                  <strong>
                    {formatDate(openedAt)}
                  </strong>
                </div>
              </div>
            ) : (
              <>
                <label className="application-drawer-field">
                  <span>Дата открытия</span>
                  <input
                    type="date"
                    name="opened_on"
                    value={
                      form.opened_on ||
                      todayDateInput()
                    }
                    max={todayDateInput()}
                    onChange={handleChange}
                    disabled={actionLoading}
                  />
                </label>
                <button
                  type="button"
                  className="application-drawer-receipt-button"
                  onClick={() =>
                    onMarkOpened?.(
                      application,
                      form.opened_on ||
                        todayDateInput()
                    )
                  }
                  disabled={actionLoading}
                >
                  <Stamp size={18} />
                  {actionLoading
                    ? "Отмечаем..."
                    : "Отметить квит открытым"}
                </button>
              </>
            )}
          </section>

          <section className="application-drawer-section">
            <div className="application-drawer-section-heading">
              <div>
                <h3>Основные данные</h3>

                <p>
                  Клиент, продукт и текущий
                  этап работы.
                </p>
              </div>

              <UserRound size={18} />
            </div>

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

            <div className="application-drawer-fields-grid">
              <label className="application-drawer-field">
                <span>Статус</span>

                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  disabled={actionLoading}
                  className={`application-drawer-status-select application-drawer-status-select--${form.status}`}
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

              {form.status === "approved" && (
                <label className="application-drawer-field">
                  <span>Дата открытия</span>
                  <input
                    type="date"
                    name="opened_on"
                    value={form.opened_on}
                    max={todayDateInput()}
                    onChange={handleChange}
                    disabled={actionLoading}
                    required
                  />
                  <small>
                    Зарплата посчитается за этот день.
                  </small>
                </label>
              )}

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

                  {(
                    form.assigned_manager_id &&
                    !managers.some(
                      (manager) =>
                        manager.id ===
                        form.assigned_manager_id
                    )
                      ? [
                          {
                            id: form.assigned_manager_id,
                            full_name: "Менеджер",
                          },
                          ...managers,
                        ]
                      : managers
                  ).map(
                    (manager) => (
                      <option
                        key={manager.id}
                        value={manager.id}
                      >
                        {manager.full_name ||
                          manager.email ||
                          "Без имени"}
                      </option>
                    )
                  )}
                </select>
              </label>
            </div>

            <div className="application-drawer-product-card">
              <div>
                <span>Продукт</span>

                <strong>
                  {form.product ||
                    "Продукт не выбран"}
                </strong>
              </div>

              <CheckCircle2 size={18} />
            </div>

            <label className="application-drawer-field">
              <span>Сумма из продукта</span>

              <input
                type="number"
                name="amount"
                value={form.amount}
                readOnly
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0"
              />
            </label>

            <label className="application-drawer-field">
              <span>ID ПП</span>

              <input
                type="text"
                name="pp_id"
                inputMode="numeric"
                value={form.pp_id}
                onChange={(event) => {
                  const { value } =
                    event.target;

                  setForm(
                    (currentForm) => ({
                      ...currentForm,
                      pp_id:
                        value.replace(
                          /\D/g,
                          ""
                        ),
                    })
                  );
                }}
                disabled={actionLoading}
                placeholder="Введите цифры вручную"
              />
            </label>
          </section>

          <section className="application-drawer-section">
            <div className="application-drawer-section-heading">
              <div>
                <h3>Контактные данные</h3>

                <p>
                  Эти данные можно изменить
                  вручную.
                </p>
              </div>

              <Phone size={18} />
            </div>

            <label className="application-drawer-field">
              <span>Телефон</span>

              <div className="application-drawer-input-action">
                <input
                  type="tel"
                  inputMode="tel"
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
                    <ExternalLink
                      size={17}
                    />
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
            <div className="application-drawer-section-heading">
              <div>
                <h3>Этапы заявки</h3>

                <p>
                  Хронология этой заявки:
                  входящий, создание и
                  смены статусов.
                </p>
              </div>

              <CalendarDays size={18} />
            </div>

            <ApplicationTimeline
              application={application}
              history={history}
              compact
            />
          </section>

          <section className="application-drawer-section">
            <div className="application-drawer-section-heading">
              <div>
                <h3>Комментарий к заявке</h3>

                <p>
                  Только по этой заявке,
                  не по всему контакту.
                </p>
              </div>

              <span>
                {form.comment.length}/2000
              </span>
            </div>

            <div className="application-drawer-comment-wrapper">
              <MessageCircle size={18} />

              <textarea
                className="application-drawer-comment"
                name="comment"
                value={form.comment}
                onChange={handleChange}
                disabled={actionLoading}
                maxLength={2000}
                placeholder="Комментарий к этой заявке..."
              />
            </div>
          </section>

          <section className="application-drawer-footer">
            <button
              type="button"
              className="application-drawer-delete"
              onClick={handleDelete}
              disabled={actionLoading}
            >
              <Trash2 size={17} />
              Удалить заявку
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
              <Save size={18} />

              {actionLoading
                ? "Сохраняем..."
                : hasChanges
                  ? "Сохранить изменения"
                  : "Изменений нет"}
            </button>
          </section>
        </form>
      </aside>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  title,
  value,
  href,
  external = false,
}) {
  const content = (
    <>
      <div className="application-drawer-quick-action__icon">
        <Icon size={19} />
      </div>

      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>

      {href && (
        <ExternalLink size={15} />
      )}
    </>
  );

  if (!href) {
    return (
      <div className="application-drawer-quick-action application-drawer-quick-action--disabled">
        {content}
      </div>
    );
  }

  return (
    <a
      className="application-drawer-quick-action"
      href={href}
      target={
        external
          ? "_blank"
          : undefined
      }
      rel={
        external
          ? "noreferrer"
          : undefined
      }
    >
      {content}
    </a>
  );
}

function getInitials(value) {
  if (!value) {
    return "К";
  }

  return String(value)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getStatusLabel(value) {
  return (
    statusOptions.find(
      (status) =>
        status.value === value
    )?.label || value
  );
}

function getTelegramLink(value) {
  return getTelegramHref(value);
}

function formatDate(value) {
  if (!value) {
    return "Не указано";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Не указано";
  }

  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(date);
}