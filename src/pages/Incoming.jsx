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
  RotateCcw,
  Search,
  Send,
  Trash2,
  UserRound,
  Users,
  X,
  XCircle,
} from "lucide-react";

import { supabase } from "../lib/supabase";

import {
  useAuth,
} from "../context/AuthContext";

import {
  incomingResponseService,
} from "../services/incomingResponseService";

import "../styles/Incoming.css";

export default function Incoming() {
  const { profile, user } = useAuth();

  const currentProfile =
    profile || user;

  const [responses, setResponses] =
    useState([]);

  const [search, setSearch] =
    useState("");

  const [
    identifiersValue,
    setIdentifiersValue,
  ] = useState("");

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

  const [
    contactActionId,
    setContactActionId,
  ] = useState(null);

  const isManager =
    currentProfile?.role === "manager";

  /*
   * =====================================================
   * ЗАГРУЗКА КОНТАКТОВ
   * =====================================================
   */

  const loadResponses = useCallback(
    async (showLoader = true) => {
      if (!currentProfile?.id) {
        if (showLoader) {
          setLoading(false);
        }

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
            "Не удалось загрузить входящие контакты"
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

  /*
   * =====================================================
   * REALTIME
   * =====================================================
   */

  useEffect(() => {
    if (!currentProfile?.id) {
      return undefined;
    }

    let reloadTimer = null;

    const channel = supabase
      .channel(
        `incoming-responses-${
          currentProfile.id
        }`
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table:
            "mailing_contacts",
        },
        () => {
          clearTimeout(
            reloadTimer
          );

          reloadTimer =
            window.setTimeout(
              () => {
                loadResponses(
                  false
                );
              },
              350
            );
        }
      )
      .subscribe();

    return () => {
      clearTimeout(
        reloadTimer
      );

      supabase.removeChannel(
        channel
      );
    };
  }, [
    currentProfile?.id,
    loadResponses,
  ]);

  /*
   * =====================================================
   * МОДАЛКА ДОБАВЛЕНИЯ
   * =====================================================
   */

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

  /*
   * =====================================================
   * ДОБАВЛЕНИЕ НАПИСАВШИХ
   * =====================================================
   */

  async function handleSubmit(
    event
  ) {
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
      parsedIdentifiers.length ===
      0
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
          value:
            identifiersValue,

          managerId:
            currentProfile.id,
        });

    if (registerResult.error) {
      console.error(
        "Ошибка регистрации входящих:",
        registerResult.error
      );

      setFormError(
        registerResult.error
          .message ||
          "Не удалось обработать список"
      );

      setSaving(false);

      return;
    }

    setResult(
      registerResult.data
    );

    await loadResponses(
      false
    );

    setSaving(false);
  }

  /*
   * =====================================================
   * УДАЛЕНИЕ ВНЕШНЕГО КОНТАКТА
   * =====================================================
   */

  async function handleDeleteExternalContact(
    contact
  ) {
    if (
      !contact?.id ||
      !currentProfile?.id
    ) {
      return;
    }

    const identifier =
      getContactIdentifier(
        contact
      );

    const confirmed =
      window.confirm(
        `Удалить ошибочно внесённый контакт "${identifier}"?\n\nКонтакт будет полностью удалён из CRM.`
      );

    if (!confirmed) {
      return;
    }

    setContactActionId(
      contact.id
    );

    setError("");

    const deleteResult =
      await incomingResponseService
        .deleteExternalResponse({
          contactId:
            contact.id,

          managerId:
            currentProfile.id,
        });

    if (deleteResult.error) {
      console.error(
        "Ошибка удаления контакта:",
        deleteResult.error
      );

      setError(
        deleteResult.error
          .message ||
          "Не удалось удалить контакт"
      );

      setContactActionId(
        null
      );

      return;
    }

    await loadResponses(
      false
    );

    setContactActionId(
      null
    );
  }

  /*
   * =====================================================
   * ОТМЕНА ОТВЕТА ИЗ РАССЫЛКИ
   * =====================================================
   */

  async function handleUndoMailingResponse(
    contact
  ) {
    if (
      !contact?.id ||
      !currentProfile?.id
    ) {
      return;
    }

    const identifier =
      getContactIdentifier(
        contact
      );

    const confirmed =
      window.confirm(
        `Отменить отметку ответа для "${identifier}"?\n\nКонтакт НЕ будет удалён из рассылки. Он снова станет неответившим и отвяжется от вас.`
      );

    if (!confirmed) {
      return;
    }

    setContactActionId(
      contact.id
    );

    setError("");

    const undoResult =
      await incomingResponseService
        .undoMailingResponse({
          contactId:
            contact.id,

          managerId:
            currentProfile.id,
        });

    if (undoResult.error) {
      console.error(
        "Ошибка отмены ответа:",
        undoResult.error
      );

      setError(
        undoResult.error
          .message ||
          "Не удалось отменить отметку ответа"
      );

      setContactActionId(
        null
      );

      return;
    }

    await loadResponses(
      false
    );

    setContactActionId(
      null
    );
  }

  /*
   * =====================================================
   * ПОИСК
   * =====================================================
   */

  const filteredResponses =
    useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLowerCase();

      if (!normalizedSearch) {
        return responses;
      }

      return responses.filter(
        (response) => {
          const isExternal =
            Boolean(
              response.is_external
            ) ||
            response.source ===
              "external" ||
            !response.mailing_id;

          const searchableValue = [
            response
              .telegram_username,

            response.full_name,

            response.phone,

            response.status,

            response.source,

            isExternal
              ? "вне рассылки внешний входящий"
              : "рассылка",

            response.mailing
              ?.name,

            response.manager
              ?.full_name,

            response.manager
              ?.email,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return searchableValue
            .includes(
              normalizedSearch
            );
        }
      );
    }, [
      responses,
      search,
    ]);

  /*
   * =====================================================
   * СТАТИСТИКА
   * =====================================================
   */

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

    const uniqueManagers =
      new Set(
        responses
          .map(
            (response) =>
              response.manager_id
          )
          .filter(Boolean)
      ).size;

    const external =
      responses.filter(
        (response) =>
          Boolean(
            response.is_external
          ) ||
          response.source ===
            "external" ||
          !response.mailing_id
      ).length;

    return {
      total:
        responses.length,

      today:
        respondedToday,

      withApplications,

      managers:
        uniqueManagers,

      external,
    };
  }, [responses]);

  /*
   * =====================================================
   * СТРАНИЦА
   * =====================================================
   */

  return (
    <main className="incoming-page">
      <section className="incoming-heading">
        <div>
          <span className="incoming-heading__eyebrow">
            Входящие контакты
          </span>

          <h1>
            {isManager
              ? "Отметить написавших"
              : "Входящий поток"}
          </h1>

          <p>
            {isManager
              ? "Вставьте Telegram-ники или номера всех пользователей, которые вам написали. CRM сама найдёт совпадения в рассылках, а тех, кого в базе нет, автоматически добавит как новые входящие контакты."
              : "Здесь отображаются все пользователи, которых менеджеры внесли как написавших: как из рассылок, так и пришедшие извне."}
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

            <span>
              Обновить
            </span>
          </button>

          {isManager && (
            <button
              className="incoming-add-button"
              type="button"
              onClick={
                openModal
              }
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

      {/* =================================================
          СТАТИСТИКА
      ================================================= */}

      <section className="incoming-stats">
        <StatCard
          icon={Inbox}
          title="Всего написавших"
          value={
            stats.total
          }
        />

        <StatCard
          icon={CheckCircle2}
          title="Написали сегодня"
          value={
            stats.today
          }
          variant="success"
        />

        <StatCard
          icon={ListChecks}
          title="Создано заявок"
          value={
            stats.withApplications
          }
          variant="warning"
        />

        {isManager ? (
          <StatCard
            icon={UserRound}
            title="Вне рассылки"
            value={
              stats.external
            }
            variant="blue"
          />
        ) : (
          <StatCard
            icon={Users}
            title="Менеджеров"
            value={
              stats.managers
            }
            variant="blue"
          />
        )}
      </section>

      {/* =================================================
          ПОИСК
      ================================================= */}

      <section className="incoming-toolbar">
        <div className="incoming-search">
          <Search size={19} />

          <input
            type="search"
            placeholder="Telegram, имя, телефон, рассылка или источник"
            value={search}
            onChange={(
              event
            ) =>
              setSearch(
                event.target
                  .value
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

      {/* =================================================
          ОШИБКА
      ================================================= */}

      {error && (
        <div className="incoming-alert incoming-alert--error">
          <XCircle
            size={18}
          />

          <span>
            {error}
          </span>
        </div>
      )}

      {/* =================================================
          КОНТЕНТ
      ================================================= */}

      {loading ? (
        <div className="incoming-state">
          <div className="incoming-loader" />

          <strong>
            Загружаем входящие
          </strong>

          <span>
            Получаем актуальные
            данные из CRM.
          </span>
        </div>
      ) : filteredResponses.length ===
        0 ? (
        <div className="incoming-state">
          <Inbox size={42} />

          <strong>
            {search
              ? "Контакты не найдены"
              : "Написавших пока нет"}
          </strong>

          <span>
            {search
              ? "Измените поисковый запрос."
              : isManager
                ? "Нажмите \"Занести написавших\" и вставьте всех пользователей, которые вам написали. Неважно, участвовали они в рассылке или нет."
                : "Менеджеры ещё не внесли входящие контакты."}
          </span>

          {!search &&
            isManager && (
              <button
                className="incoming-state__button"
                type="button"
                onClick={
                  openModal
                }
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
              (response) => {
                const isExternal =
                  Boolean(
                    response.is_external
                  ) ||
                  response.source ===
                    "external" ||
                  !response.mailing_id;

                const hasApplication =
                  Boolean(
                    response
                      .application_created_at
                  );

                const actionLoading =
                  contactActionId ===
                  response.id;

                return (
                  <article
                    className={[
                      "incoming-card",

                      isExternal
                        ? "incoming-card--external"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={
                      response.id
                    }
                  >
                    {/* TOP */}

                    <div className="incoming-card__top">
                      <div className="incoming-card__identity">
                        <div className="incoming-card__avatar">
                          {response.telegram_username ? (
                            <Send
                              size={20}
                            />
                          ) : (
                            <UserRound
                              size={20}
                            />
                          )}
                        </div>

                        <div>
                          <span>
                            {isExternal
                              ? "Входящий вне рассылки"
                              : "Ответил на рассылку"}
                          </span>

                          <h2>
                            {getContactIdentifier(
                              response
                            )}
                          </h2>

                          {response.full_name &&
                            !isIdentifierAsName(
                              response
                                .full_name,
                              response
                            ) && (
                              <p>
                                {
                                  response.full_name
                                }
                              </p>
                            )}
                        </div>
                      </div>

                      <span
                        className={[
                          "incoming-card__status",

                          isExternal
                            ? "incoming-card__status--external"
                            : "",
                        ]
                          .filter(
                            Boolean
                          )
                          .join(
                            " "
                          )}
                      >
                        {isExternal ? (
                          <UserRound
                            size={14}
                          />
                        ) : (
                          <CheckCircle2
                            size={14}
                          />
                        )}

                        {isExternal
                          ? "Вне рассылки"
                          : "Совпадение найдено"}
                      </span>
                    </div>

                    {/* DETAILS */}

                    <div className="incoming-card__details">
                      <DetailItem
                        label="Получен входящий"
                        value={formatDate(
                          response
                            .responded_at
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
                        label="Источник"
                        value={
                          isExternal
                            ? "Вне рассылки"
                            : response
                                .mailing
                                ?.name ||
                              "Рассылка"
                        }
                      />

                      <DetailItem
                        label="Менеджер"
                        value={
                          response
                            .manager
                            ?.full_name ||
                          (isManager
                            ? "Вы"
                            : "Не указан")
                        }
                      />
                    </div>

                    {/* APPLICATION */}

                    <div className="incoming-card__actions">
                      {hasApplication ? (
                        <div className="incoming-application-created">
                          <CheckCircle2
                            size={17}
                          />

                          <div>
                            <strong>
                              Есть заявка
                            </strong>

                            <span>
                              По контакту
                              уже создана
                              заявка
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="incoming-application-created incoming-application-created--pending">
                          <Clock3
                            size={17}
                          />

                          <div>
                            <strong>
                              Заявка не создана
                            </strong>

                            <span>
                              Создать её
                              можно в разделе
                              "Мои контакты"
                            </span>
                          </div>
                        </div>
                      )}

                      {/* DELETE / UNDO */}

                      {isManager && (
                        <div className="incoming-card__manage-actions">
                          {isExternal ? (
                            <button
                              type="button"
                              className="incoming-card__danger-action"
                              disabled={
                                actionLoading
                              }
                              onClick={() =>
                                handleDeleteExternalContact(
                                  response
                                )
                              }
                            >
                              <Trash2
                                size={16}
                              />

                              {actionLoading
                                ? "Удаляем..."
                                : "Удалить ошибочно внесённого"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="incoming-card__undo-action"
                              disabled={
                                actionLoading
                              }
                              onClick={() =>
                                handleUndoMailingResponse(
                                  response
                                )
                              }
                            >
                              <RotateCcw
                                size={16}
                              />

                              {actionLoading
                                ? "Отменяем..."
                                : "Отменить отметку ответа"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              }
            )}
          </section>
        </>
      )}

      {/* =================================================
          МОБИЛЬНАЯ ПЛАВАЮЩАЯ КНОПКА
      ================================================= */}

      {isManager && (
        <button
          className="incoming-floating-button"
          type="button"
          aria-label="Занести написавших"
          onClick={
            openModal
          }
        >
          <ClipboardPaste
            size={24}
          />
        </button>
      )}

      {/* =================================================
          МОДАЛКА
      ================================================= */}

      {modalOpen && (
        <div
          className="incoming-modal-overlay"
          onMouseDown={(
            event
          ) => {
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
                  Единое добавление
                </span>

                <h2 id="incoming-modal-title">
                  Занести написавших
                </h2>

                <p>
                  Вставьте всех
                  пользователей,
                  которые вам написали.
                  CRM сама определит,
                  есть ли они в базе
                  рассылок.
                </p>
              </div>

              <button
                className="incoming-modal__close"
                type="button"
                aria-label="Закрыть"
                onClick={
                  closeModal
                }
                disabled={
                  saving
                }
              >
                <X size={21} />
              </button>
            </div>

            <form
              className="incoming-response-form"
              onSubmit={
                handleSubmit
              }
            >
              <label className="incoming-modal__field">
                <span>
                  Telegram-ники и номера
                </span>

                <div className="incoming-textarea">
                  <ClipboardPaste
                    size={19}
                  />

                  <textarea
                    value={
                      identifiersValue
                    }
                    onChange={(
                      event
                    ) => {
                      setIdentifiersValue(
                        event.target
                          .value
                      );

                      setFormError(
                        ""
                      );

                      setResult(
                        null
                      );
                    }}
                    placeholder={`@username_one
@username_two
+79991234567
79997654321`}
                    rows={9}
                    autoFocus
                    disabled={
                      saving
                    }
                  />
                </div>
              </label>

              <div className="incoming-response-form__hint">
                <strong>
                  Как это работает:
                </strong>{" "}
                если пользователь
                найден в базе
                рассылки — CRM
                свяжет его с ней.
                Если совпадения
                нет — контакт
                автоматически
                добавится как
                "Вне рассылки".
              </div>

              <div className="incoming-response-form__hint">
                Каждый ник или номер
                вводите с новой строки.
                Также поддерживаются
                запятые и точки с
                запятой.
              </div>

              {formError && (
                <div className="incoming-modal__error">
                  <XCircle
                    size={18}
                  />

                  <span>
                    {formError}
                  </span>
                </div>
              )}

              {result && (
                <BulkResult
                  result={
                    result
                  }
                />
              )}

              <div className="incoming-modal__actions">
                <button
                  className="incoming-modal__cancel"
                  type="button"
                  onClick={
                    closeModal
                  }
                  disabled={
                    saving
                  }
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
                    !identifiersValue
                      .trim()
                  }
                >
                  <CheckCircle2
                    size={18}
                  />

                  {saving
                    ? "Обрабатываем..."
                    : result
                      ? "Добавить ещё"
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

/*
 * =========================================================
 * РЕЗУЛЬТАТ МАССОВОГО ДОБАВЛЕНИЯ
 * =========================================================
 */

function BulkResult({
  result,
}) {
  const summary =
    result?.summary || {};

  const hasConflicts =
    (
      result?.conflicts
        ?.length || 0
    ) > 0;

  const hasFailed =
    (
      result?.failed
        ?.length || 0
    ) > 0;

  return (
    <div className="incoming-bulk-result">
      <div className="incoming-bulk-result__heading">
        <CheckCircle2
          size={20}
        />

        <div>
          <strong>
            Обработка завершена
          </strong>

          <span>
            Проверено:{" "}
            {summary.total ||
              0}
          </span>
        </div>
      </div>

      <div className="incoming-bulk-result__grid">
        <ResultItem
          title="Найдены в рассылках"
          value={
            summary.found ||
            0
          }
          variant="success"
        />

        <ResultItem
          title="Добавлены вне рассылки"
          value={
            summary
              .createdExternal ||
            summary
              .externalCreated ||
            0
          }
          variant="blue"
        />

        <ResultItem
          title="Уже были внесены"
          value={
            summary
              .alreadyResponded ||
            0
          }
        />

        <ResultItem
          title="У другого менеджера"
          value={
            summary.conflicts ||
            0
          }
          variant="warning"
        />

        <ResultItem
          title="Ошибки"
          value={
            summary.failed ||
            0
          }
          variant={
            summary.failed > 0
              ? "error"
              : ""
          }
        />
      </div>

      {result
        .createdExternal
        ?.length > 0 && (
        <ResultList
          icon={UserRound}
          title="Автоматически добавлены как новые входящие"
          items={
            result
              .createdExternal
              .map(
                (item) =>
                  item.identifier
              )
          }
          variant="success"
        />
      )}

      {result.found?.length >
        0 && (
        <ResultList
          icon={CheckCircle2}
          title="Совпадения найдены в рассылках"
          items={
            result.found.map(
              (item) =>
                item.identifier
            )
          }
          variant="success"
        />
      )}

      {result
        .alreadyResponded
        ?.length > 0 && (
        <ResultList
          icon={Clock3}
          title="Уже были внесены ранее"
          items={
            result
              .alreadyResponded
              .map(
                (item) =>
                  item.identifier
              )
          }
        />
      )}

      {hasConflicts && (
        <ResultList
          icon={
            AlertTriangle
          }
          title="Уже закреплены за другим менеджером"
          items={
            result.conflicts.map(
              (item) =>
                item.identifier
            )
          }
          variant="warning"
        />
      )}

      {hasFailed && (
        <ResultList
          icon={XCircle}
          title="Не удалось обработать"
          items={
            result.failed.map(
              (item) =>
                `${item.identifier}: ${item.error}`
            )
          }
          variant="error"
        />
      )}

      {!hasFailed &&
        !hasConflicts && (
          <div className="incoming-bulk-result__success-message">
            <CheckCircle2
              size={17}
            />

            <span>
              Все контакты
              обработаны.
              Пользователи,
              которых не было
              в рассылках,
              автоматически
              добавлены как
              новые входящие.
            </span>
          </div>
        )}
    </div>
  );
}

/*
 * =========================================================
 * РЕЗУЛЬТАТ
 * =========================================================
 */

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
      <span>
        {title}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}

/*
 * =========================================================
 * СПИСОК РЕЗУЛЬТАТОВ
 * =========================================================
 */

function ResultList({
  icon: Icon,
  title,
  items,
  variant = "",
}) {
  return (
    <div
      className={[
        "incoming-bulk-result__list",

        variant
          ? `incoming-bulk-result__list--${variant}`
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div>
        <Icon size={16} />

        <strong>
          {title}
        </strong>
      </div>

      <ul>
        {items.map(
          (
            item,
            index
          ) => (
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

/*
 * =========================================================
 * КАРТОЧКА СТАТИСТИКИ
 * =========================================================
 */

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
        <span>
          {title}
        </span>

        <strong>
          {value}
        </strong>
      </div>
    </article>
  );
}

/*
 * =========================================================
 * ДЕТАЛЬ КАРТОЧКИ
 * =========================================================
 */

function DetailItem({
  label,
  value,
}) {
  return (
    <div className="incoming-card__detail">
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}

/*
 * =========================================================
 * ИДЕНТИФИКАТОР КОНТАКТА
 * =========================================================
 */

function getContactIdentifier(
  contact
) {
  if (
    contact?.telegram_username
  ) {
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

/*
 * Проверяем, не записан ли
 * автоматически Telegram/телефон
 * в full_name.
 */
function isIdentifierAsName(
  fullName,
  contact
) {
  if (!fullName) {
    return false;
  }

  const normalizedName =
    String(fullName)
      .trim()
      .toLowerCase();

  const telegram =
    contact?.telegram_username
      ? formatTelegramUsername(
          contact
            .telegram_username
        ).toLowerCase()
      : "";

  const phone =
    contact?.phone
      ? String(
          contact.phone
        ).replace(
          /\D/g,
          ""
        )
      : "";

  const normalizedNamePhone =
    normalizedName.replace(
      /\D/g,
      ""
    );

  return (
    normalizedName ===
      telegram ||
    (
      Boolean(phone) &&
      normalizedNamePhone ===
        phone
    )
  );
}

/*
 * =========================================================
 * TELEGRAM
 * =========================================================
 */

function formatTelegramUsername(
  value
) {
  if (!value) {
    return "Telegram не указан";
  }

  const username =
    String(value)
      .trim()
      .replace(
        /^https?:\/\/t\.me\//i,
        ""
      )
      .replace(
        /^t\.me\//i,
        ""
      )
      .replace(
        /^@+/,
        ""
      );

  return username
    ? `@${username}`
    : "Telegram не указан";
}

/*
 * =========================================================
 * ТЕЛЕФОН
 * =========================================================
 */

function formatPhone(value) {
  const digits =
    String(
      value || ""
    ).replace(
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
    digits.length === 10
  ) {
    return formatPhone(
      `7${digits}`
    );
  }

  if (
    digits.length === 11 &&
    digits.startsWith("7")
  ) {
    return (
      `+7 ${digits.slice(
        1,
        4
      )} ${digits.slice(
        4,
        7
      )}-${digits.slice(
        7,
        9
      )}-${digits.slice(9)}`
    );
  }

  return (
    value ||
    "Номер не указан"
  );
}

/*
 * =========================================================
 * ДАТА
 * =========================================================
 */

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

/*
 * =========================================================
 * СЕГОДНЯ
 * =========================================================
 */

function isToday(value) {
  if (!value) {
    return false;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return false;
  }

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