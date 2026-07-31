import {
  useEffect,
  useState,
} from "react";

import {
  CheckCircle2,
  ExternalLink,
  FilePlus2,
  Mail,
  MessageCircle,
  Phone,
  Save,
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
  products = [],
  actionLoading = false,
}) {
  const [commentValue, setCommentValue] =
    useState("");

  const [managerValue, setManagerValue] =
    useState("");

  const [productValue, setProductValue] =
    useState("");

  useEffect(() => {
    setCommentValue(
      contact?.comment || ""
    );

    setManagerValue(
      contact?.manager_id || ""
    );

    setProductValue("");
  }, [contact]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow =
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
        previousOverflow;

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

  if (!isOpen || !contact) {
    return null;
  }

  const telegramUsername =
    normalizeTelegramUsername(
      contact.telegram_username
    );

  const telegramLink =
    telegramUsername
      ? `https://t.me/${telegramUsername}`
      : null;

  const managerChanged =
    managerValue !==
    (contact.manager_id || "");

  const commentChanged =
    commentValue !==
    (contact.comment || "");

  const selectedProduct =
    products.find(
      (product) =>
        product.id === productValue
    ) || null;

  function handleCreateApplication() {
    if (!productValue) {
      window.alert(
        "Сначала выберите продукт."
      );

      return;
    }

    onCreateApplication?.(
      contact,
      productValue
    );
  }

  return (
    <div className="contact-drawer-layer">
      <button
        type="button"
        className="contact-drawer-overlay"
        onClick={onClose}
        disabled={actionLoading}
        aria-label="Закрыть карточку контакта"
      />

      <aside
        className="contact-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-drawer-title"
      >
        <header className="contact-drawer-header">
          <div className="contact-drawer-person">
            <div className="contact-drawer-avatar">
              {getInitials(
                contact.full_name
              )}
            </div>

            <div>
              <span className="contact-drawer-eyebrow">
                Карточка контакта
              </span>

              <h2 id="contact-drawer-title">
                {contact.full_name ||
                  "Без имени"}
              </h2>

              <span
                className={`contact-drawer-status contact-drawer-status--${
                  contact.status || "new"
                }`}
              >
                {statusNames[
                  contact.status
                ] ||
                  contact.status ||
                  "Новый"}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="contact-drawer-close"
            onClick={onClose}
            disabled={actionLoading}
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </header>

        <div className="contact-drawer-content">
          <section className="contact-drawer-quick-actions">
            <QuickAction
              icon={Phone}
              title="Позвонить"
              value={
                contact.phone ||
                "Телефон не указан"
              }
              href={
                contact.phone
                  ? `tel:${contact.phone}`
                  : null
              }
            />

            <QuickAction
              icon={Send}
              title="Открыть Telegram"
              value={
                telegramUsername
                  ? `@${telegramUsername}`
                  : "Telegram не найден"
              }
              href={telegramLink}
              external
            />
          </section>

          <section className="contact-drawer-section">
            <div className="contact-drawer-section-heading">
              <div>
                <h3>Контактные данные</h3>

                <p>
                  Основная информация о
                  клиенте.
                </p>
              </div>

              <UserRound size={18} />
            </div>

            <InfoRow
              icon={Phone}
              label="Телефон"
              value={
                contact.phone ||
                "Телефон не указан"
              }
            />

            <InfoRow
              icon={Mail}
              label="Email"
              value={
                contact.email ||
                "Email не указан"
              }
            />

            <InfoRow
              icon={Send}
              label="Telegram"
              value={
                telegramUsername
                  ? `@${telegramUsername}`
                  : "Telegram не найден"
              }
            />
          </section>

          <section className="contact-drawer-section">
            <div className="contact-drawer-section-heading">
              <div>
                <h3>Менеджер</h3>

                <p>
                  Назначьте ответственного
                  сотрудника.
                </p>
              </div>

              <UserRound size={18} />
            </div>

            <select
              className="contact-drawer-select"
              value={managerValue}
              disabled={actionLoading}
              onChange={(event) =>
                setManagerValue(
                  event.target.value
                )
              }
            >
              <option value="">
                Не назначен
              </option>

              {managers.map(
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

            <button
              type="button"
              className="contact-drawer-save-comment"
              disabled={
                actionLoading ||
                !managerChanged
              }
              onClick={() =>
                onAssignManager?.(
                  contact,
                  managerValue || null
                )
              }
            >
              <Save size={17} />

              {actionLoading
                ? "Сохраняем..."
                : managerValue
                  ? "Сохранить менеджера"
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
              <div>
                <h3>Комментарий</h3>

                <p>
                  Внутренняя информация по
                  контакту.
                </p>
              </div>

              <span>
                {commentValue.length}/1000
              </span>
            </div>

            <div className="contact-drawer-comment-wrapper">
              <MessageCircle size={18} />

              <textarea
                className="contact-drawer-comment"
                value={commentValue}
                maxLength={1000}
                placeholder="Добавить комментарий..."
                disabled={actionLoading}
                onChange={(event) =>
                  setCommentValue(
                    event.target.value
                  )
                }
              />
            </div>

            <button
              type="button"
              className="contact-drawer-save-comment"
              disabled={
                actionLoading ||
                !commentChanged
              }
              onClick={() =>
                onSaveComment?.(
                  contact,
                  commentValue
                )
              }
            >
              <Save size={17} />

              {actionLoading
                ? "Сохраняем..."
                : "Сохранить комментарий"}
            </button>
          </section>

          <section className="contact-drawer-section">
            <div className="contact-drawer-section-heading">
              <div>
                <h3>Создание заявки</h3>

                <p>
                  Выберите продукт. Для одного
                  контакта можно создать заявки
                  по разным продуктам.
                </p>
              </div>

              <FilePlus2 size={18} />
            </div>

            <select
              className="contact-drawer-select"
              value={productValue}
              disabled={
                actionLoading ||
                products.length === 0
              }
              onChange={(event) =>
                setProductValue(
                  event.target.value
                )
              }
            >
              <option value="">
                Выберите продукт
              </option>

              {products.map(
                (product) => (
                  <option
                    key={product.id}
                    value={product.id}
                  >
                    {product.name}
                    {" — "}
                    {formatMoney(
                      product.opening_price
                    )}
                  </option>
                )
              )}
            </select>

            {products.length === 0 && (
              <p className="contact-drawer-hint">
                Активные продукты не найдены.
                Сначала добавьте продукт в
                настройках CRM.
              </p>
            )}

            {selectedProduct && (
              <p className="contact-drawer-hint">
                Стоимость успешного открытия:{" "}
                {formatMoney(
                  selectedProduct.opening_price
                )}
              </p>
            )}

            <button
              type="button"
              className="contact-drawer-action contact-drawer-action--application"
              disabled={
                actionLoading ||
                !productValue
              }
              onClick={
                handleCreateApplication
              }
            >
              <FilePlus2 size={17} />

              {actionLoading
                ? "Создаём..."
                : contact.status ===
                    "application"
                  ? "Создать ещё заявку"
                  : "Создать заявку"}
            </button>
          </section>

          <section className="contact-drawer-section">
            <div className="contact-drawer-section-heading">
              <div>
                <h3>Этапы обработки</h3>

                <p>
                  Отмечайте отправку сообщения
                  и получение ответа.
                </p>
              </div>

              <CheckCircle2 size={18} />
            </div>

            <div className="contact-drawer-actions">
              <button
                type="button"
                className="contact-drawer-action"
                onClick={() =>
                  onMarkSent?.(contact)
                }
                disabled={
                  actionLoading ||
                  Boolean(contact.sent_at)
                }
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
                onClick={() =>
                  onMarkResponded?.(
                    contact
                  )
                }
                disabled={
                  actionLoading ||
                  Boolean(
                    contact.responded_at
                  )
                }
              >
                <MessageCircle size={17} />

                {contact.responded_at
                  ? "Ответ уже отмечен"
                  : actionLoading
                    ? "Сохраняем..."
                    : "Клиент ответил"}
              </button>
            </div>
          </section>
        </div>
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
      <div className="contact-drawer-quick-action__icon">
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
      <div className="contact-drawer-quick-action contact-drawer-quick-action--disabled">
        {content}
      </div>
    );
  }

  return (
    <a
      className="contact-drawer-quick-action"
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

function InfoRow({
  icon: Icon,
  label,
  value,
}) {
  return (
    <div className="contact-drawer-info">
      <div className="contact-drawer-info-icon">
        <Icon size={17} />
      </div>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function normalizeTelegramUsername(value) {
  if (!value) {
    return "";
  }

  return String(value)
    .trim()
    .replace(
      /^https?:\/\/t\.me\//i,
      ""
    )
    .replace(/^@/, "");
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

function formatMoney(value) {
  return new Intl.NumberFormat(
    "ru-RU",
    {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0,
    }
  ).format(Number(value || 0));
}