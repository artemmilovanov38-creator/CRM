import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FilePenLine,
  FileText,
  Filter,
  MailPlus,
  MessageCircleReply,
  Pencil,
  Search,
  Send,
  TrendingUp,
  Users,
} from "lucide-react";

import ImportContactsModal from "../components/mailings/ImportContactsModal";

import { mailingService } from "../services/mailingService";
import { profileService } from "../services/profileService";

import "../styles/Mailings.css";

const statusConfig = {
  draft: {
    title: "Черновик",
    className: "mailing-status--draft",
  },
  processing: {
    title: "Обработка базы",
    className: "mailing-status--processing",
  },
  ready: {
    title: "Готова",
    className: "mailing-status--ready",
  },
  active: {
    title: "Активна",
    className: "mailing-status--active",
  },
  paused: {
    title: "Приостановлена",
    className: "mailing-status--paused",
  },
  completed: {
    title: "Завершена",
    className: "mailing-status--completed",
  },
};

const initialMailingForm = {
  name: "",
  supplier: "",
  purchase_cost: "",
  mailing_method: "Telegram",
  status: "draft",
  comment: "",
  started_at: "",
};

export default function Mailings() {
  const navigate = useNavigate();

  const [mailingsData, setMailingsData] =
    useState([]);

  const [managers, setManagers] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [loadError, setLoadError] =
    useState("");

  const [searchValue, setSearchValue] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [channelFilter, setChannelFilter] =
    useState("all");

  const [sortValue, setSortValue] =
    useState("date");

  const [importMailing, setImportMailing] =
    useState(null);

  const [editingMailing, setEditingMailing] =
    useState(null);

  const [isModalOpen, setIsModalOpen] =
    useState(false);

  const [mailingForm, setMailingForm] =
    useState(initialMailingForm);

  const [isSaving, setIsSaving] =
    useState(false);

  const [formError, setFormError] =
    useState("");

  const loadMailings = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    const { data, error } =
      await mailingService.getMailings();

    if (error) {
      console.error(
        "Ошибка загрузки рассылок:",
        error
      );

      setLoadError(
        error.message ||
          "Не удалось загрузить рассылки"
      );

      setMailingsData([]);
      setLoading(false);
      return;
    }

    setMailingsData(data || []);
    setLoading(false);
  }, []);

  const loadManagers = useCallback(async () => {
    const { data, error } =
      await profileService.getManagers();

    if (error) {
      console.error(
        "Ошибка загрузки менеджеров:",
        error
      );

      setManagers([]);
      return;
    }

    setManagers(data || []);
  }, []);

  useEffect(() => {
    loadMailings();
    loadManagers();
  }, [
    loadMailings,
    loadManagers,
  ]);

  const preparedMailings = useMemo(() => {
    const search = searchValue
      .trim()
      .toLowerCase();

    const filtered = mailingsData.filter(
      (mailing) => {
        const searchableValue = [
          mailing.title,
          mailing.name,
          mailing.channel,
          mailing.mailing_method,
          mailing.source,
          mailing.supplier,
          getManagerName(mailing.manager),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const matchesSearch =
          !search ||
          searchableValue.includes(search);

        const matchesStatus =
          statusFilter === "all" ||
          mailing.status === statusFilter;

        const mailingChannel =
          mailing.channel ||
          mailing.mailing_method ||
          "";

        const matchesChannel =
          channelFilter === "all" ||
          mailingChannel === channelFilter;

        return (
          matchesSearch &&
          matchesStatus &&
          matchesChannel
        );
      }
    );

    return [...filtered].sort(
      (first, second) => {
        if (sortValue === "uploaded") {
          return (
            toNumber(second.uploaded) -
            toNumber(first.uploaded)
          );
        }

        if (sortValue === "replies") {
          return (
            toNumber(second.replied) -
            toNumber(first.replied)
          );
        }

        if (
          sortValue === "applications"
        ) {
          return (
            toNumber(second.applications) -
            toNumber(first.applications)
          );
        }

        if (sortValue === "openings") {
          return (
            toNumber(second.openings) -
            toNumber(first.openings)
          );
        }

        if (sortValue === "conversion") {
          return (
            getConversion(
              second.openings,
              second.uploaded
            ) -
            getConversion(
              first.openings,
              first.uploaded
            )
          );
        }

        return (
          new Date(
            second.created_at || 0
          ).getTime() -
          new Date(
            first.created_at || 0
          ).getTime()
        );
      }
    );
  }, [
    mailingsData,
    searchValue,
    statusFilter,
    channelFilter,
    sortValue,
  ]);

  const totals = useMemo(() => {
    return mailingsData.reduce(
      (result, mailing) => {
        result.campaigns += 1;

        result.uploaded +=
          toNumber(mailing.uploaded);

        result.delivered +=
          toNumber(mailing.delivered);

        result.replied +=
          toNumber(mailing.replied);

        result.applications +=
          toNumber(mailing.applications);

        result.openings +=
          toNumber(mailing.openings);

        if (mailing.status === "active") {
          result.active += 1;
        }

        return result;
      },
      {
        campaigns: 0,
        active: 0,
        uploaded: 0,
        delivered: 0,
        replied: 0,
        applications: 0,
        openings: 0,
      }
    );
  }, [mailingsData]);

  function openCreateModal() {
    setEditingMailing(null);
    setMailingForm(initialMailingForm);
    setFormError("");
    setIsModalOpen(true);
  }

  function openEditModal(mailing) {
    setEditingMailing(mailing);

    setMailingForm({
      name:
        mailing.name ||
        mailing.title ||
        "",

      supplier:
        mailing.supplier ||
        mailing.source ||
        "",

      purchase_cost:
        mailing.purchase_cost ??
        "",

      mailing_method:
        mailing.mailing_method ||
        mailing.channel ||
        "Telegram",

      status:
        mailing.status ||
        "draft",

      comment:
        mailing.comment ||
        "",

      started_at:
        formatDateTimeLocal(
          mailing.started_at
        ),
    });

    setFormError("");
    setIsModalOpen(true);
  }

  function closeModal() {
    if (isSaving) {
      return;
    }

    setIsModalOpen(false);
    setEditingMailing(null);
    setMailingForm(initialMailingForm);
    setFormError("");
  }

  function handleFormChange(event) {
    const { name, value } =
      event.target;

    setMailingForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function validateForm() {
    if (!mailingForm.name.trim()) {
      return "Укажи название партии.";
    }

    if (!mailingForm.supplier.trim()) {
      return "Укажи поставщика лидов.";
    }

    if (
      mailingForm.purchase_cost === "" ||
      !Number.isFinite(
        Number(mailingForm.purchase_cost)
      ) ||
      Number(
        mailingForm.purchase_cost
      ) < 0
    ) {
      return "Укажи корректную стоимость закупки.";
    }

    if (!mailingForm.mailing_method) {
      return "Выбери метод рассылки.";
    }

    return "";
  }

  async function handleSubmitMailing(
    event
  ) {
    event.preventDefault();

    const validationError =
      validateForm();

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSaving(true);
    setFormError("");

    const payload = {
      name: mailingForm.name.trim(),

      supplier:
        mailingForm.supplier.trim(),

      purchase_cost: Number(
        mailingForm.purchase_cost
      ),

      mailing_method:
        mailingForm.mailing_method,

      status:
        mailingForm.status,

      comment:
        mailingForm.comment.trim() ||
        null,

      started_at:
        mailingForm.started_at
          ? new Date(
              mailingForm.started_at
            ).toISOString()
          : null,
    };

    let result;

    if (editingMailing) {
      if (
        typeof mailingService
          .updateMailing !== "function"
      ) {
        setFormError(
          "В mailingService отсутствует метод updateMailing."
        );

        setIsSaving(false);
        return;
      }

      result =
        await mailingService.updateMailing(
          editingMailing.id,
          payload
        );
    } else {
      result =
        await mailingService.createMailing({
          ...payload,
          total_leads: 0,
          telegram_found_count: 0,
          telegram_not_found_count: 0,
          distributed_count: 0,
          sent_count: 0,
          responded_count: 0,
          applications_count: 0,
          openings_count: 0,
        });
    }

    if (result.error) {
      console.error(
        editingMailing
          ? "Ошибка редактирования рассылки:"
          : "Ошибка создания рассылки:",
        result.error
      );

      setFormError(
        result.error.message ||
          (editingMailing
            ? "Не удалось сохранить изменения."
            : "Не удалось создать рассылку.")
      );

      setIsSaving(false);
      return;
    }

    await loadMailings();

    setIsSaving(false);
    closeModal();
  }

  async function handleContactsImported() {
    await loadMailings();
  }

  const totalReplyConversion =
    getConversion(
      totals.replied,
      totals.delivered
    );

  const totalOpeningConversion =
    getConversion(
      totals.openings,
      totals.uploaded
    );

  if (loading) {
    return (
      <main className="page">
        <div className="empty-search">
          <h2>
            Загружаем рассылки...
          </h2>

          <p>
            Получаем данные из Supabase.
          </p>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="page">
        <div className="empty-search">
          <h2>
            Не удалось загрузить рассылки
          </h2>

          <p>{loadError}</p>

          <button
            className="primary-button"
            type="button"
            onClick={loadMailings}
          >
            Повторить
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Рассылки
          </h1>

          <p className="page-description">
            Управление партиями,
            контактами, распределением и
            аналитикой.
          </p>
        </div>

        <div className="page-header-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={loadMailings}
          >
            Обновить
          </button>

          <button
            className="primary-button button-with-icon"
            type="button"
            onClick={openCreateModal}
          >
            <MailPlus size={17} />
            Создать партию
          </button>
        </div>
      </div>

      <section className="mailings-summary-grid">
        <SummaryCard
          icon={Send}
          title="Всего рассылок"
          value={totals.campaigns}
          description={`${totals.active} активных сейчас`}
        />

        <SummaryCard
          icon={Users}
          iconClass="mailings-summary-icon--purple"
          title="Загружено контактов"
          value={formatNumber(
            totals.uploaded
          )}
          description={`Доставлено: ${formatNumber(
            totals.delivered
          )}`}
        />

        <SummaryCard
          icon={MessageCircleReply}
          iconClass="mailings-summary-icon--orange"
          title="Ответили"
          value={formatNumber(
            totals.replied
          )}
          description={`Конверсия: ${totalReplyConversion}%`}
        />

        <SummaryCard
          icon={CheckCircle2}
          iconClass="mailings-summary-icon--green"
          title="Открытий"
          value={formatNumber(
            totals.openings
          )}
          description={`Конверсия: ${totalOpeningConversion}%`}
        />
      </section>

      <section className="mailings-funnel-card">
        <div className="mailings-section-heading">
          <div>
            <h2>
              Общая воронка рассылок
            </h2>

            <p>
              Путь контакта от загрузки
              до успешного открытия.
            </p>
          </div>

          <TrendingUp size={20} />
        </div>

        <div className="mailings-funnel">
          <FunnelStage
            title="Загружено"
            value={totals.uploaded}
            percent={100}
          />

          <div className="mailings-funnel-arrow">
            →
          </div>

          <FunnelStage
            title="Доставлено"
            value={totals.delivered}
            percent={getConversion(
              totals.delivered,
              totals.uploaded
            )}
          />

          <div className="mailings-funnel-arrow">
            →
          </div>

          <FunnelStage
            title="Ответили"
            value={totals.replied}
            percent={
              totalReplyConversion
            }
          />

          <div className="mailings-funnel-arrow">
            →
          </div>

          <FunnelStage
            title="Заявки"
            value={totals.applications}
            percent={getConversion(
              totals.applications,
              totals.replied
            )}
          />

          <div className="mailings-funnel-arrow">
            →
          </div>

          <FunnelStage
            title="Открытия"
            value={totals.openings}
            percent={getConversion(
              totals.openings,
              totals.applications
            )}
            accent
          />
        </div>
      </section>

      <section className="mailings-toolbar">
        <div className="search-field">
          <Search size={18} />

          <input
            type="text"
            placeholder="Название, поставщик или менеджер"
            value={searchValue}
            onChange={(event) =>
              setSearchValue(
                event.target.value
              )
            }
          />
        </div>

        <div className="toolbar-filter mailings-filter">
          <Filter size={15} />

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value
              )
            }
          >
            <option value="all">
              Все статусы
            </option>

            {Object.entries(
              statusConfig
            ).map(
              ([value, config]) => (
                <option
                  key={value}
                  value={value}
                >
                  {config.title}
                </option>
              )
            )}
          </select>
        </div>

        <div className="toolbar-filter">
          <select
            value={channelFilter}
            onChange={(event) =>
              setChannelFilter(
                event.target.value
              )
            }
          >
            <option value="all">
              Все каналы
            </option>
            <option value="Telegram">
              Telegram
            </option>
            <option value="WhatsApp">
              WhatsApp
            </option>
            <option value="Ручная рассылка">
              Ручная рассылка
            </option>
            <option value="Telegram Bot">
              Telegram Bot
            </option>
          </select>
        </div>

        <div className="toolbar-filter">
          <select
            value={sortValue}
            onChange={(event) =>
              setSortValue(
                event.target.value
              )
            }
          >
            <option value="date">
              Сначала новые
            </option>
            <option value="uploaded">
              По размеру базы
            </option>
            <option value="replies">
              По ответам
            </option>
            <option value="applications">
              По заявкам
            </option>
            <option value="openings">
              По открытиям
            </option>
            <option value="conversion">
              По конверсии
            </option>
          </select>
        </div>
      </section>

      <div className="mailings-result-line">
        Найдено рассылок:{" "}
        <strong>
          {preparedMailings.length}
        </strong>
      </div>

      <section className="mailings-grid">
        {preparedMailings.map(
          (mailing) => (
            <MailingCard
              key={mailing.id}
              mailing={mailing}
              onImport={() =>
                setImportMailing(
                  mailing
                )
              }
              onContacts={() =>
                navigate(
                  `/mailings/${mailing.id}/contacts`
                )
              }
              onAnalytics={() =>
                navigate(
                  `/mailings/${mailing.id}`
                )
              }
              onEdit={() =>
                openEditModal(mailing)
              }
            />
          )
        )}
      </section>

      {preparedMailings.length ===
        0 && (
        <div className="empty-search">
          <Search size={28} />
          <h2>
            Рассылки не найдены
          </h2>
          <p>
            Измени запрос или фильтры.
          </p>
        </div>
      )}

      {isModalOpen && (
        <MailingModal
          isEditing={Boolean(
            editingMailing
          )}
          form={mailingForm}
          error={formError}
          isSaving={isSaving}
          onChange={
            handleFormChange
          }
          onClose={closeModal}
          onSubmit={
            handleSubmitMailing
          }
        />
      )}

      {importMailing && (
        <ImportContactsModal
          mailingId={
            importMailing.id
          }
          mailingName={
            importMailing.name ||
            importMailing.title
          }
          onClose={() =>
            setImportMailing(null)
          }
          onImported={
            handleContactsImported
          }
        />
      )}
    </main>
  );
}

