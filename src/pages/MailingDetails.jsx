import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useParams } from "react-router-dom";
import { mailingAnalyticsService } from "../services/mailingAnalyticsService";
import {
  ArrowLeft,
  CheckCircle2,
  CirclePause,
  Clock3,
  FileText,
  Mail,
  MessageCircleReply,
  MoreHorizontal,
  Pencil,
  Play,
  Search,
  Send,
  SquareCheckBig,
  TrendingUp,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";







const statusConfig = {
  active: {
    title: "Активна",
    className: "mailing-details-status--active",
  },
  completed: {
    title: "Завершена",
    className: "mailing-details-status--completed",
  },
  paused: {
    title: "Приостановлена",
    className: "mailing-details-status--paused",
  },
  draft: {
    title: "Черновик",
    className: "mailing-details-status--draft",
  },
};

const contactStatusConfig = {
  new: {
    title: "Новый",
    className: "mailing-contact-status--gray",
  },

  telegram_found: {
    title: "Telegram найден",
    className: "mailing-contact-status--blue",
  },

  telegram_not_found: {
    title: "Telegram не найден",
    className: "mailing-contact-status--orange",
  },

  sent: {
    title: "Отправлено",
    className: "mailing-contact-status--gray",
  },

  replied: {
    title: "Ответил",
    className: "mailing-contact-status--blue",
  },

  application: {
    title: "Заявка",
    className: "mailing-contact-status--purple",
  },

  approved: {
    title: "Открытие",
    className: "mailing-contact-status--green",
  },

  rejected: {
    title: "Отказ",
    className: "mailing-contact-status--red",
  },

  no_reply: {
    title: "Без ответа",
    className: "mailing-contact-status--orange",
  },
};

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(value);
}
function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getConversion(value, total) {
  if (!total) {
    return 0;
  }

  return Number(((value / total) * 100).toFixed(1));
}

function ActivityIcon({ type }) {
  if (type === "opened") {
    return <CheckCircle2 size={16} />;
  }

  if (type === "application") {
    return <FileText size={16} />;
  }

  if (type === "replied") {
    return <MessageCircleReply size={16} />;
  }

  if (type === "manager") {
    return <UserRound size={16} />;
  }

  return <Send size={16} />;
}

export default function MailingDetails() {
  const { mailingId } = useParams();

  const [mailing, setMailing] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [activity, setActivity] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [managerStats, setManagerStats] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [mailingStatus, setMailingStatus] = useState(null);
  const [searchValue, setSearchValue] = useState("");
  const [contactStatusFilter, setContactStatusFilter] =
    useState("all");

    const [managerFilter, setManagerFilter] =
  useState("all");

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    const { data, error } =
      await mailingAnalyticsService.getMailingAnalytics(
        mailingId
      );

    if (error) {
      console.error(
        "Ошибка загрузки аналитики рассылки:",
        error
      );

      setMailing(null);
      setContacts([]);
      setActivity([]);
      setMetrics(null);
      setManagerStats([]);

      setLoadError(
        error.message ||
          "Не удалось загрузить аналитику рассылки"
      );

      setLoading(false);
      return;
    }

    setMailing(data?.mailing || null);
    setContacts(data?.contacts || []);
    setActivity(data?.activity || []);
    setMetrics(data?.metrics || null);
    setManagerStats(data?.managerStats || []);

    setMailingStatus(
      data?.mailing?.status || null
    );

    setLoading(false);
  }, [mailingId]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const currentStatus =
    mailingStatus || mailing?.status;


    const managerOptions = useMemo(() => {
  const names = contacts
    .map((contact) => contact.manager)
    .filter(Boolean);

  return [...new Set(names)].sort((first, second) =>
    first.localeCompare(second, "ru")
  );
}, [contacts]);
  const filteredContacts = useMemo(() => {
    const search =
      searchValue.trim().toLowerCase();

    return contacts.filter((contact) => {
      const username = String(
        contact.username || ""
      ).toLowerCase();

      const phone = String(
        contact.phone || ""
      ).toLowerCase();

      const manager = String(
        contact.manager || ""
      ).toLowerCase();

      const product = String(
        contact.product || ""
      ).toLowerCase();

      const matchesSearch =
        !search ||
        username.includes(search) ||
        phone.includes(search) ||
        manager.includes(search) ||
        product.includes(search);

      const matchesStatus =
        contactStatusFilter === "all" ||
        contact.status === contactStatusFilter;

        const matchesManager =
  managerFilter === "all" ||
  contact.manager === managerFilter;

      return (
  matchesSearch &&
  matchesStatus &&
  matchesManager
);
    });
  }, [
    contacts,
    searchValue,
    managerFilter,
    contactStatusFilter,
  ]);
