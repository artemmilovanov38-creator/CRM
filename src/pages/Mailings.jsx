import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import "../styles/Mailings.css";
import { useNavigate } from "react-router-dom";
import { mailingService } from "../services/mailingService";
import { profileService } from "../services/profileService";


import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Filter,
  MailPlus,
  MessageCircleReply,
  Search,
  Send,
  TrendingUp,
  Users,
} from "lucide-react";



const statusConfig = {
  active: {
    title: "Активна",
    className: "mailing-status--active",
  },
  completed: {
    title: "Завершена",
    className: "mailing-status--completed",
  },
  paused: {
    title: "Приостановлена",
    className: "mailing-status--paused",
  },
  draft: {
    title: "Черновик",
    className: "mailing-status--draft",
  },
};

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function getConversion(value, total) {
  if (!total) {
    return 0;
  }

  return Number(((value / total) * 100).toFixed(1));
}

function formatDate(value) {
  if (!value) {
    return "Дата не указана";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
const initialMailingForm = {
  title: "",
  channel: "WhatsApp",
  source: "",
  manager_id: "",
  status: "draft",
  message: "",
  uploaded: 0,
  scheduled_at: "",
};

export default function Mailings() {
  const navigate = useNavigate();
  const [mailingsData, setMailingsData] = useState([]);
const [loading, setLoading] = useState(true);
const [loadError, setLoadError] = useState("");

  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [sortValue, setSortValue] = useState("date");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
const [managers, setManagers] = useState([]);
const [mailingForm, setMailingForm] = useState(initialMailingForm);
const [isCreating, setIsCreating] = useState(false);
const [createError, setCreateError] = useState("");
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

useEffect(() => {
  loadMailings();
}, [loadMailings]);

useEffect(() => {
  console.log("MAILINGS:", mailingsData);
}, [mailingsData]);

const openCreateModal = () => {
  setMailingForm(initialMailingForm);
  setCreateError("");
  setIsCreateModalOpen(true);
};

const closeCreateModal = () => {
  if (isCreating) {
    return;
  }

  setIsCreateModalOpen(false);
  setCreateError("");
  setMailingForm(initialMailingForm);
};

const handleMailingFormChange = (event) => {
  const { name, value } = event.target;

  setMailingForm((current) => ({
    ...current,
    [name]: value,
  }));
};

const handleCreateMailing = async (event) => {
  event.preventDefault();

  if (!mailingForm.title.trim()) {
    setCreateError("Укажи название рассылки.");
    return;
  }

  if (!mailingForm.channel) {
    setCreateError("Выбери канал рассылки.");
    return;
  }

  setIsCreating(true);
  setCreateError("");

  const { data, error } = await mailingService.createMailing({
    ...mailingForm,
    uploaded: Number(mailingForm.uploaded || 0),
    scheduled_at: mailingForm.scheduled_at
      ? new Date(mailingForm.scheduled_at).toISOString()
      : null,
  });

  if (error) {
    console.error("Ошибка создания рассылки:", error);

    setCreateError(
      error.message || "Не удалось создать рассылку."
    );

    setIsCreating(false);
    return;
  }

  if (data) {
    setMailingsData((current) => [data, ...current]);
  } else {
    await loadMailings();
  }
  console.log("CREATE:", data);
console.log("ERROR:", error);

  setIsCreating(false);
  setIsCreateModalOpen(false);
  setMailingForm(initialMailingForm);
};
const loadManagers = useCallback(async () => {
  const { data, error } = await profileService.getManagers();

  if (error) {
    console.error("Ошибка загрузки менеджеров:", error);
    setManagers([]);
    return;
  }

  setManagers(data || []);
}, []);

useEffect(() => {
  loadManagers();
}, [loadManagers]);
  const preparedMailings = useMemo(() => {
    const search = searchValue.trim().toLowerCase();

    const filtered = mailingsData.filter((mailing) => {
      const matchesSearch =
        !search ||
        mailing.title.toLowerCase().includes(search) ||
        mailing.channel.toLowerCase().includes(search) ||
        mailing.source.toLowerCase().includes(search) ||
        getManagerName(mailing.manager)
  .toLowerCase()
  .includes(search);

      const matchesStatus =
        statusFilter === "all" || mailing.status === statusFilter;

      const matchesChannel =
        channelFilter === "all" || mailing.channel === channelFilter;

      return matchesSearch && matchesStatus && matchesChannel;
    });

    return [...filtered].sort((first, second) => {
      if (sortValue === "uploaded") {
        return second.uploaded - first.uploaded;
      }

      if (sortValue === "replies") {
        return second.replied - first.replied;
      }

      if (sortValue === "applications") {
        return second.applications - first.applications;
      }

      if (sortValue === "openings") {
        return second.openings - first.openings;
      }

      if (sortValue === "conversion") {
        const firstConversion = getConversion(
          first.openings,
          first.uploaded
        );

        const secondConversion = getConversion(
          second.openings,
          second.uploaded
        );

        return secondConversion - firstConversion;
      }

      return (
  new Date(second.created_at).getTime() -
  new Date(first.created_at).getTime()
);
    });
  }, [searchValue, statusFilter, channelFilter, sortValue]);

  const totals = useMemo(() => {
    return mailingsData.reduce(
      (result, mailing) => {
        result.campaigns += 1;
        result.uploaded += mailing.uploaded;
        result.delivered += mailing.delivered;
        result.replied += mailing.replied;
        result.applications += mailing.applications;
        result.openings += mailing.openings;

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

  const totalReplyConversion = getConversion(
    totals.replied,
    totals.delivered
  );

  const totalOpeningConversion = getConversion(
    totals.openings,
    totals.uploaded
  );

  if (loading) {
  return (
    <main className="page">
      <div className="empty-search">
        <h2>Загружаем рассылки...</h2>
        <p>Получаем данные из Supabase.</p>
      </div>
    </main>
  );
}

if (loadError) {
  return (
    <main className="page">
      <div className="empty-search">
        <h2>Не удалось загрузить рассылки</h2>

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
          <h1 className="page-title">Рассылки</h1>

          <p className="page-description">
            Управление кампаниями, базами клиентов и показателями конверсии
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
  Создать рассылку
</button>
</div>
      </div>

      <section className="mailings-summary-grid">
        <article className="mailings-summary-card">
          <div className="mailings-summary-icon">
            <Send size={19} />
          </div>

          <div>
            <span>Всего рассылок</span>
            <strong>{totals.campaigns}</strong>
            <small>{totals.active} активных сейчас</small>
          </div>
        </article>

        <article className="mailings-summary-card">
          <div className="mailings-summary-icon mailings-summary-icon--purple">
            <Users size={19} />
          </div>

          <div>
            <span>Загружено контактов</span>
            <strong>{formatNumber(totals.uploaded)}</strong>
            <small>
              Доставлено: {formatNumber(totals.delivered)}
            </small>
          </div>
        </article>

        <article className="mailings-summary-card">
          <div className="mailings-summary-icon mailings-summary-icon--orange">
            <MessageCircleReply size={19} />
          </div>

          <div>
            <span>Ответили</span>
            <strong>{formatNumber(totals.replied)}</strong>
            <small>Конверсия: {totalReplyConversion}%</small>
          </div>
        </article>

        <article className="mailings-summary-card">
          <div className="mailings-summary-icon mailings-summary-icon--green">
            <CheckCircle2 size={19} />
          </div>

          <div>
            <span>Открытий</span>
            <strong>{formatNumber(totals.openings)}</strong>
            <small>Конверсия: {totalOpeningConversion}%</small>
          </div>
        </article>
      </section>

      <section className="mailings-funnel-card">
        <div className="mailings-section-heading">
          <div>
            <h2>Общая воронка рассылок</h2>
            <p>Путь контакта от загрузки в базу до открытия продукта</p>
          </div>

          <TrendingUp size={20} />
        </div>

        <div className="mailings-funnel">
          <div className="mailings-funnel-stage">
            <span>Загружено</span>
            <strong>{formatNumber(totals.uploaded)}</strong>
            <small>100%</small>
          </div>

          <div className="mailings-funnel-arrow">→</div>

          <div className="mailings-funnel-stage">
            <span>Доставлено</span>
            <strong>{formatNumber(totals.delivered)}</strong>
            <small>
              {getConversion(totals.delivered, totals.uploaded)}%
            </small>
          </div>

          <div className="mailings-funnel-arrow">→</div>

          <div className="mailings-funnel-stage">
            <span>Ответили</span>
            <strong>{formatNumber(totals.replied)}</strong>
            <small>{totalReplyConversion}%</small>
          </div>

          <div className="mailings-funnel-arrow">→</div>

          <div className="mailings-funnel-stage">
            <span>Заявки</span>
            <strong>{formatNumber(totals.applications)}</strong>
            <small>
              {getConversion(totals.applications, totals.replied)}%
            </small>
          </div>

          <div className="mailings-funnel-arrow">→</div>

          <div className="mailings-funnel-stage mailings-funnel-stage--accent">
            <span>Открытия</span>
            <strong>{formatNumber(totals.openings)}</strong>
            <small>
              {getConversion(totals.openings, totals.applications)}%
            </small>
          </div>
        </div>
      </section>

      <section className="mailings-toolbar">
        <div className="search-field">
          <Search size={18} />

          <input
            type="text"
            placeholder="Поиск по названию, менеджеру или источнику"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
          />
        </div>

        <div className="toolbar-filter mailings-filter">
          <Filter size={15} />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">Все статусы</option>
            <option value="active">Активные</option>
            <option value="completed">Завершённые</option>
            <option value="paused">Приостановленные</option>
            <option value="draft">Черновики</option>
          </select>
        </div>

        <div className="toolbar-filter">
          <select
            value={channelFilter}
            onChange={(event) => setChannelFilter(event.target.value)}
          >
            <option value="all">Все каналы</option>
            <option value="WhatsApp">WhatsApp</option>
            <option value="Telegram">Telegram</option>
            <option value="ВКонтакте">ВКонтакте</option>
          </select>
        </div>

        <div className="toolbar-filter">
          <select
            value={sortValue}
            onChange={(event) => setSortValue(event.target.value)}
          >
            <option value="date">Сначала новые</option>
            <option value="uploaded">По размеру базы</option>
            <option value="replies">По ответам</option>
            <option value="applications">По заявкам</option>
            <option value="openings">По открытиям</option>
            <option value="conversion">По конверсии</option>
          </select>
        </div>
      </section>

      <div className="mailings-result-line">
        Найдено рассылок: <strong>{preparedMailings.length}</strong>
      </div>

      <section className="mailings-grid">
        {preparedMailings.map((mailing) => {
          const status = statusConfig[mailing.status];

          const deliveryConversion = getConversion(
            mailing.delivered,
            mailing.uploaded
          );

          const replyConversion = getConversion(
            mailing.replied,
            mailing.delivered
          );

          const applicationConversion = getConversion(
            mailing.applications,
            mailing.replied
          );

          const openingConversion = getConversion(
            mailing.openings,
            mailing.applications
          );

          return (
            <article className="mailing-card" key={mailing.id}>
              <div className="mailing-card-header">
                <div className="mailing-channel-icon">
                  <Send size={18} />
                </div>

                <div className="mailing-card-title">
                  <h2>{mailing.title}</h2>

                  <p>
                    {mailing.channel} · {mailing.source}
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
                  {formatDate(mailing.created_at)}
                </div>

                <div>
                  <Clock3 size={14} />
                  {formatTime(mailing.created_at)}
                </div>
              </div>

              <div className="mailing-manager">
                <span>Ответственный менеджер</span>
                <strong>
  {getManagerName(mailing.manager)}
</strong>
              </div>

              <div className="mailing-primary-stats">
                <div>
                  <span>Загружено</span>
                  <strong>{formatNumber(mailing.uploaded)}</strong>
                </div>

                <div>
                  <span>Доставлено</span>
                  <strong>{formatNumber(mailing.delivered)}</strong>
                </div>

                <div>
                  <span>Ответили</span>
                  <strong>{formatNumber(mailing.replied)}</strong>
                </div>
              </div>

              <div className="mailing-result-stats">
                <div>
                  <div className="mailing-result-icon">
                    <FileText size={16} />
                  </div>

                  <div>
                    <span>Заявки</span>
                    <strong>{mailing.applications}</strong>
                  </div>
                </div>

                <div>
                  <div className="mailing-result-icon mailing-result-icon--green">
                    <CheckCircle2 size={16} />
                  </div>

                  <div>
                    <span>Открытия</span>
                    <strong>{mailing.openings}</strong>
                  </div>
                </div>
              </div>

              <div className="mailing-conversions">
                <div>
                  <span>Доставка</span>
                  <strong>{deliveryConversion}%</strong>
                </div>

                <div>
                  <span>Ответ</span>
                  <strong>{replyConversion}%</strong>
                </div>

                <div>
                  <span>Ответ → заявка</span>
                  <strong>{applicationConversion}%</strong>
                </div>

                <div>
                  <span>Заявка → открытие</span>
                  <strong>{openingConversion}%</strong>
                </div>
              </div>

              <div className="mailing-conversion-progress">
                <div>
                  <span>Общая конверсия в открытие</span>

                  <strong>
                    {getConversion(mailing.openings, mailing.uploaded)}%
                  </strong>
                </div>

                <div className="mailing-progress-track">
                  <span
                    style={{
                      width: `${Math.min(
                        getConversion(
                          mailing.openings,
                          mailing.uploaded
                        ) * 4,
                        100
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <button
                className="mailing-open-button"
                type="button"
                onClick={() => navigate(`/mailings/${mailing.id}`)}
              >
                <BarChart3 size={16} />
                Открыть аналитику
                <ArrowUpRight size={16} />
              </button>
            </article>
          );
        })}
      </section>

      {preparedMailings.length === 0 && (
        <div className="empty-search">
          <Search size={28} />
          <h2>Рассылки не найдены</h2>
          <p>Измени запрос или выбранные фильтры.</p>
        </div>
      )}


      {isCreateModalOpen && (
  <div
    className="mailing-modal-backdrop"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        closeCreateModal();
      }
    }}
  >
    <section
      className="mailing-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-mailing-title"
    >
      <div className="mailing-modal-header">
        <div>
          <h2 id="create-mailing-title">
            Создать рассылку
          </h2>

          <p>
            Добавь новую кампанию и назначь ответственного
            менеджера.
          </p>
        </div>

        <button
          className="mailing-modal-close"
          type="button"
          onClick={closeCreateModal}
          aria-label="Закрыть"
        >
          ×
        </button>
      </div>

      <form
        className="mailing-form"
        onSubmit={handleCreateMailing}
      >
        <div className="mailing-form-grid">
          <label className="mailing-form-field mailing-form-field--full">
            <span>Название рассылки *</span>

            <input
              type="text"
              name="title"
              value={mailingForm.title}
              onChange={handleMailingFormChange}
              placeholder="Например: WhatsApp — холодная база"
              autoFocus
            />
          </label>

          <label className="mailing-form-field">
            <span>Канал *</span>

            <select
              name="channel"
              value={mailingForm.channel}
              onChange={handleMailingFormChange}
            >
              <option value="WhatsApp">WhatsApp</option>
              <option value="Telegram">Telegram</option>
              <option value="ВКонтакте">ВКонтакте</option>
              <option value="Email">Email</option>
              <option value="SMS">SMS</option>
            </select>
          </label>

          <label className="mailing-form-field">
            <span>Статус</span>

            <select
              name="status"
              value={mailingForm.status}
              onChange={handleMailingFormChange}
            >
              <option value="draft">Черновик</option>
              <option value="active">Активная</option>
              <option value="paused">Приостановлена</option>
              <option value="completed">Завершена</option>
            </select>
          </label>

          <label className="mailing-form-field">
            <span>Источник базы</span>

            <input
              type="text"
              name="source"
              value={mailingForm.source}
              onChange={handleMailingFormChange}
              placeholder="Собственная база"
            />
          </label>

          <label className="mailing-form-field">
            <span>Ответственный менеджер</span>

            <select
              name="manager_id"
              value={mailingForm.manager_id}
              onChange={handleMailingFormChange}
            >
              <option value="">Не назначен</option>

              {managers.map((manager) => (
                <option
                  key={manager.id}
                  value={manager.id}
                >
                  {manager.full_name ||
                    manager.name ||
                    manager.email ||
                    "Без имени"}
                </option>
              ))}
            </select>
          </label>

          <label className="mailing-form-field">
            <span>Количество контактов</span>

            <input
              type="number"
              name="uploaded"
              min="0"
              step="1"
              value={mailingForm.uploaded}
              onChange={handleMailingFormChange}
            />
          </label>

          <label className="mailing-form-field">
            <span>Дата запуска</span>

            <input
              type="datetime-local"
              name="scheduled_at"
              value={mailingForm.scheduled_at}
              onChange={handleMailingFormChange}
            />
          </label>

          <label className="mailing-form-field mailing-form-field--full">
            <span>Текст рассылки</span>

            <textarea
              name="message"
              value={mailingForm.message}
              onChange={handleMailingFormChange}
              rows="6"
              placeholder="Введите текст сообщения..."
            />
          </label>
        </div>

        {createError && (
          <div className="mailing-form-error">
            {createError}
          </div>
        )}

        <div className="mailing-modal-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={closeCreateModal}
            disabled={isCreating}
          >
            Отмена
          </button>

          <button
            className="primary-button button-with-icon"
            type="submit"
            disabled={isCreating}
          >
            <MailPlus size={17} />

            {isCreating
              ? "Создание..."
              : "Создать рассылку"}
          </button>
        </div>
      </form>
    </section>
  </div>
)}
    </main>
  );
}