function MailingCard({
  mailing,
  onImport,
  onContacts,
  onAnalytics,
  onEdit,
}) {
  const status =
    statusConfig[mailing.status] ||
    statusConfig.draft;

  const uploaded =
    toNumber(mailing.uploaded);

  const delivered =
    toNumber(mailing.delivered);

  const replied =
    toNumber(mailing.replied);

  const applications =
    toNumber(mailing.applications);

  const openings =
    toNumber(mailing.openings);

  const channel =
    mailing.channel ||
    mailing.mailing_method ||
    "Канал не указан";

  const source =
    mailing.source ||
    mailing.supplier ||
    "Источник не указан";

  return (
    <article className="mailing-card">
      <div className="mailing-card-header">
        <div className="mailing-channel-icon">
          <Send size={18} />
        </div>

        <div className="mailing-card-title">
          <h2>
            {mailing.name ||
              mailing.title ||
              "Без названия"}
          </h2>

          <p>
            {channel} · {source}
          </p>
        </div>

        <span
          className={`mailing-status ${status.className}`}
        >
          <span />
          {status.title}
        </span>
      </div>

      <div className="mailing-meta">
        <div>
          <CalendarDays size={14} />
          {formatDate(
            mailing.created_at
          )}
        </div>

        <div>
          <Clock3 size={14} />
          {formatTime(
            mailing.created_at
          )}
        </div>
      </div>

      <div className="mailing-manager">
        <span>
          Ответственный менеджер
        </span>

        <strong>
          {getManagerName(
            mailing.manager
          )}
        </strong>
      </div>

      <div className="mailing-primary-stats">
        <Stat
          title="Загружено"
          value={uploaded}
        />

        <Stat
          title="Доставлено"
          value={delivered}
        />

        <Stat
          title="Ответили"
          value={replied}
        />
      </div>

      <div className="mailing-result-stats">
        <ResultStat
          icon={FileText}
          title="Заявки"
          value={applications}
        />

        <ResultStat
          icon={CheckCircle2}
          title="Открытия"
          value={openings}
          green
        />
      </div>

      <div className="mailing-conversions">
        <Conversion
          title="Доставка"
          value={getConversion(
            delivered,
            uploaded
          )}
        />

        <Conversion
          title="Ответ"
          value={getConversion(
            replied,
            delivered
          )}
        />

        <Conversion
          title="Ответ → заявка"
          value={getConversion(
            applications,
            replied
          )}
        />

        <Conversion
          title="Заявка → открытие"
          value={getConversion(
            openings,
            applications
          )}
        />
      </div>

      <div className="mailing-card-actions mailing-card-actions--full">
        <button
          className="mailing-import-button"
          type="button"
          onClick={onImport}
        >
          <MailPlus size={16} />
          Импорт
        </button>

        <button
          className="mailing-open-button"
          type="button"
          onClick={onContacts}
        >
          <Users size={16} />
          Контакты
        </button>

        <button
          className="mailing-open-button"
          type="button"
          onClick={onAnalytics}
        >
          <BarChart3 size={16} />
          Аналитика
          <ArrowUpRight size={15} />
        </button>

        <button
          className="mailing-edit-button"
          type="button"
          onClick={onEdit}
        >
          <Pencil size={16} />
          Редактировать
        </button>
      </div>
    </article>
  );
}