if (loading) {
  return (
    <main className="page">
      <div className="mailing-details-not-found">
        <Mail size={42} />

        <h1>Загружаем аналитику...</h1>

        <p>
          Получаем данные рассылки из Supabase.
        </p>
      </div>
    </main>
  );
}

if (loadError) {
  return (
    <main className="page">
      <div className="mailing-details-not-found">
        <XCircle size={42} />

        <h1>Не удалось загрузить рассылку</h1>

        <p>{loadError}</p>

        <button
          className="primary-button button-with-icon"
          type="button"
          onClick={loadAnalytics}
        >
          Повторить
        </button>
      </div>
    </main>
  );
}
  if (!mailing) {
    return (
      <main className="page">
        <div className="mailing-details-not-found">
          <Mail size={42} />

          <h1>Рассылка не найдена</h1>

          <p>
            Возможно, она была удалена или указан неправильный адрес.
          </p>

          <Link
            className="primary-button button-with-icon"
            to="/mailings"
          >
            <ArrowLeft size={17} />
            Вернуться к рассылкам
          </Link>
        </div>
      </main>
    );
  }

  const currentStatusConfig = statusConfig[currentStatus];

  const uploaded = metrics?.uploaded || 0;

const telegramFound =
  metrics?.telegramFound || 0;

const telegramNotFound =
  metrics?.telegramNotFound || 0;

const delivered = metrics?.sent || 0;
const replied = metrics?.responded || 0;
const noReply = metrics?.noReply || 0;

const applications =
  metrics?.applications || 0;

const openings = metrics?.approved || 0;
const rejected = metrics?.rejected || 0;

const unassigned =
  metrics?.unassigned || 0;

const deliveryConversion =
  metrics?.sentConversion || 0;

const replyConversion =
  metrics?.responseConversion || 0;

const applicationConversion =
  metrics?.applicationConversion || 0;

const openingConversion =
  metrics?.saleConversion || 0;

const totalConversion =
  metrics?.totalSaleConversion || 0;

 

  function handlePause() {
    setMailingStatus("paused");
  }

  function handleResume() {
    setMailingStatus("active");
  }

  function handleComplete() {
    setMailingStatus("completed");
  }

  return (
    <main className="page">
      <div className="mailing-details-navigation">
        <Link to="/mailings">
          <ArrowLeft size={17} />
          Все рассылки
        </Link>
      </div>

      <section className="mailing-details-header-card">
        <div className="mailing-details-header-main">
          <div className="mailing-details-channel-icon">
            <Send size={24} />
          </div>

          <div className="mailing-details-heading">
            <div className="mailing-details-title-row">
              <div>
                <h1>{mailing.title}</h1>

                <p>
                  {mailing.channel} · {mailing.source}
                </p>
              </div>

              <span
                className={`mailing-details-status ${currentStatusConfig.className}`}
              >
                <span />
                {currentStatusConfig.title}
              </span>
            </div>

            <div className="mailing-details-meta">
              <span>
                <Clock3 size={14} />
                Запущена {mailing.created_at
  ? new Date(mailing.created_at).toLocaleDateString("ru-RU")
  : "—"} в {mailing.created_at
  ? new Date(mailing.created_at).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    })
  : ""}
              </span>

              <span>
                <UserRound size={14} />
                Ответственный: {mailing.manager_name || "Не назначен"}
              </span>
            </div>
          </div>
        </div>

        <div className="mailing-details-actions">
          <button
            className="secondary-button button-with-icon"
            type="button"
          >
            <Pencil size={16} />
            Редактировать
          </button>

          {currentStatus === "active" && (
            <button
              className="secondary-button button-with-icon"
              type="button"
              onClick={handlePause}
            >
              <CirclePause size={16} />
              Приостановить
            </button>
          )}

          {currentStatus === "paused" && (
            <button
              className="secondary-button button-with-icon"
              type="button"
              onClick={handleResume}
            >
              <Play size={16} />
              Продолжить
            </button>
          )}

          {currentStatus !== "completed" && (
            <button
              className="mailing-complete-button"
              type="button"
              onClick={handleComplete}
            >
              <SquareCheckBig size={16} />
              Завершить
            </button>
          )}

          <button
            className="mailing-more-button"
            type="button"
            aria-label="Дополнительные действия"
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
      </section>

      <section className="mailing-details-stats">
        <article>
          <div className="mailing-details-stat-icon">
            <Users size={19} />
          </div>

          <div>
            <span>Загружено</span>
            <strong>{formatNumber(uploaded)}</strong>
            <small>Всего контактов в базе</small>
          </div>
        </article>

        <article>
  <div className="mailing-details-stat-icon mailing-details-stat-icon--blue">
    <Send size={19} />
  </div>

  <div>
    <span>Telegram найден</span>
    <strong>
      {formatNumber(telegramFound)}
    </strong>

    <small>
      {getConversion(
        telegramFound,
        uploaded
      )}
      % от базы
    </small>
  </div>
