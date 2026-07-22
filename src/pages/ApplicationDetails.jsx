import {
  ArrowLeft,
  CalendarDays,
  CircleDollarSign,
  History,
  Mail,
  MessageCircle,
  Phone,
  Save,
  Send,
  Trash2,
  UserCheck,
  UserRound,
} from "lucide-react";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import "../styles/ApplicationDetails.css";

import { useAuth } from "../context/AuthContext";
import { applicationService } from "../services/applicationService";
import { applicationHistoryService } from "../services/applicationHistoryService";
import { applicationMessageService } from "../services/applicationMessageService";
import { notificationService } from "../services/notificationService";
import { profileService } from "../services/profileService";

const statusOptions = [
  { value: "new", label: "Новая" },
  { value: "in_progress", label: "В работе" },
  { value: "waiting", label: "Ожидание" },
  { value: "approved", label: "Успешная" },
  { value: "rejected", label: "Отказ" },
];

const sourceOptions = [
  "manual",
  "Telegram",
  "VK",
  "Instagram",
  "Сайт",
  "Рекомендация",
  "Другое",
];

const initialForm = {
  full_name: "",
  phone: "",
  telegram: "",
  source: "manual",
  product: "",
  status: "new",
  assigned_manager_id: "",
  amount: "",
  comment: "",
};

