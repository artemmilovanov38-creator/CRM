import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CheckCircle2,
  Clock3,
  Inbox,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  UserRound,
  X,
} from "lucide-react";

import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

import { incomingResponseService } from "../services/incomingResponseService";
import { applicationService } from "../services/applicationService";

import "../styles/Incoming.css";

export default function Incoming() {
  const { profile, user } = useAuth();

  const currentProfile = profile || user;

  const [responses, setResponses] = useState([]);
  const [search, setSearch] = useState("");

  const [
    telegramUsername,
    setTelegramUsername,
  ] = useState("");

  const [phone, setPhone] = useState("");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [
    creatingApplicationId,
    setCreatingApplicationId,
  ] = useState(null);

  const [modalOpen, setModalOpen] =
    useState(false);

  const [error, setError] = useState("");
  const [formError, setFormError] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  useEffect(() => {
    loadResponses();
  }, []);

  useEffect(() => {
    let reloadTimer = null;

    const channel = supabase
      .channel("incoming-responses-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mailing_contacts",
        },
        () => {
          clearTimeout(reloadTimer);

          reloadTimer = setTimeout(() => {
            loadResponses(false);
          }, 300);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadResponses(
    showLoader = true
  ) {
    if (showLoader) {
      setLoading(true);
    }

    setError("");

    const result =
      await incomingResponseService.getResponses();

    if (result.error) {
      console.error(
        "Ошибка загрузки откликов:",
        result.error
      );

      setError(
        result.error.message ||
          "Не удалось загрузить отклики"
      );
    } else {
      setResponses(result.data || []);
    }

    if (showLoader) {
      setLoading(false);
    }
  }

  function openModal() {
    setTelegramUsername("");
    setPhone("");
    setFormError("");
    setSuccessMessage("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) {
      return;
    }

    setModalOpen(false);
    setTelegramUsername("");
    setPhone("");
    setFormError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setFormError("");
    setSuccessMessage("");

    const normalizedUsername =
      incomingResponseService
        .normalizeTelegramUsername(
          telegramUsername
        );

    const normalizedPhone =
      incomingResponseService.normalizePhone(
        phone
      );

    if (
      !normalizedUsername &&
      !normalizedPhone
    ) {
      setFormError(
        "Введите Telegram-ник или номер телефона"
      );

      return;
    }

    if (!currentProfile?.id) {
      setFormError(
        "Не удалось определить текущего пользователя"
      );

      return;
    }

    setSaving(true);

    const result =
      await incomingResponseService.registerResponse({
        telegram: normalizedUsername,
        phone: normalizedPhone,
        managerId: currentProfile.id,
      });

    if (result.error) {
      console.error(
        "Ошибка регистрации отклика:",
        result.error
      );

      setFormError(
        result.error.message ||
          "Не удалось сохранить отклик"
      );

      setSaving(false);
      return;
    }

    const identifier =
      normalizedUsername ||
      formatPhone(normalizedPhone);

    if (!result.data?.matched) {
      setFormError(
        `${identifier} не найден среди контактов, которым была отправлена рассылка`
      );

      setSaving(false);
      return;
    }

    if (result.data.alreadyResponded) {
      setFormError(
        `${identifier} уже был отмечен как ответивший`
      );

      setSaving(false);
      return;
    }

    setSuccessMessage(
      `${identifier} отмечен как ответивший`
    );

    setTelegramUsername("");
    setPhone("");

    await loadResponses(false);

    setSaving(false);

    setTimeout(() => {
      setModalOpen(false);
      setSuccessMessage("");
    }, 1000);
  }

  async function handleCreateApplication(
    contact
  ) {
    if (!contact?.id) {
      setError(
        "Не удалось определить контакт для создания заявки"
      );

      return;
    }

    if (creatingApplicationId) {
      return;
    }

    setError("");
    setSuccessMessage("");
    setCreatingApplicationId(contact.id);

    const result =
      await applicationService
        .createApplicationFromContact(
          contact,
          currentProfile?.id || null
        );

    if (result.error) {
      console.error(
        "Ошибка создания заявки:",
        result.error
      );

      setError(
        result.error.message ||
          "Не удалось создать заявку"
      );

      setCreatingApplicationId(null);
      return;
    }

    const identifier =
      getContactIdentifier(contact);

    if (result.alreadyExists) {
      setSuccessMessage(
        `Заявка для ${identifier} уже существует`
      );
    } else {
      setSuccessMessage(
        `Заявка для ${identifier} создана`
      );
    }

    await loadResponses(false);

    setCreatingApplicationId(null);
  }

  const filteredResponses = useMemo(() => {
    const normalizedSearch = search
      .trim()
      .toLowerCase();

    if (!normalizedSearch) {
      return responses;
    }

    return responses.filter((response) => {
      const searchableValue = [
        response.telegram_username,
        response.full_name,
        response.phone,
        response.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableValue.includes(
        normalizedSearch
      );
    });
  }, [responses, search]);

  const stats = useMemo(() => {
    const delays = responses
      .map((response) =>
        getDaysBetween(
          response.sent_at,
          response.responded_at
        )
      )
      .filter(
        (value) =>
          typeof value === "number" &&
          value >= 0
      );

    const averageDelay = delays.length
      ? delays.reduce(
          (sum, value) => sum + value,
          0
        ) / delays.length
      : 0;

    const respondedToday = responses.filter(
      (response) =>
        isToday(response.responded_at)
    ).length;

    const withApplications =
      responses.filter(
        (response) =>
          response.application_created_at
      ).length;

    return {
      total: responses.length,
      today: respondedToday,
      averageDelay,
      withApplications,
    };
  }, [responses]);

  return (
    <main className="incoming-page">
      <section className="incoming-heading">
        <div>
          <span className="incoming-heading__eyebrow">
            Отклики на рассылки
          </span>

          <h1>Входящий поток</h1>

          <p>
            Добавьте Telegram-ник или номер
            человека, который ответил на
            рассылку. CRM автоматически найдёт
            контакт и отметит его как
            ответившего.
          </p>
        </div>

        <div className="incoming-heading__actions">
          <button
            className="incoming-refresh-button"
            type="button"
            onClick={() => loadResponses()}
            disabled={loading}
          >
            <RefreshCw
              size={18}
              className={
                loading
                  ? "incoming-refresh-icon--loading"
                  : ""
              }
            />

            <span>Обновить</span>
          </button>

          <button
            className="incoming-add-button"
            type="button"
            onClick={openModal}
          >
            <Plus size={19} />
            <span>Добавить отклик</span>
          </button>
        </div>
      </section>

      <section className="incoming-stats">
        <StatCard
          icon={Inbox}
          title="Всего откликов"
          value={stats.total}
        />

        <StatCard
          icon={CheckCircle2}
          title="Ответили сегодня"
          value={stats.today}
          variant="success"
        />

        <StatCard
          icon={Clock3}
          title="Среднее время"
          value={formatAverageDays(
            stats.averageDelay
          )}
          variant="warning"
        />

        <StatCard
          icon={UserRound}
          title="Создано заявок"
          value={stats.withApplications}
          variant="blue"
        />
      </section>

      <section className="incoming-toolbar">
        <div className="incoming-search">
          <Search size={19} />

          <input
            type="search"
            placeholder="Telegram, имя или телефон"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />

          {search && (
            <button
              type="button"
              aria-label="Очистить поиск"
              onClick={() => setSearch("")}
            >
              <X size={17} />
            </button>
          )}
        </div>
      </section>

      {error && (
        <div className="incoming-alert incoming-alert--error">
          {error}
        </div>
      )}

      {successMessage && !modalOpen && (
        <div className="incoming-alert incoming-alert--success">
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {loading ? (
        <div className="incoming-state">
          <div className="incoming-loader" />

          <strong>
            Загружаем входящий поток
          </strong>

          <span>
            Получаем актуальные данные из CRM.
          </span>
        </div>
      ) : filteredResponses.length === 0 ? (
        <div className="incoming-state">
          <Inbox size={42} />

          <strong>
            {search
              ? "Отклики не найдены"
              : "Откликов пока нет"}
          </strong>

          <span>
            {search
              ? "Измените поисковый запрос."
              : "Добавьте первый отклик по номеру телефона или Telegram."}
          </span>

          {!search && (
            <button
              className="incoming-state__button"
              type="button"
              onClick={openModal}
            >
              <Plus size={18} />
              Добавить отклик
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="incoming-results">
            Найдено:{" "}
            <strong>
              {filteredResponses.length}
            </strong>
          </div>

          <section className="incoming-grid">
            {filteredResponses.map(
              (response) => {
                const delay = getDaysBetween(
                  response.sent_at,
                  response.responded_at
                );

                const isCreating =
                  creatingApplicationId ===
                  response.id;

                return (
                  <article
                    className="incoming-card"
                    key={response.id}
                  >
                    <div className="incoming-card__top">
                      <div className="incoming-card__identity">
                        <div className="incoming-card__avatar">
                          {response.telegram_username ? (
                            <Send size={20} />
                          ) : (
                            <Phone size={20} />
                          )}
                        </div>

                        <div>
                          <span>Ответивший контакт</span>

                          <h2>
                            {getContactIdentifier(
                              response
                            )}
                          </h2>

                          {response.full_name && (
                            <p>
                              {response.full_name}
                            </p>
                          )}
                        </div>
                      </div>

                      <span className="incoming-card__status">
                        <CheckCircle2 size={14} />
                        Ответил
                      </span>
                    </div>

                    <div className="incoming-card__details">
                      <DetailItem
                        label="Отправлено"
                        value={formatDate(
                          response.sent_at
                        )}
                      />

                      <DetailItem
                        label="Получен ответ"
                        value={formatDate(
                          response.responded_at
                        )}
                      />

                      <DetailItem
                        label="Время до ответа"
                        value={formatDays(delay)}
                      />

                      <DetailItem
                        label="Телефон"
                        value={
                          response.phone
                            ? formatPhone(
                                response.phone
                              )
                            : "Не указан"
                        }
                      />
                    </div>

                    <div className="incoming-card__actions">
                      {response.application_created_at ? (
                        <div className="incoming-application-created">
                          <CheckCircle2 size={17} />

                          <div>
                            <strong>
                              Заявка создана
                            </strong>

                            <span>
                              Контакт уже перенесён
                              в заявки
                            </span>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="incoming-create-application"
                          type="button"
                          onClick={() =>
                            handleCreateApplication(
                              response
                            )
                          }
                          disabled={isCreating}
                        >
                          <Plus size={18} />

                          {isCreating
                            ? "Создаём заявку..."
                            : "Создать заявку"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              }
            )}
          </section>
        </>
      )}

      <button
        className="incoming-floating-button"
        type="button"
        aria-label="Добавить отклик"
        onClick={openModal}
      >
        <Plus size={26} />
      </button>

      {modalOpen && (
        <div
          className="incoming-modal-overlay"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeModal();
            }
          }}
        >
          <section
            className="incoming-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="incoming-modal-title"
          >
            <div className="incoming-modal__header">
              <div>
                <span>Новый отклик</span>

                <h2 id="incoming-modal-title">
                  Кто вам написал?
                </h2>

                <p>
                  Заполните одно поле: Telegram
                  или номер телефона.
                </p>
              </div>

              <button
                className="incoming-modal__close"
                type="button"
                aria-label="Закрыть"
                onClick={closeModal}
                disabled={saving}
              >
                <X size={21} />
              </button>
            </div>

            <form
              className="incoming-response-form"
              onSubmit={handleSubmit}
            >
              <label className="incoming-modal__field">
                <span>Telegram-ник</span>

                <div className="incoming-input">
                  <Send size={18} />

                  <input
                    type="text"
                    value={telegramUsername}
                    onChange={(event) => {
                      setTelegramUsername(
                        event.target.value
                      );

                      setFormError("");
                    }}
                    placeholder="@username"
                    autoFocus
                    disabled={saving}
                  />
                </div>
              </label>

              <div className="incoming-response-form__divider">
                <span>или</span>
              </div>

              <label className="incoming-modal__field">
                <span>Номер телефона</span>

                <div className="incoming-input">
                  <Phone size={18} />

                  <input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(event) => {
                      setPhone(
                        event.target.value
                      );

                      setFormError("");
                    }}
                    placeholder="+7 999 123-45-67"
                    disabled={saving}
                  />
                </div>
              </label>

              <div className="incoming-response-form__hint">
                CRM выполнит поиск только среди
                контактов, которым была отправлена
                рассылка.
              </div>

              {formError && (
                <div className="incoming-modal__error">
                  {formError}
                </div>
              )}

              {successMessage && (
                <div className="incoming-modal__success">
                  <CheckCircle2 size={18} />
                  <span>{successMessage}</span>
                </div>
              )}

              <div className="incoming-modal__actions">
                <button
                  className="incoming-modal__cancel"
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Отмена
                </button>

                <button
                  className="incoming-modal__submit"
                  type="submit"
                  disabled={saving}
                >
                  <CheckCircle2 size={18} />

                  {saving
                    ? "Проверяем..."
                    : "Отметить ответ"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function StatCard({
  icon: Icon,
  title,
  value,
  variant = "",
}) {
  return (
    <article
      className={[
        "incoming-stat-card",
        variant
          ? `incoming-stat-card--${variant}`
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="incoming-stat-card__icon">
        <Icon size={20} />
      </div>

      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="incoming-card__detail">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getContactIdentifier(contact) {
  if (contact?.telegram_username) {
    return formatTelegramUsername(
      contact.telegram_username
    );
  }

  if (contact?.phone) {
    return formatPhone(contact.phone);
  }

  return contact?.full_name || "Без данных";
}

function formatTelegramUsername(value) {
  if (!value) {
    return "Telegram не указан";
  }

  const username = String(value).trim();

  return username.startsWith("@")
    ? username
    : `@${username}`;
}

function formatPhone(value) {
  const digits = String(value || "").replace(
    /\D/g,
    ""
  );

  if (
    digits.length === 11 &&
    digits.startsWith("8")
  ) {
    return formatPhone(
      `7${digits.slice(1)}`
    );
  }

  if (
    digits.length === 11 &&
    digits.startsWith("7")
  ) {
    return `+7 ${digits.slice(
      1,
      4
    )} ${digits.slice(
      4,
      7
    )}-${digits.slice(
      7,
      9
    )}-${digits.slice(9)}`;
  }

  return value || "Номер не указан";
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

function getDaysBetween(
  startValue,
  endValue
) {
  if (!startValue || !endValue) {
    return null;
  }

  const startDate = new Date(startValue);
  const endDate = new Date(endValue);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime())
  ) {
    return null;
  }

  const milliseconds =
    endDate.getTime() -
    startDate.getTime();

  if (milliseconds < 0) {
    return 0;
  }

  return milliseconds / 86400000;
}

function formatDays(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "Не рассчитано";
  }

  if (value < 1 / 24) {
    return "Меньше часа";
  }

  if (value < 1) {
    const hours = Math.max(
      1,
      Math.round(value * 24)
    );

    return `${hours} ${getWordForm(
      hours,
      "час",
      "часа",
      "часов"
    )}`;
  }

  const days =
    Math.round(value * 10) / 10;

  return `${days} ${getWordForm(
    Math.floor(days),
    "день",
    "дня",
    "дней"
  )}`;
}

function formatAverageDays(value) {
  if (!value) {
    return "Нет данных";
  }

  return formatDays(value);
}

function isToday(value) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const today = new Date();

  return (
    date.getFullYear() ===
      today.getFullYear() &&
    date.getMonth() ===
      today.getMonth() &&
    date.getDate() ===
      today.getDate()
  );
}

function getWordForm(
  value,
  one,
  few,
  many
) {
  const normalizedValue =
    Math.abs(value) % 100;

  const lastDigit =
    normalizedValue % 10;

  if (
    normalizedValue > 10 &&
    normalizedValue < 20
  ) {
    return many;
  }

  if (lastDigit === 1) {
    return one;
  }

  if (
    lastDigit >= 2 &&
    lastDigit <= 4
  ) {
    return few;
  }

  return many;
}