</article>

<article>
  <div className="mailing-details-stat-icon mailing-details-stat-icon--orange">
    <XCircle size={19} />
  </div>

  <div>
    <span>Telegram не найден</span>
    <strong>
      {formatNumber(telegramNotFound)}
    </strong>

    <small>
      {getConversion(
        telegramNotFound,
        uploaded
      )}
      % от базы
    </small>
  </div>
</article>

        <article>
          <div className="mailing-details-stat-icon mailing-details-stat-icon--blue">
            <Send size={19} />
          </div>

          <div>
            <span>Доставлено</span>
            <strong>{formatNumber(delivered)}</strong>
            <small>{deliveryConversion}% от базы</small>
          </div>
        </article>

        <article>
          <div className="mailing-details-stat-icon mailing-details-stat-icon--orange">
            <MessageCircleReply size={19} />
          </div>

          <div>
            <span>Ответили</span>
            <strong>{formatNumber(replied)}</strong>
            <small>{replyConversion}% от доставленных</small>
          </div>
        </article>
        <article>
  <div className="mailing-details-stat-icon mailing-details-stat-icon--orange">
    <Clock3 size={19} />
  </div>

  <div>
    <span>Без ответа</span>
    <strong>
      {formatNumber(noReply)}
    </strong>

    <small>
      Контакты без зафиксированного ответа
    </small>
  </div>
</article>

        <article>
          <div className="mailing-details-stat-icon mailing-details-stat-icon--purple">
            <FileText size={19} />
          </div>

          <div>
            <span>Заявки</span>
            <strong>{formatNumber(applications)}</strong>
            <small>{applicationConversion}% от ответов</small>
          </div>
        </article>

        <article>
          <div className="mailing-details-stat-icon mailing-details-stat-icon--green">
            <CheckCircle2 size={19} />
          </div>

          <div>
            <span>Открытия</span>
            <strong>{formatNumber(openings)}</strong>
            <small>{openingConversion}% от заявок</small>
          </div>
        </article>
      </section>
      <article>
  <div className="mailing-details-stat-icon mailing-details-stat-icon--orange">
    <XCircle size={19} />
  </div>

  <div>
    <span>Отказы</span>
    <strong>
      {formatNumber(rejected)}
    </strong>

    <small>
      {getConversion(
        rejected,
        applications
      )}
      % от заявок
    </small>
  </div>
</article>

<article>
  <div className="mailing-details-stat-icon">
    <UserRound size={19} />
  </div>

  <div>
    <span>Не распределено</span>
    <strong>
      {formatNumber(unassigned)}
    </strong>

    <small>
      Контакты без менеджера
    </small>
  </div>
