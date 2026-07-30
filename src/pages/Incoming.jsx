import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CheckCircle2,
  Clock3,
  Inbox,
  Plus,
  RefreshCw,
  Search,
  Send,
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

  const [telegramUsername, setTelegramUsername] =
    useState("");
    const [phone, setPhone] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [
  creatingApplicationId,
  setCreatingApplicationId,
] = useState(null);

  const [modalOpen, setModalOpen] =
    useState(false);

  const [error, setError] = useState("");
  const [formError, setFormError] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

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
          event: "UPDATE",
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

  if (result.alreadyExists) {
    setSuccessMessage(
      `Заявка для ${formatTelegramUsername(
        contact.telegram_username
      )} уже существует`
    );
  } else {
    setSuccessMessage(
      `Заявка для ${formatTelegramUsername(
        contact.telegram_username
      )} создана`
    );
  }

  await loadResponses(false);

  setCreatingApplicationId(null);
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
  }, 900);
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

    return {
      total: responses.length,
      today: respondedToday,
      averageDelay,
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
  Добавляйте Telegram-ник или номер
  телефона человека, который ответил
  на рассылку. CRM сама найдёт контакт
  и отметит его как ответившего.
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
              size={16}
              className={
                loading
                  ? "incoming-refresh-icon--loading"
                  : ""
              }
            />

            Обновить
          </button>

          <button
            className="incoming-add-button"
            type="button"
            onClick={openModal}
          >
            <Plus size={17} />
            Добавить отклик
          </button>
        </div>
      </section>

      <section className="incoming-stats">
        <article className="incoming-stat-card">
          <div className="incoming-stat-card__icon">
            <Inbox size={20} />
          </div>

          <div>
            <span>Всего откликов</span>
            <strong>{stats.total}</strong>
          </div>
        </article>

        <article className="incoming-stat-card incoming-stat-card--new">
          <div className="incoming-stat-card__icon">
            <CheckCircle2 size={20} />
          </div>

          <div>
            <span>Ответили сегодня</span>
            <strong>{stats.today}</strong>
          </div>
        </article>

        <article className="incoming-stat-card incoming-stat-card--progress">
          <div className="incoming-stat-card__icon">
            <Clock3 size={20} />
          </div>

          <div>
            <span>
              Среднее время до отклика
            </span>

            <strong>
              {formatAverageDays(
                stats.averageDelay
              )}
            </strong>
          </div>
        </article>
      </section>

      <section className="incoming-toolbar">
        <div className="incoming-search">
          <Search size={17} />

          <input
            type="text"
            placeholder="Поиск по Telegram, имени или телефону..."
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />
        </div>

        {search && (
          <button
            className="incoming-reset-button"
            type="button"
            onClick={() => setSearch("")}
          >
            Сбросить
          </button>
        )}
      </section>

      {error && (
        <div className="incoming-error">
          {error}
        </div>
      )}

{successMessage && !modalOpen && (
  <div className="incoming-page-success">
    <CheckCircle2 size={17} />
    {successMessage}
  </div>
)}
      {loading ? (
        <div className="incoming-state">
          <div className="incoming-loader" />

          <strong>
            Загружаем входящий поток
          </strong>

          <span>
            Данные появятся через несколько
            секунд.
          </span>
        </div>
      ) : filteredResponses.length === 0 ? (
        <div className="incoming-state">
          <Inbox size={36} />

          <strong>
            {search
              ? "Отклики не найдены"
              : "Откликов пока нет"}
          </strong>

          <span>
            {search
              ? "Попробуйте изменить поисковый запрос."
              : "Добавьте Telegram-ник или номер телефона человека, который ответил на рассылку."}
          </span>

          {!search && (
            <button
              className="incoming-state__button"
              type="button"
              onClick={openModal}
            >
              <Plus size={17} />
              Добавить первый отклик
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="incoming-results">
            Найдено откликов:{" "}
            <strong>
              {filteredResponses.length}
            </strong>
          </div>

          <section className="incoming-table-card">
            <div className="incoming-table-wrapper">
              <table className="incoming-table">
                <thead>
                  <tr>
                    <th>Telegram</th>
                    <th>Дата рассылки</th>
                    <th>Дата отклика</th>
                    <th>Время до отклика</th>
                    <th>Статус</th>
                    <th>Действие</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredResponses.map(
                    (response, index) => {
                      const daysAfterMailing =
                        getDaysBetween(
                          response.sent_at,
                          response.responded_at
                        );

                      const rowKey = [
                        response.mailing_id,
                        response.telegram_username,
                        response.responded_at,
                        index,
                      ].join("-");

                      return (
                        <tr key={rowKey}>
                          <td>
                            <div className="incoming-user">
                              <div className="incoming-user__icon">
                                <Send size={16} />
                              </div>

                              <div>
                                <strong>
                                  {formatTelegramUsername(
                                    response.telegram_username
                                  )}
                                </strong>

                                {response.full_name && (
                                  <span>
                                    {
                                      response.full_name
                                    }
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td>
                            {formatDate(
                              response.sent_at
                            )}
                          </td>

                          <td>
                            {formatDate(
                              response.responded_at
                            )}
                          </td>

                          <td>
                            <span className="incoming-delay">
                              {formatDays(
                                daysAfterMailing
                              )}
                            </span>
                          </td>

                          <td>
  {response.application_created_at ? (
    <span className="incoming-application-created">
      <CheckCircle2 size={15} />
      Заявка создана
    </span>
  ) : (
    <button
      className="incoming-create-application"
      type="button"
      onClick={() =>
        handleCreateApplication(response)
      }
      disabled={
        creatingApplicationId === response.id
      }
    >
      <Plus size={15} />

      {creatingApplicationId === response.id
        ? "Создаём..."
        : "Создать заявку"}
    </button>
  )}
</td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

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
          <div className="incoming-modal incoming-modal--small">
            <div className="incoming-modal__header">
              <div>
                <span>Новый отклик</span>

                <h2>
  Добавить отклик
</h2>

                <p>
  Укажите Telegram-ник или номер
  телефона. CRM найдёт последний
  подходящий контакт из рассылки.
</p>
              </div>

              <button
                className="incoming-modal__close"
                type="button"
                onClick={closeModal}
                disabled={saving}
                aria-label="Закрыть"
              >
                <X size={20} />
              </button>
            </div>

            <form
              className="incoming-response-form"
              onSubmit={handleSubmit}
            >
              <label className="incoming-modal__field">
  <span>Telegram-ник</span>

  <input
    type="text"
    value={telegramUsername}
    onChange={(event) => {
      setTelegramUsername(
        event.target.value
      );

      if (formError) {
        setFormError("");
      }
    }}
    placeholder="@username"
    autoFocus
    disabled={saving}
  />
</label>

<div className="incoming-response-form__divider">
  <span>или</span>
</div>

<label className="incoming-modal__field">
  <span>Номер телефона</span>

  <input
    type="tel"
    value={phone}
    onChange={(event) => {
      setPhone(event.target.value);

      if (formError) {
        setFormError("");
      }
    }}
    placeholder="+7 999 123-45-67"
    disabled={saving}
  />
</label>

<div className="incoming-response-form__hint">
  Заполните Telegram или номер телефона.
  Оба поля одновременно заполнять не обязательно.
</div>

              {formError && (
                <div className="incoming-modal__error">
                  {formError}
                </div>
              )}

              {successMessage && (
                <div className="incoming-modal__success">
                  <CheckCircle2 size={17} />
                  {successMessage}
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
                  <CheckCircle2 size={17} />

                  {saving
                    ? "Проверяем..."
                    : "Сохранить отклик"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function formatTelegramUsername(value) {
  if (!value) {
    return "Ник не указан";
  }

  const username = String(value).trim();

  if (username.startsWith("@")) {
    return username;
  }

  return `@${username}`;
}

function formatPhone(value) {
  const digits = String(value || "").replace(
    /\D/g,
    ""
  );

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

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getDaysBetween(startValue, endValue) {
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
    endDate.getTime() - startDate.getTime();

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

  const days = Math.round(value * 10) / 10;

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
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
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