function MailingModal({
  isEditing,
  form,
  error,
  isSaving,
  onChange,
  onClose,
  onSubmit,
}) {
  return (
    <div
      className="mailing-modal-backdrop"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="mailing-modal"
        role="dialog"
        aria-modal="true"
      >
        <div className="mailing-modal-header">
          <div>
            <h2>
              {isEditing
                ? "Редактировать партию"
                : "Создать партию"}
            </h2>

            <p>
              {isEditing
                ? "Измени параметры выбранной партии."
                : "Укажи информацию о закупке лидов."}
            </p>
          </div>

          <button
            className="mailing-modal-close"
            type="button"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form
          className="mailing-form"
          onSubmit={onSubmit}
        >
          <div className="mailing-form-grid">
            <FormField
              title="Название партии *"
              full
            >
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={onChange}
                placeholder="Партия лидов"
                autoFocus
              />
            </FormField>

            <FormField title="Поставщик лидов *">
              <input
                type="text"
                name="supplier"
                value={form.supplier}
                onChange={onChange}
                placeholder="Поставщик"
              />
            </FormField>

            <FormField title="Стоимость закупки, ₽ *">
              <input
                type="number"
                name="purchase_cost"
                min="0"
                step="0.01"
                value={
                  form.purchase_cost
                }
                onChange={onChange}
              />
            </FormField>

            <FormField title="Метод рассылки *">
              <select
                name="mailing_method"
                value={
                  form.mailing_method
                }
                onChange={onChange}
              >
                <option value="Telegram">
                  Telegram
                </option>
                <option value="WhatsApp">
                  WhatsApp
                </option>
                <option value="Ручная рассылка">
                  Ручная рассылка
                </option>
                <option value="Telegram Bot">
                  Telegram Bot
                </option>
                <option value="Другое">
                  Другое
                </option>
              </select>
            </FormField>

            <FormField title="Статус партии">
              <select
                name="status"
                value={form.status}
                onChange={onChange}
              >
                {Object.entries(
                  statusConfig
                ).map(
                  ([value, config]) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {config.title}
                    </option>
                  )
                )}
              </select>
            </FormField>

            <FormField
              title="Дата начала работы"
              full
            >
              <input
                type="datetime-local"
                name="started_at"
                value={form.started_at}
                onChange={onChange}
              />
            </FormField>

            <FormField
              title="Комментарий"
              full
            >
              <textarea
                name="comment"
                value={form.comment}
                onChange={onChange}
                rows="5"
                placeholder="Комментарий..."
              />
            </FormField>
          </div>

          {error && (
            <div className="mailing-form-error">
              {error}
            </div>
          )}

          <div className="mailing-modal-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={onClose}
              disabled={isSaving}
            >
              Отмена
            </button>

            <button
              className="primary-button button-with-icon"
              type="submit"
              disabled={isSaving}
            >
              {isEditing ? (
                <FilePenLine
                  size={17}
                />
              ) : (
                <MailPlus size={17} />
              )}

              {isSaving
                ? "Сохранение..."
                : isEditing
                  ? "Сохранить изменения"
                  : "Создать партию"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  iconClass = "",
  title,
  value,
  description,
}) {
  return (
    <article className="mailings-summary-card">
      <div
        className={[
          "mailings-summary-icon",
          iconClass,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Icon size={19} />
      </div>

      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{description}</small>
      </div>
    </article>
  );
}

function FunnelStage({
  title,
  value,
  percent,
  accent = false,
}) {
  return (
    <div
      className={
        accent
          ? "mailings-funnel-stage mailings-funnel-stage--accent"
          : "mailings-funnel-stage"
      }
    >
      <span>{title}</span>
      <strong>
        {formatNumber(value)}
      </strong>
      <small>{percent}%</small>
    </div>
  );
}

function Stat({ title, value }) {
  return (
    <div>
      <span>{title}</span>
      <strong>
        {formatNumber(value)}
      </strong>
    </div>
  );
}

function ResultStat({
  icon: Icon,
  title,
  value,
  green = false,
}) {
  return (
    <div>
      <div
        className={
          green
            ? "mailing-result-icon mailing-result-icon--green"
            : "mailing-result-icon"
        }
      >
        <Icon size={16} />
      </div>

      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function Conversion({ title, value }) {
  return (
    <div>
      <span>{title}</span>
      <strong>{value}%</strong>
    </div>
  );
}

function FormField({
  title,
  full = false,
  children,
}) {
  return (
    <label
      className={
        full
          ? "mailing-form-field mailing-form-field--full"
          : "mailing-form-field"
      }
    >
      <span>{title}</span>
      {children}
    </label>
  );
}

function getManagerName(manager) {
  if (!manager) {
    return "Не назначен";
  }

  return (
    manager.full_name ||
    manager.name ||
    manager.email ||
    "Не назначен"
  );
}

function toNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat(
    "ru-RU"
  ).format(toNumber(value));
}

function getConversion(value, total) {
  const safeValue =
    toNumber(value);

  const safeTotal =
    toNumber(total);

  if (!safeTotal) {
    return 0;
  }

  return Number(
    (
      (safeValue / safeTotal) *
      100
    ).toFixed(1)
  );
}

function formatDate(value) {
  if (!value) {
    return "Дата не указана";
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "Дата не указана";
  }

  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }
  ).format(date);
}

function formatTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(date);
}

function formatDateTimeLocal(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "";
  }

  const offset =
    date.getTimezoneOffset() *
    60 *
    1000;

  return new Date(
    date.getTime() - offset
  )
    .toISOString()
    .slice(0, 16);
}