</article>

      <section className="mailing-details-funnel-card">
        <div className="mailing-details-section-heading">
          <div>
            <h2>Воронка рассылки</h2>
            <p>
              Конверсия контактов на каждом этапе обработки
            </p>
          </div>

          <TrendingUp size={20} />
        </div>

        <div className="mailing-details-funnel">
          <div className="mailing-details-funnel-step">
            <div>
              <span>Загружено</span>
              <strong>{formatNumber(uploaded)}</strong>
            </div>

            <small>100%</small>
          </div>

          <div className="mailing-details-funnel-line">
            <span style={{ width: `${deliveryConversion}%` }} />
          </div>

          <div className="mailing-details-funnel-step">
            <div>
              <span>Доставлено</span>
              <strong>{formatNumber(delivered)}</strong>
            </div>

            <small>{deliveryConversion}%</small>
          </div>

          <div className="mailing-details-funnel-line">
            <span style={{ width: `${replyConversion}%` }} />
          </div>

          <div className="mailing-details-funnel-step">
            <div>
              <span>Ответили</span>
              <strong>{formatNumber(replied)}</strong>
            </div>

            <small>{replyConversion}%</small>
          </div>

          <div className="mailing-details-funnel-line">
            <span style={{ width: `${applicationConversion}%` }} />
          </div>

          <div className="mailing-details-funnel-step">
            <div>
              <span>Заявки</span>
              <strong>{formatNumber(applications)}</strong>
            </div>

            <small>{applicationConversion}%</small>
          </div>

          <div className="mailing-details-funnel-line">
            <span style={{ width: `${openingConversion}%` }} />
          </div>

          <div className="mailing-details-funnel-step mailing-details-funnel-step--result">
            <div>
              <span>Открытия</span>
              <strong>{formatNumber(openings)}</strong>
            </div>

            <small>{openingConversion}%</small>
          </div>
        </div>

        <div className="mailing-total-conversion">
          <div>
            <span>Итоговая конверсия базы в открытие</span>
            <strong>{totalConversion}%</strong>
          </div>

          <div className="mailing-total-conversion-track">
            <span
              style={{
                width: `${Math.min(totalConversion * 5, 100)}%`,
              }}
            />
          </div>
        </div>
      </section>

      <section className="mailing-stage-summary">

  <div className="mailing-details-section-heading">
    <div>
      <h2>Этапы обработки</h2>
      <p>Текущее состояние всех контактов</p>
    </div>

    <TrendingUp size={20}/>
  </div>

  <div className="mailing-stage-grid">

    <article>
      <span>Новых</span>
      <strong>
        {contacts.filter(c=>c.status==="new").length}
      </strong>
    </article>

    <article>
      <span>Telegram найден</span>
      <strong>{telegramFound}</strong>
    </article>

    <article>
      <span>Telegram не найден</span>
      <strong>{telegramNotFound}</strong>
    </article>

    <article>
      <span>Сообщение отправлено</span>
      <strong>{delivered}</strong>
    </article>

    <article>
      <span>Ответили</span>
      <strong>{replied}</strong>
    </article>

    <article>
      <span>Без ответа</span>
      <strong>{noReply}</strong>
    </article>

    <article>
      <span>Создано заявок</span>
      <strong>{applications}</strong>
    </article>

    <article>
      <span>Открытия</span>
      <strong>{openings}</strong>
    </article>

    <article>
      <span>Отказы</span>
      <strong>{rejected}</strong>
    </article>

  </div>

