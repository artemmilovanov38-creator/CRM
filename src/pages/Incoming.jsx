import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  Clock3,
  Inbox,
  ListChecks,
  RefreshCw,
  Search,
  Send,
  UserRound,
  Users,
  X,
  XCircle,
} from "lucide-react";

import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

import {
  incomingResponseService,
} from "../services/incomingResponseService";

import "../styles/Incoming.css";

export default function Incoming() {
  const { profile, user } = useAuth();

  const currentProfile = profile || user;

  const [responses, setResponses] =
    useState([]);

  const [search, setSearch] =
    useState("");

  const [identifiersValue, setIdentifiersValue] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [modalOpen, setModalOpen] =
    useState(false);

  const [error, setError] =
    useState("");

  const [formError, setFormError] =
    useState("");

  const [result, setResult] =
    useState(null);

  const isManager =
    currentProfile?.role === "manager";

  const loadResponses = useCallback(
    async (showLoader = true) => {
      if (!currentProfile?.id) {
        return;
      }

      if (showLoader) {
        setLoading(true);
      }

      setError("");

      const responseResult =
        await incomingResponseService
          .getResponses({
            managerId: isManager
              ? currentProfile.id
              : null,
          });

      if (responseResult.error) {
        console.error(
          "Ошибка загрузки откликов:",
          responseResult.error
        );

        setError(
          responseResult.error.message ||
            "Не удалось загрузить отклики"
        );

        setResponses([]);
      } else {
        setResponses(
          responseResult.data || []
        );
      }

      if (showLoader) {
        setLoading(false);
      }
    },
    [
      currentProfile?.id,
      isManager,
    ]
  );

  useEffect(() => {
    loadResponses();
  }, [loadResponses]);

  useEffect(() => {
    let reloadTimer = null;

    const channel = supabase
      .channel(
        `incoming-responses-${
          currentProfile?.id || "anonymous"
        }`
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mailing_contacts",
        },
        () => {
          clearTimeout(reloadTimer);

          reloadTimer = window.setTimeout(
            () => {
              loadResponses(false);
            },
            350
          );
        }
      )
      .subscribe();

    return () => {
      clearTimeout(reloadTimer);

      supabase.removeChannel(
        channel
      );
    };
  }, [
    currentProfile?.id,
    loadResponses,
  ]);

  function openModal() {
    setIdentifiersValue("");
    setFormError("");
    setResult(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) {
      return;
    }

    setModalOpen(false);
    setIdentifiersValue("");
    setFormError("");
    setResult(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setFormError("");
    setResult(null);

    if (!currentProfile?.id) {
      setFormError(
        "Не удалось определить текущего пользователя"
      );

      return;
    }

    const parsedIdentifiers =
      incomingResponseService
        .parseIdentifiers(
          identifiersValue
        );

    if (
      parsedIdentifiers.length === 0
    ) {
      setFormError(
        "Введите хотя бы один Telegram-ник или номер телефона"
      );

      return;
    }

    setSaving(true);

    const registerResult =
      await incomingResponseService
        .registerResponses({
          value: identifiersValue,
          managerId:
            currentProfile.id,
        });

    if (registerResult.error) {
      console.error(
        "Ошибка регистрации откликов:",
        registerResult.error
      );

      setFormError(
        registerResult.error.message ||
          "Не удалось обработать список"
      );

      setSaving(false);
      return;
    }

    setResult(registerResult.data);

    await loadResponses(false);

    setSaving(false);
  }

  const filteredResponses = useMemo(
    () => {
      const normalizedSearch = search
        .trim()
        .toLowerCase();

      if (!normalizedSearch) {
        return responses;
      }

      return responses.filter(
        (response) => {
          const searchableValue = [
            response.telegram_username,
            response.full_name,
            response.phone,
            response.status,
            response.mailing?.name,
            response.manager?.full_name,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return searchableValue.includes(
            normalizedSearch
          );
        }
      );
    },
    [responses, search]
  );

  const stats = useMemo(() => {
    const respondedToday =
      responses.filter(
        (response) =>
          isToday(
            response.responded_at
          )
      ).length;

    const withApplications =
      responses.filter(
        (response) =>
          Boolean(
            response
              .application_created_at
          )
      ).length;

    const uniqueManagers = new Set(
      responses
        .map(
          (response) =>
            response.manager_id
        )
        .filter(Boolean)
    ).size;

    return {
      total: responses.length,
      today: respondedToday,
      withApplications,
      managers: uniqueManagers,
    };
  }, [responses]);

  return (
    <main className="incoming-page">
      <section className="incoming-heading">
        <div>
          <span className="incoming-heading__eyebrow">
            Отклики на рассылку
          </span>

          <h1>
            {isManager
              ? "Отметить написавших"
              : "Входящий поток"}
          </h1>

          <p>
            {isManager
              ? "Вставьте Telegram-ники или номера пользователей, которые вам написали. CRM найдёт их в общей базе рассылки и закрепит за вами."
              : "Здесь отображаются пользователи, которых менеджеры отметили как ответивших на рассылку."}
          </p>
        </div>

        <div className="incoming-heading__actions">
          <button
            className="incoming-refresh-button"
            type="button"
            onClick={() =>
              loadResponses()
            }
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

          {isManager && (
            <button
              className="incoming-add-button"
              type="button"
              onClick={openModal}
            >
              <ClipboardPaste
                size={19}
              />

              <span>
                Занести написавших
              </span>
            </button>
          )}
        </div>
      </section>

      <section className="incoming-stats">
        <StatCard
          icon={Inbox}
          title="Всего ответивших"
          value={stats.total}
        />

        <StatCard
          icon={CheckCircle2}
          title="Ответили сегодня"
          value={stats.today}
          variant="success"
        />

        <StatCard
          icon={ListChecks}
          title="Создано заявок"
          value={stats.withApplications}
          variant="warning"
        />

        <StatCard
          icon={Users}
          title={
            isManager
              ? "Моя база"
              : "Менеджеров"
          }
          value={
            isManager
              ? stats.total
              : stats.managers
          }
          variant="blue"
        />
      </section>

      <section className="incoming-toolbar">
        <div className="incoming-search">
          <Search size={19} />

          <input
            type="search"
            placeholder="Telegram, имя, телефон или рассылка"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
          />

          {search && (
            <button
              type="button"
              aria-label="Очистить поиск"
              onClick={() =>
                setSearch("")
              }
            >
              <X size={17} />
            </button>
          )}
        </div>
      </section>

      {error && (
        <div className="incoming-alert incoming-alert--error">
          <XCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="incoming-state">
          <div className="incoming-loader" />

          <strong>
            Загружаем отклики
          </strong>

          <span>
            Получаем актуальные данные
            из CRM.
          </span>
        </div>
      ) : filteredResponses.length ===
        0 ? (
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
              : isManager
                ? "Нажмите \"Занести написавших\" и вставьте ники или номера пользователей."
                : "Менеджеры ещё не отметили ответивших пользователей."}
          </span>

          {!search && isManager && (
            <button
              className="incoming-state__button"
              type="button"
              onClick={openModal}
            >
              <ClipboardPaste
                size={18}
              />

              Занести написавших
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="incoming-results">
            Найдено:{" "}
            <strong>
              {
                filteredResponses.length
              }
            </strong>
          </div>

          <section className="incoming-grid">
            {filteredResponses.map(
              (response) => (
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
                          <UserRound
                            size={20}
                          />
                        )}
                      </div>

                      <div>
                        <span>
                          Ответивший
                          пользователь
                        </span>

                        <h2>
                          {getContactIdentifier(
                            response
                          )}
                        </h2>

                        {response.full_name && (
                          <p>
                            {
                              response.full_name
                            }
                          </p>
                        )}
                      </div>
                    </div>

                    <span className="incoming-card__status">
                      <CheckCircle2
                        size={14}
                      />
                      Ответил
                    </span>
                  </div>

                  <div className="incoming-card__details">
                    <DetailItem
                      label="Получен ответ"
                      value={formatDate(
                        response.responded_at
                      )}
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

                    <DetailItem
                      label="Рассылка"
                      value={
                        response.mailing
                          ?.name ||
                        "Не указана"
                      }
                    />

                    <DetailItem
                      label="Менеджер"
                      value={
                        response.manager
                          ?.full_name ||
                        (isManager
                          ? "Вы"
                          : "Не указан")
                      }
                    />
                  </div>

                  <div className="incoming-card__actions">
                    {response.application_created_at ? (
                      <div className="incoming-application-created">
                        <CheckCircle2
                          size={17}
                        />

                        <div>
                          <strong>
                            Есть заявка
                          </strong>

                          <span>
                            По контакту уже
                            создана заявка
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="incoming-application-created incoming-application-created--pending">
                        <Clock3 size={17} />

                        <div>
                          <strong>
                            Заявка не создана
                          </strong>

                          <span>
                            Создать её можно
                            в разделе "Мои
                            контакты"
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              )
            )}
          </section>
        </>
      )}

      {isManager && (
        <button
          className="incoming-floating-button"
          type="button"
          aria-label="Занести написавших"
          onClick={openModal}
        >
          <ClipboardPaste
            size={24}
          />
        </button>
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
          <section
            className="incoming-modal incoming-modal--bulk"
            role="dialog"
            aria-modal="true"
            aria-labelledby="incoming-modal-title"
          >
            <div className="incoming-modal__header">
              <div>
                <span>
                  Массовое добавление
                </span>

                <h2 id="incoming-modal-title">
                  Занести написавших
                </h2>

                <p>
                  Вставьте Telegram-ники
                  или номера пользователей,
                  которые вам написали.
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
                <span>
                  Ники и номера
                </span>

                <div className="incoming-textarea">
                  <ClipboardPaste
                    size={19}
                  />

                  <textarea
                    value={
                      identifiersValue
                    }
                    onChange={(event) => {
                      setIdentifiersValue(
                        event.target.value
                      );

                      setFormError("");
                      setResult(null);
                    }}
                    placeholder={`@username_one
@username_two
+79991234567
79997654321`}
                    rows={9}
                    autoFocus
                    disabled={saving}
                  />
                </div>
              </label>

              <div className="incoming-response-form__hint">
                Каждый ник или номер
                вводите с новой строки.
                Также поддерживаются
                запятые и точки с запятой.
              </div>

              {formError && (
                <div className="incoming-modal__error">
                  <XCircle size={18} />
                  <span>{formError}</span>
                </div>
              )}

              {result && (
                <BulkResult
                  result={result}
                />
              )}

              <div className="incoming-modal__actions">
                <button
                  className="incoming-modal__cancel"
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                >
                  {result
                    ? "Закрыть"
                    : "Отмена"}
                </button>

                <button
                  className="incoming-modal__submit"
                  type="submit"
                  disabled={
                    saving ||
                    !identifiersValue.trim()
                  }
                >
                  <CheckCircle2
                    size={18}
                  />

                  {saving
                    ? "Проверяем..."
                    : result
                      ? "Проверить ещё раз"
                      : "Занести написавших"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function BulkResult({ result }) {
  const summary =
    result?.summary || {};

  return (
    <div className="incoming-bulk-result">
      <div className="incoming-bulk-result__heading">
        <CheckCircle2 size={20} />

        <div>
          <strong>
            Обработка завершена
          </strong>

          <span>
            Проверено:{" "}
            {summary.total || 0}
          </span>
        </div>
      </div>

      <div className="incoming-bulk-result__grid">
        <ResultItem
          title="Найдено"
          value={summary.found || 0}
          variant="success"
        />

        <ResultItem
          title="Уже внесено вами"
          value={
            summary.alreadyResponded ||
            0
          }
        />

        <ResultItem
          title="У другого менеджера"
          value={
            summary.conflicts || 0
          }
          variant="warning"
        />

        <ResultItem
          title="Не найдено"
          value={summary.notFound || 0}
          variant="error"
        />

        <ResultItem
          title="Ошибки"
          value={summary.failed || 0}
          variant="error"
        />
      </div>

      {result.notFound?.length >
        0 && (
        <ResultList
          icon={Search}
          title="Не найдены в базе"
          items={result.notFound.map(
            (item) =>
              item.identifier
          )}
        />
      )}

      {result.conflicts?.length >
        0 && (
        <ResultList
          icon={AlertTriangle}
          title="Уже закреплены за другим менеджером"
          items={result.conflicts.map(
            (item) =>
              item.identifier
          )}
        />
      )}

      {result.failed?.length >
        0 && (
        <ResultList
          icon={XCircle}
          title="Не удалось обработать"
          items={result.failed.map(
            (item) =>
              `${item.identifier}: ${item.error}`
          )}
        />
      )}
    </div>
  );
}

function ResultItem({
  title,
  value,
  variant = "",
}) {
  return (
    <div
      className={[
        "incoming-bulk-result__item",
        variant
          ? `incoming-bulk-result__item--${variant}`
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ResultList({
  icon: Icon,
  title,
  items,
}) {
  return (
    <div className="incoming-bulk-result__list">
      <div>
        <Icon size={16} />
        <strong>{title}</strong>
      </div>

      <ul>
        {items.map(
          (item, index) => (
            <li
              key={`${item}-${index}`}
            >
              {item}
            </li>
          )
        )}
      </ul>
    </div>
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

function DetailItem({
  label,
  value,
}) {
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
    return formatPhone(
      contact.phone
    );
  }

  return (
    contact?.full_name ||
    "Без данных"
  );
}

function formatTelegramUsername(value) {
  if (!value) {
    return "Telegram не указан";
  }

  const username =
    String(value).trim();

  return username.startsWith("@")
    ? username
    : `@${username}`;
}

function formatPhone(value) {
  const digits = String(
    value || ""
  ).replace(/\D/g, "");

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

  return (
    value ||
    "Номер не указан"
  );
}

function formatDate(value) {
  if (!value) {
    return "Не указано";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
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

function isToday(value) {
  if (!value) {
    return false;
  }

  const date =
    new Date(value);

  const today =
    new Date();

  return (
    date.getFullYear() ===
      today.getFullYear() &&
    date.getMonth() ===
      today.getMonth() &&
    date.getDate() ===
      today.getDate()
  );
}