export default function ApplicationDetails() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { applicationId } = useParams();

  const [application, setApplication] = useState(null);
  const [managers, setManagers] = useState([]);
  const [form, setForm] = useState(initialForm);

  const [history, setHistory] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isMessagesLoading, setIsMessagesLoading] = useState(true);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState(null);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const messagesEndRef = useRef(null);

  const loadHistory = useCallback(
    async ({ showLoading = true } = {}) => {
      if (!applicationId) return;

      if (showLoading) {
        setIsHistoryLoading(true);
      }

      const { data, error: historyError } =
        await applicationHistoryService.getHistory(applicationId);

      if (historyError) {
        console.error("Ошибка загрузки истории:", historyError);
        setIsHistoryLoading(false);
        return;
      }

      setHistory(data || []);
      setIsHistoryLoading(false);
    },
    [applicationId]
  );

  const loadMessages = useCallback(
    async ({ showLoading = true } = {}) => {
      if (!applicationId) return;

      if (showLoading) {
        setIsMessagesLoading(true);
      }

      const { data, error: messagesError } =
        await applicationMessageService.getMessages(applicationId);

      if (messagesError) {
        console.error("Ошибка загрузки сообщений:", messagesError);
        setIsMessagesLoading(false);
        return;
      }

      setMessages(data || []);
      setIsMessagesLoading(false);
    },
    [applicationId]
  );

  const loadPageData = useCallback(async () => {
    if (!applicationId) {
      setApplication(null);
      setError("Не указан ID заявки");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setIsHistoryLoading(true);
    setIsMessagesLoading(true);
    setError("");
    setSuccessMessage("");

    const [
      applicationResult,
      managersResult,
      historyResult,
      messagesResult,
    ] = await Promise.all([
      applicationService.getApplicationById(applicationId),
      profileService.getManagers(),
      applicationHistoryService.getHistory(applicationId),
      applicationMessageService.getMessages(applicationId),
    ]);

    if (managersResult.error) {
      console.error("Ошибка загрузки менеджеров:", managersResult.error);
    }
    setManagers(managersResult.data || []);

    if (historyResult.error) {
      console.error("Ошибка загрузки истории:", historyResult.error);
    }
    setHistory(historyResult.data || []);
    setIsHistoryLoading(false);

    if (messagesResult.error) {
      console.error("Ошибка загрузки сообщений:", messagesResult.error);
    }
    setMessages(messagesResult.data || []);
    setIsMessagesLoading(false);

    if (applicationResult.error) {
      console.error("Ошибка загрузки заявки:", applicationResult.error);
      setError("Не удалось загрузить заявку");
      setApplication(null);
      setIsLoading(false);
      return;
    }

    if (!applicationResult.data) {
      setError("Такая заявка не найдена");
      setApplication(null);
      setIsLoading(false);
      return;
    }

    const data = applicationResult.data;

    setApplication(data);
    setForm({
      full_name: data.full_name || "",
      phone: data.phone || "",
      telegram: data.telegram || "",
      source: data.source || "manual",
      product: data.product || "",
      status: data.status || "new",
      assigned_manager_id: data.assigned_manager_id || "",
      amount:
        data.amount === null || data.amount === undefined
          ? ""
          : String(data.amount),
      comment: data.comment || "",
    });

    setIsLoading(false);
  }, [applicationId]);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  useEffect(() => {
    if (!applicationId) return undefined;

    const historyChannel = applicationHistoryService.subscribe(
      applicationId,
      () => {
        loadHistory({ showLoading: false });
      }
    );

    return () => {
      applicationHistoryService.unsubscribe(historyChannel);
    };
  }, [applicationId, loadHistory]);

  useEffect(() => {
    if (!applicationId) return undefined;

    const messagesChannel = applicationMessageService.subscribe(
      applicationId,
      () => {
        loadMessages({ showLoading: false });
      }
    );

    return () => {
      applicationMessageService.unsubscribe(messagesChannel);
    };
  }, [applicationId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [messages]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.full_name.trim()) {
      setError("Укажите имя клиента");
      return;
    }

    setIsSaving(true);
    setError("");
    setSuccessMessage("");

    const previousManagerId = application?.assigned_manager_id || null;
    const nextManagerId = form.assigned_manager_id || null;
    const previousStatus = application?.status || null;
    const nextStatus = form.status || null;

    const { data, error: updateError } =
      await applicationService.updateApplication(applicationId, form);

    if (updateError) {
      console.error("Ошибка сохранения заявки:", updateError);
      setError("Не удалось сохранить изменения");
      setIsSaving(false);
      return;
    }

    setApplication(data);

    const notificationPromises = [];

    if (
      nextManagerId &&
      nextManagerId !== previousManagerId &&
      nextManagerId !== user?.id
    ) {
      notificationPromises.push(
        notificationService.createNotification({
          recipientId: nextManagerId,
          actorId: user?.id || null,
          applicationId,
          type: "application_assigned",
          title: "Вам назначена новая заявка",
          message: `Клиент: ${data.full_name || "Без имени"}`,
        })
      );
    }

    if (
      nextStatus &&
      nextStatus !== previousStatus &&
      data.assigned_manager_id &&
      data.assigned_manager_id !== user?.id
    ) {
      notificationPromises.push(
        notificationService.createNotification({
          recipientId: data.assigned_manager_id,
          actorId: user?.id || null,
          applicationId,
          type: "application_status_changed",
          title: "Статус заявки изменён",
          message: `«${getStatusLabel(previousStatus)}» → «${getStatusLabel(
            nextStatus
          )}»`,
        })
      );
    }

    if (notificationPromises.length > 0) {
      const notificationResults = await Promise.allSettled(
        notificationPromises
      );

      notificationResults.forEach((result) => {
        if (
          result.status === "rejected" ||
          result.value?.error
        ) {
          console.error(
            "Ошибка создания уведомления:",
            result.status === "rejected"
              ? result.reason
              : result.value.error
          );
        }
      });
    }

    await loadHistory({ showLoading: false });
    setSuccessMessage("Изменения сохранены");
    setIsSaving(false);
  }

  async function handleSendMessage(event) {
    event.preventDefault();

    const normalizedMessage = messageText.trim();

    if (!normalizedMessage || isSendingMessage) return;

    if (!user?.id) {
      setError("Не удалось определить автора сообщения");
      return;
    }

    setIsSendingMessage(true);
    setError("");

    const { data, error: sendError } =
      await applicationMessageService.createMessage({
        applicationId,
        authorId: user.id,
        message: normalizedMessage,
      });

    if (sendError) {
      console.error("Ошибка отправки сообщения:", sendError);
      setError("Не удалось отправить сообщение");
      setIsSendingMessage(false);
      return;
    }

    setMessages((currentMessages) => {
      const alreadyExists = currentMessages.some(
        (item) => item.id === data.id
      );

      return alreadyExists ? currentMessages : [...currentMessages, data];
    });

    if (
      application?.assigned_manager_id &&
      application.assigned_manager_id !== user.id
    ) {
      const { error: notificationError } =
        await notificationService.createNotification({
          recipientId: application.assigned_manager_id,
          actorId: user.id,
          applicationId,
          type: "application_message",
          title: "Новое сообщение в заявке",
          message:
            normalizedMessage.length > 120
              ? `${normalizedMessage.slice(0, 120)}…`
              : normalizedMessage,
        });

      if (notificationError) {
        console.error(
          "Ошибка создания уведомления о сообщении:",
          notificationError
        );
      }
    }

    setMessageText("");
    setIsSendingMessage(false);
  }

  async function handleDeleteMessage(messageId) {
    const isConfirmed = window.confirm("Удалить это сообщение?");

    if (!isConfirmed) return;

    setDeletingMessageId(messageId);
    setError("");

    const { success, error: deleteError } =
      await applicationMessageService.deleteMessage(messageId);

    if (deleteError || !success) {
      console.error("Ошибка удаления сообщения:", deleteError);
      setError("Не удалось удалить сообщение");
      setDeletingMessageId(null);
      return;
    }

    setMessages((currentMessages) =>
      currentMessages.filter((message) => message.id !== messageId)
    );
    setDeletingMessageId(null);
  }

  async function handleDelete() {
    const isConfirmed = window.confirm(
      `Удалить заявку клиента «${application.full_name}»? Это действие нельзя отменить.`
    );

    if (!isConfirmed) return;

    setIsDeleting(true);
    setError("");
    setSuccessMessage("");

    const { success, error: deleteError } =
      await applicationService.deleteApplication(applicationId);

    if (deleteError || !success) {
      console.error("Ошибка удаления заявки:", deleteError);
      setError("Не удалось удалить заявку");
      setIsDeleting(false);
      return;
    }

    navigate("/applications", { replace: true });
  }

  if (isLoading) {
    return (
      <main className="application-details-page">
        <div className="application-details-state">
          <div className="application-details-spinner" />
          <span>Загрузка заявки...</span>
        </div>
      </main>
    );
  }

  if (!application) {
    return (
      <main className="application-details-page">
        <div className="application-details-not-found">
          <UserRound size={44} />
          <h1>Заявка не найдена</h1>
          <p>{error || "Запись отсутствует или была удалена."}</p>
          <button type="button" onClick={() => navigate("/applications")}>
            Вернуться к заявкам
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="application-details-page">
      <div className="application-details-topbar">
        <button
          className="application-details-back"
          type="button"
          onClick={() => navigate("/applications")}
        >
          <ArrowLeft size={17} />
          <span>Назад к заявкам</span>
        </button>

        <button
          className="application-details-delete"
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          <Trash2 size={17} />
          <span>{isDeleting ? "Удаление..." : "Удалить заявку"}</span>
        </button>
      </div>

      <section className="application-details-header">
        <div className="application-details-header__client">
          <div className="application-details-header__avatar">
            {getInitials(application.full_name)}
          </div>

          <div>
            <span className="application-details-header__eyebrow">
              Карточка заявки
            </span>

            <h1>{application.full_name}</h1>

            <div className="application-details-header__meta">
              <span
                className={`application-details-status application-details-status--${application.status}`}
              >
                {getStatusLabel(application.status)}
              </span>

              <span>
                Заявка от {formatDateTime(application.created_at)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="application-details-alert application-details-alert--error">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="application-details-alert application-details-alert--success">
          {successMessage}
        </div>
      )}

      <div className="application-details-layout">
        <aside className="application-details-sidebar">
          <h2>Информация</h2>

          <InfoItem
            icon={Phone}
            label="Телефон"
            value={application.phone || "Не указан"}
          />

          <InfoItem
            icon={MessageCircle}
            label="Telegram"
            value={application.telegram || "Не указан"}
          />

          <InfoItem
            icon={Mail}
            label="Источник"
            value={formatSource(application.source)}
          />

          <InfoItem
            icon={CircleDollarSign}
            label="Сумма"
            value={
              application.amount === null || application.amount === undefined
                ? "Не указана"
                : formatMoney(application.amount)
            }
          />

          <InfoItem
            icon={UserRound}
            label="Менеджер"
            value={
              application.assigned_manager?.full_name ||
              application.assigned_manager?.email ||
              "Не назначен"
            }
          />

          <InfoItem
            icon={CalendarDays}
            label="Создана"
            value={formatDateTime(application.created_at)}
          />

          <InfoItem
            icon={CalendarDays}
            label="Обновлена"
            value={formatDateTime(application.updated_at)}
          />
        </aside>

        <section className="application-details-content">
          <div className="application-details-card">
            <div className="application-details-card__header">
              <div>
                <h2>Данные заявки</h2>
                <p>
                  Измените информацию о клиенте, продукте, менеджере или
                  статусе.
                </p>
              </div>
            </div>

            <form className="application-details-form" onSubmit={handleSubmit}>
              <label className="application-details-field application-details-field--wide">
                <span>Имя клиента *</span>
                <input
                  type="text"
                  name="full_name"
                  value={form.full_name}
                  onChange={handleChange}
                  placeholder="Имя клиента"
                  required
                />
              </label>

              <label className="application-details-field">
                <span>Телефон</span>
                <input
                  type="text"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="+7 999 000-00-00"
                />
              </label>

              <label className="application-details-field">
                <span>Telegram</span>
                <input
                  type="text"
                  name="telegram"
                  value={form.telegram}
                  onChange={handleChange}
                  placeholder="@username"
                />
              </label>

              <label className="application-details-field">
                <span>Источник</span>
                <select name="source" value={form.source} onChange={handleChange}>
                  {sourceOptions.map((source) => (
                    <option key={source} value={source}>
                      {formatSource(source)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="application-details-field">
                <span>Продукт</span>
                <input
                  type="text"
                  name="product"
                  value={form.product}
                  onChange={handleChange}
                  placeholder="Например, Альфа"
                />
              </label>

              <label className="application-details-field">
                <span>Менеджер</span>
                <select
                  name="assigned_manager_id"
                  value={form.assigned_manager_id}
                  onChange={handleChange}
                >
                  <option value="">Не назначен</option>
                  {managers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.full_name || manager.email}
                    </option>
                  ))}
                </select>
              </label>

              <label className="application-details-field">
                <span>Статус</span>
                <select name="status" value={form.status} onChange={handleChange}>
                  {statusOptions.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="application-details-field">
                <span>Сумма</span>
                <input
                  type="number"
                  name="amount"
                  value={form.amount}
                  onChange={handleChange}
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
              </label>

              <label className="application-details-field application-details-field--wide">
                <span>Комментарий</span>
                <textarea
                  name="comment"
                  value={form.comment}
                  onChange={handleChange}
                  placeholder="Комментарий по заявке"
                  rows={7}
                />
              </label>

              <div className="application-details-form__actions">
                <button
                  className="application-details-save"
                  type="submit"
                  disabled={isSaving}
                >
                  <Save size={17} />
                  <span>
                    {isSaving ? "Сохранение..." : "Сохранить изменения"}
                  </span>
                </button>
              </div>
            </form>
          </div>

          <div className="application-chat-card">
            <div className="application-chat-card__header">
              <div>
                <MessageCircle size={20} />
                <div>
                  <h2>Обсуждение заявки</h2>
                  <p>Внутренняя переписка сотрудников по клиенту.</p>
                </div>
              </div>
              <span>{messages.length}</span>
            </div>

            <div className="application-chat-messages">
              {isMessagesLoading ? (
                <div className="application-chat-state">
                  <div className="application-details-spinner" />
                  <span>Загрузка сообщений...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="application-chat-state">
                  <MessageCircle size={34} />
                  <strong>Сообщений пока нет</strong>
                  <span>Напишите первое сообщение по заявке.</span>
                </div>
              ) : (
                messages.map((message) => (
                  <ApplicationMessage
                    key={message.id}
                    message={message}
                    isOwnMessage={message.author_id === user?.id}
                    isDeleting={deletingMessageId === message.id}
                    onDelete={handleDeleteMessage}
                  />
                ))
              )}

              <div ref={messagesEndRef} />
            </div>

            <form className="application-chat-form" onSubmit={handleSendMessage}>
              <textarea
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();

                    if (messageText.trim() && !isSendingMessage) {
                      handleSendMessage(event);
                    }
                  }
                }}
                placeholder="Напишите сообщение..."
                rows={3}
                maxLength={3000}
                disabled={isSendingMessage}
              />

              <div className="application-chat-form__footer">
                <span>Enter — отправить, Shift + Enter — новая строка</span>
                <button
                  type="submit"
                  disabled={isSendingMessage || !messageText.trim()}
                >
                  <Send size={16} />
                  <span>
                    {isSendingMessage ? "Отправка..." : "Отправить"}
                  </span>
                </button>
              </div>
            </form>
          </div>

          <div className="application-details-history-card">
            <div className="application-details-history-card__header">
              <div>
                <History size={20} />
                <div>
                  <h2>История действий</h2>
                  <p>Изменения заявки и действия сотрудников.</p>
                </div>
              </div>
              <span>{history.length}</span>
            </div>

            {isHistoryLoading ? (
              <div className="application-history-state">
                <div className="application-details-spinner" />
                <span>Загрузка истории...</span>
              </div>
            ) : history.length === 0 ? (
              <div className="application-history-state">
                <History size={32} />
                <strong>История пока пуста</strong>
                <span>Здесь появятся изменения заявки.</span>
              </div>
            ) : (
              <div className="application-history-list">
                {history.map((item) => (
                  <ApplicationHistoryItem
                    key={item.id}
                    item={item}
                    managers={managers}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function ApplicationMessage({
  message,
  isOwnMessage,
  isDeleting,
  onDelete,
}) {
  const authorName =
    message.author?.full_name ||
    message.author?.email ||
    "Удалённый пользователь";

  return (
    <article
      className={[
        "application-chat-message",
        isOwnMessage ? "application-chat-message--own" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="application-chat-message__avatar">
        {getInitials(authorName)}
      </div>

      <div className="application-chat-message__body">
        <div className="application-chat-message__meta">
          <strong>{authorName}</strong>

          <div>
            <time>{formatDateTime(message.created_at)}</time>

            {isOwnMessage && (
              <button
                type="button"
                title="Удалить сообщение"
                onClick={() => onDelete(message.id)}
                disabled={isDeleting}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        <p>{message.message}</p>
      </div>
    </article>
  );
}

function ApplicationHistoryItem({ item, managers }) {
  const description = getHistoryDescription(item, managers);
  const actorName =
    item.actor?.full_name || item.actor?.email || "Система";

  return (
    <article className="application-history-item">
      <div className="application-history-item__icon">
        <UserCheck size={16} />
      </div>

      <div className="application-history-item__content">
        <div className="application-history-item__top">
          <strong>{actorName}</strong>
          <time>{formatDateTime(item.created_at)}</time>
        </div>

        <p>{description}</p>
      </div>
    </article>
  );
}

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="application-details-info">
      <div className="application-details-info__icon">
        <Icon size={17} />
      </div>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function getHistoryDescription(item, managers) {
  if (item.action_type === "created") {
    return "Создал заявку";
  }

  if (item.field_name === "status") {
    return `Изменил статус: «${getStatusLabel(
      item.old_value
    )}» → «${getStatusLabel(item.new_value)}»`;
  }

  if (item.field_name === "assigned_manager_id") {
    const oldManager = getManagerName(item.old_value, managers);
    const newManager = getManagerName(item.new_value, managers);

    return `Изменил менеджера: «${oldManager}» → «${newManager}»`;
  }

  if (item.field_name === "comment") {
    return "Изменил комментарий";
  }

  if (item.field_name === "amount") {
    return `Изменил сумму: ${formatHistoryMoney(
      item.old_value
    )} → ${formatHistoryMoney(item.new_value)}`;
  }

  if (item.field_name === "product") {
    return `Изменил продукт: «${formatHistoryValue(
      item.old_value
    )}» → «${formatHistoryValue(item.new_value)}»`;
  }

  const fieldLabels = {
    full_name: "имя клиента",
    phone: "телефон",
    telegram: "Telegram",
    source: "источник",
  };

  const fieldLabel = fieldLabels[item.field_name] || "данные заявки";

  return `Изменил ${fieldLabel}: «${formatHistoryValue(
    item.old_value
  )}» → «${formatHistoryValue(item.new_value)}»`;
}

function getManagerName(managerId, managers) {
  if (!managerId) {
    return "Не назначен";
  }

  const manager = managers.find((item) => item.id === managerId);

  return (
    manager?.full_name || manager?.email || "Неизвестный сотрудник"
  );
}

function formatHistoryValue(value) {
  if (value === null || value === undefined || value === "") {
    return "Не указано";
  }

  return value;
}

function formatHistoryMoney(value) {
  if (value === null || value === undefined || value === "") {
    return "Не указана";
  }

  return formatMoney(value);
}

function getInitials(fullName) {
  if (!fullName) {
    return "К";
  }

  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getStatusLabel(statusValue) {
  return (
    statusOptions.find((status) => status.value === statusValue)?.label ||
    statusValue ||
    "Не указан"
  );
}

function formatMoney(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDateTime(dateValue) {
  if (!dateValue) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateValue));
}

function formatSource(source) {
  if (!source || source === "manual") {
    return "Вручную";
  }

  return source;
}