</section>

      <section className="mailing-managers-section">
  <div className="mailing-details-section-heading">
    <div>
      <h2>Результаты менеджеров</h2>
      <p>
        Распределение контактов и результаты обработки
      </p>
    </div>

    <Users size={20} />
  </div>

  <div className="mailing-managers-table-wrapper">
    <table className="mailing-managers-table">
      <thead>
        <tr>
          <th>Менеджер</th>
          <th>Выделено</th>
          <th>Отправлено</th>
          <th>Ответили</th>
          <th>Заявки</th>
          <th>Открытия</th>
          <th>Отказы</th>
          <th>Конверсия ответа</th>
        </tr>
      </thead>

      <tbody>
        {managerStats.map((manager) => (
          <tr key={manager.id || "unassigned"}>
            <td>
              <strong>{manager.name}</strong>
            </td>

            <td>{formatNumber(manager.assigned)}</td>
            <td>{formatNumber(manager.sent)}</td>
            <td>{formatNumber(manager.responded)}</td>
            <td>{formatNumber(manager.applications)}</td>
            <td>{formatNumber(manager.approved)}</td>
            <td>{formatNumber(manager.rejected)}</td>

            <td>
              <strong>
                {manager.responseConversion}%
              </strong>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>

  {managerStats.length === 0 && (
    <div className="mailing-contacts-empty">
      <Users size={24} />
      <p>Нет данных по менеджерам</p>
    </div>
  )}
</section>

      <div className="mailing-details-content-grid">
        <section className="mailing-contacts-section">
          <div className="mailing-details-section-heading">
            <div>
              <h2>Контакты рассылки</h2>
              <p>
                Клиенты и текущие результаты обработки
              </p>
            </div>

            <Users size={20} />
          </div>

          <div className="mailing-contacts-toolbar">
            <div className="toolbar-filter">
  <select
    value={managerFilter}
    onChange={(event) =>
      setManagerFilter(event.target.value)
    }
  >
    <option value="all">
      Все менеджеры
    </option>

    {managerOptions.map((managerName) => (
      <option
        value={managerName}
        key={managerName}
      >
        {managerName}
      </option>
    ))}
  </select>
</div>
            <div className="search-field">
              <Search size={17} />

              <input
                type="text"
                placeholder="Поиск по нику, телефону или менеджеру"
                value={searchValue}
                onChange={(event) =>
                  setSearchValue(event.target.value)
                }
              />
            </div>

            <div className="toolbar-filter">
              <select
                value={contactStatusFilter}
                onChange={(event) =>
                  setContactStatusFilter(event.target.value)
                }
              >
                <option value="all">
  Все статусы
</option>

<option value="new">
  Новые
</option>

<option value="telegram_found">
  Telegram найден
</option>

<option value="telegram_not_found">
  Telegram не найден
</option>

<option value="sent">
  Отправлено
</option>

<option value="replied">
  Ответили
</option>

<option value="application">
  Созданы заявки
</option>

<option value="approved">
  Открытия
</option>

<option value="rejected">
  Отказы
</option>
              </select>
            </div>
          </div>

          <div className="mailing-contacts-result">
            Найдено контактов:{" "}
            <strong>{filteredContacts.length}</strong>
          </div>

          <div className="mailing-contacts-table-wrapper">
            <table className="mailing-contacts-table">
              <thead>
                <tr>
  <th>Клиент</th>
  <th>Telegram</th>
  <th>Статус</th>
  <th>Менеджер</th>
  <th>Отправлено</th>
  <th>Получен ответ</th>
  <th>Создана заявка</th>
  <th>Последнее действие</th>
</tr>
              </thead>

              <tbody>
                {filteredContacts.map((contact) => {
                  const contactStatus =
  contactStatusConfig[contact.status] ||
  contactStatusConfig.new;

                  return (
                    <tr key={contact.id}>
                      <td>
  <strong>
    {contact.full_name || "Без имени"}
  </strong>

  <span>
    {contact.phone || "Телефон не указан"}
  </span>
</td>

<td>
  <strong>
    {contact.telegram_username
      ? `@${String(
          contact.telegram_username
        ).replace(/^@/, "")}`
      : "Не найден"}
  </strong>
</td>

<td>
  <span
    className={`mailing-contact-status ${contactStatus.className}`}
  >
    {contactStatus.title}
  </span>
</td>

<td>
  {contact.manager || "Не назначен"}
</td>

<td>
  {formatDateTime(contact.sent_at)}
</td>

<td>
  {formatDateTime(contact.responded_at)}
</td>

<td>
  {formatDateTime(
    contact.application_created_at ||
      contact.application?.created_at
  )}
</td>

<td>
  <strong>{contact.lastAction}</strong>

  <span>
    {formatDateTime(contact.lastActionDate)}
  </span>
</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredContacts.length === 0 && (
            <div className="mailing-contacts-empty">
              <Search size={24} />
              <p>Контакты не найдены</p>
            </div>
          )}
        </section>

        <aside className="mailing-activity-section">
          <div className="mailing-details-section-heading">
            <div>
              <h2>История действий</h2>
              <p>Последние события рассылки</p>
            </div>

            <Clock3 size={20} />
          </div>

          <div className="mailing-activity-list">
            {activity.map((activity) => (
              <article
                className={`mailing-activity-item mailing-activity-item--${activity.type}`}
                key={activity.id}
              >
                <div className="mailing-activity-icon">
                  <ActivityIcon type={activity.type} />
                </div>

                <div>
                  <strong>{activity.title}</strong>
                  <p>{activity.description}</p>
                  <span>{activity.time}</span>
                </div>
              </article>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}