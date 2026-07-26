import {
  useEffect,
  useState,
} from "react";

import {
  CheckCircle2,
  FilePlus2,
  Mail,
  MessageCircle,
  Phone,
  Send,
  UserRound,
  X,
} from "lucide-react";

import "../../styles/ContactDrawer.css";

const statusNames = {
  new: "Новый",
  telegram_found: "Telegram найден",
  telegram_not_found: "Telegram не найден",
  assigned: "Назначен менеджеру",
  sent: "Сообщение отправлено",
  responded: "Ответил",
  application: "Создана заявка",
  opened: "Открытие",
  rejected: "Отказ",
  duplicate: "Дубликат",
};

function formatTelegramUsername(username) {
  if (!username) {
    return "Telegram не найден";
  }

  return `@${String(username).replace(/^@/, "")}`;
}

export default function ContactDrawer({
  contact,
  isOpen,
  onClose,
  onMarkSent,
  onMarkResponded,
  onCreateApplication,
  onSaveComment,
  onAssignManager,
  managers = [],
  actionLoading,
}) {
  const [commentValue, setCommentValue] =
    useState("");

  const [managerValue, setManagerValue] =
    useState("");

  useEffect(() => {
    setCommentValue(contact?.comment || "");
    setManagerValue(contact?.manager_id || "");
  }, [contact]);

  if (!isOpen || !contact) {
    return null;
  }

  return (
    <div className="contact-drawer-layer">
      <button
        type="button"
        className="contact-drawer-overlay"
        onClick={onClose}
        aria-label="Закрыть карточку контакта"
      />

      <aside className="contact-drawer">
        <header className="contact-drawer-header">
          <div className="contact-drawer-person">
            <div className="contact-drawer-avatar">
              <UserRound size={22} />
            </div>

            <div>
              <h2>
                {contact.full_name || "Без имени"}
              </h2>

              <span
                className={`contact-drawer-status contact-drawer-status--${
                  contact.status || "new"
                }`}
              >
                {statusNames[contact.status] ||
                  contact.status ||
                  "Новый"}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="contact-drawer-close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </header>

        <div className="contact-drawer-content">
          <section className="contact-drawer-section">
            <h3>Контактные данные</h3>

            <div className="contact-drawer-info">
              <div className="contact-drawer-info-icon">
                <Phone size={17} />
              </div>

              <div>
                <span>Телефон</span>
                <strong>
                  {contact.phone ||
                    "Телефон не указан"}
                </strong>
              </div>
            </div>

            <div className="contact-drawer-info">
              <div className="contact-drawer-info-icon">
                <Mail size={17} />
              </div>

              <div>
                <span>Email</span>
                <strong>
                  {contact.email ||
                    "Email не указан"}
                </strong>
              </div>
            </div>

            <div className="contact-drawer-info">
              <div className="contact-drawer-info-icon">
                <Send size={17} />
              </div>

              <div>
                <span>Telegram</span>
                <strong>
                  {formatTelegramUsername(
                    contact.telegram_username
                  )}
                </strong>
              </div>
            </div>
          </section>

         <section className="contact-drawer-section">
  <h3>Менеджер</h3>

  <select
    className="contact-drawer-select"
    value={managerValue}
    disabled={actionLoading}
    onChange={(event) =>
      setManagerValue(event.target.value)
    }
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

  <button
    type="button"
    className="contact-drawer-save-comment"
    disabled={
      actionLoading ||
      managerValue ===
        (contact.manager_id || "")
    }
    onClick={() =>
      onAssignManager?.(
        contact,
        managerValue || null
      )
    }
  >
    {actionLoading
      ? "Сохраняем..."
      : managerValue
        ? "Назначить менеджера"
        : "Снять назначение"}
  </button>

  {contact.manager?.full_name && (
    <p className="contact-drawer-hint">
      Сейчас назначен:{" "}
      {contact.manager.full_name}
    </p>
  )}
</section>

         <section className="contact-drawer-section">
  <div className="contact-drawer-section-heading">
    <h3>Комментарий</h3>

    <span>
      {commentValue.length}/1000
    </span>
  </div>

  <textarea
    className="contact-drawer-comment"
    value={commentValue}
    maxLength={1000}
    placeholder="Добавить комментарий..."
    onChange={(event) =>
      setCommentValue(event.target.value)
    }
  />

  <button
    type="button"
    className="contact-drawer-save-comment"
    disabled={
      actionLoading ||
      commentValue ===
        (contact.comment || "")
    }
    onClick={() =>
      onSaveComment?.(
        contact,
        commentValue
      )
    }
  >
    {actionLoading
      ? "Сохраняем..."
      : "Сохранить комментарий"}
  </button>
</section>

          <section className="contact-drawer-section">
            <h3>Действия</h3>

            <div className="contact-drawer-actions">
              <button
                type="button"
                className="contact-drawer-action contact-drawer-action--telegram"
              >
                <Send size={17} />
                Найти Telegram
              </button>

             <button
  type="button"
  className="contact-drawer-action"
  onClick={() => onMarkSent?.(contact)}
  disabled={actionLoading || Boolean(contact.sent_at)}
>
  <CheckCircle2 size={17} />

  {contact.sent_at
    ? "Сообщение уже отправлено"
    : actionLoading
      ? "Сохраняем..."
      : "Сообщение отправлено"}
</button>

              <button
  type="button"
  className="contact-drawer-action"
  onClick={() => onMarkResponded?.(contact)}
  disabled={
    actionLoading ||
    Boolean(contact.responded_at)
  }
>
  <MessageCircle size={17} />

  {contact.responded_at
    ? "Ответ уже отмечен"
    : actionLoading
      ? "Сохраняем..."
      : "Клиент ответил"}
</button>

              <button
  type="button"
  className="contact-drawer-action contact-drawer-action--application"
  disabled={
    actionLoading ||
    contact.status === "application"
  }
  onClick={() =>
    onCreateApplication?.(contact)
  }
>
  <FilePlus2 size={17} />

  {contact.status === "application"
    ? "Заявка уже создана"
    : actionLoading
      ? "Создаем..."
      : "Создать заявку"}
</button>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}