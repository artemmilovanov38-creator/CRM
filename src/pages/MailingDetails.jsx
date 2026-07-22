import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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

const mailingsData = [
  {
    id: 1,
    title: "WhatsApp — 18 июля №1",
    channel: "WhatsApp",
    source: "База блогера",
    manager: "Анна Иванова",
    createdAt: "18.07.2026",
    createdTime: "09:10",
    status: "active",
    uploaded: 500,
    delivered: 438,
    replied: 126,
    applications: 44,
    openings: 23,
  },
  {
    id: 2,
    title: "Telegram — 18 июля",
    channel: "Telegram",
    source: "Собственная база",
    manager: "Карина Юсупова",
    createdAt: "18.07.2026",
    createdTime: "11:30",
    status: "active",
    uploaded: 320,
    delivered: 295,
    replied: 87,
    applications: 31,
    openings: 18,
  },
  {
    id: 3,
    title: "WhatsApp — 17 июля №2",
    channel: "WhatsApp",
    source: "Партнёрская база",
    manager: "Мария Алиева",
    createdAt: "17.07.2026",
    createdTime: "15:20",
    status: "completed",
    uploaded: 650,
    delivered: 572,
    replied: 141,
    applications: 52,
    openings: 28,
  },
  {
    id: 4,
    title: "ВКонтакте — тёплая база",
    channel: "ВКонтакте",
    source: "Входящие лиды",
    manager: "Светлана Соколова",
    createdAt: "17.07.2026",
    createdTime: "12:00",
    status: "paused",
    uploaded: 210,
    delivered: 188,
    replied: 42,
    applications: 16,
    openings: 7,
  },
  {
    id: 5,
    title: "Telegram — повторный прогрев",
    channel: "Telegram",
    source: "Повторная база",
    manager: "Елизавета Морозова",
    createdAt: "16.07.2026",
    createdTime: "10:45",
    status: "completed",
    uploaded: 410,
    delivered: 382,
    replied: 98,
    applications: 37,
    openings: 21,
  },
  {
    id: 6,
    title: "WhatsApp — холодная база",
    channel: "WhatsApp",
    source: "Холодная база",
    manager: "Дарья Власовская",
    createdAt: "16.07.2026",
    createdTime: "08:30",
    status: "draft",
    uploaded: 280,
    delivered: 0,
    replied: 0,
    applications: 0,
    openings: 0,
  },
];

const contactsData = [
  {
    id: 1,
    username: "@alena_work",
    phone: "+7 999 245-12-10",
    status: "opened",
    manager: "Анна Иванова",
    product: "Альфа",
    lastAction: "Открытие подтверждено",
    updatedAt: "Сегодня, 12:45",
  },
  {
    id: 2,
    username: "@roman_job",
    phone: "+7 922 418-34-20",
    status: "application",
    manager: "Анна Иванова",
    product: "ОТП",
    lastAction: "Заявка передана на проверку",
    updatedAt: "Сегодня, 12:18",
  },
  {
    id: 3,
    username: "@vika_home",
    phone: "+7 951 227-63-14",
    status: "replied",
    manager: "Анна Иванова",
    product: "Не выбран",
    lastAction: "Клиент ответил на сообщение",
    updatedAt: "Сегодня, 11:52",
  },
  {
    id: 4,
    username: "@ivan_business",
    phone: "+7 999 531-48-22",
    status: "delivered",
    manager: "Не назначен",
    product: "Не выбран",
    lastAction: "Сообщение доставлено",
    updatedAt: "Сегодня, 11:30",
  },
  {
    id: 5,
    username: "@arina_pro",
    phone: "+7 912 112-43-15",
    status: "rejected",
    manager: "Анна Иванова",
    product: "Альфа",
    lastAction: "Заявка отклонена",
    updatedAt: "Сегодня, 10:47",
  },
  {
    id: 6,
    username: "@olga_online",
    phone: "+7 950 884-36-17",
    status: "no_reply",
    manager: "Не назначен",
    product: "Не выбран",
    lastAction: "Ответ не получен",
    updatedAt: "Сегодня, 10:20",
  },
  {
    id: 7,
    username: "@maksim_live",
    phone: "+7 921 301-19-22",
    status: "application",
    manager: "Анна Иванова",
    product: "Альфа",
    lastAction: "Создана заявка",
    updatedAt: "Вчера, 19:48",
  },
  {
    id: 8,
    username: "@dasha_start",
    phone: "+7 999 014-22-71",
    status: "opened",
    manager: "Анна Иванова",
    product: "ОТП",
    lastAction: "Открытие подтверждено",
    updatedAt: "Вчера, 18:14",
  },
];

const activityData = [
  {
    id: 1,
    title: "Открытие подтверждено",
    description: "@alena_work · Альфа",
    time: "Сегодня, 12:45",
    type: "opened",
  },
  {
    id: 2,
    title: "Создана новая заявка",
    description: "@roman_job · ОТП",
    time: "Сегодня, 12:18",
    type: "application",
  },
  {
    id: 3,
    title: "Получен ответ",
    description: "@vika_home ответила на сообщение",
    time: "Сегодня, 11:52",
    type: "replied",
  },
  {
    id: 4,
    title: "Контакт передан менеджеру",
    description: "@alena_work → Анна Иванова",
    time: "Сегодня, 11:40",
    type: "manager",
  },
  {
    id: 5,
    title: "Рассылка запущена",
    description: "Загружено 500 контактов",
    time: "Сегодня, 09:10",
    type: "started",
  },
];

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
  opened: {
    title: "Открытие",
    className: "mailing-contact-status--green",
  },
  application: {
    title: "Заявка",
    className: "mailing-contact-status--purple",
  },
  replied: {
    title: "Ответил",
    className: "mailing-contact-status--blue",
  },
  delivered: {
    title: "Доставлено",
    className: "mailing-contact-status--gray",
  },
  rejected: {
    title: "Отклонено",
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

  const [mailingStatus, setMailingStatus] = useState(null);
  const [searchValue, setSearchValue] = useState("");
  const [contactStatusFilter, setContactStatusFilter] = useState("all");

  const mailing = mailingsData.find(
    (item) => item.id === Number(mailingId)
  );

  const currentStatus = mailingStatus || mailing?.status;

  const filteredContacts = useMemo(() => {
    const search = searchValue.trim().toLowerCase();

    return contactsData.filter((contact) => {
      const matchesSearch =
        !search ||
        contact.username.toLowerCase().includes(search) ||
        contact.phone.toLowerCase().includes(search) ||
        contact.manager.toLowerCase().includes(search) ||
        contact.product.toLowerCase().includes(search);

      const matchesStatus =
        contactStatusFilter === "all" ||
        contact.status === contactStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [searchValue, contactStatusFilter]);

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

  const totalConversion = getConversion(
    mailing.openings,
    mailing.uploaded
  );

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
                Запущена {mailing.createdAt} в {mailing.createdTime}
              </span>

              <span>
                <UserRound size={14} />
                Ответственный: {mailing.manager}
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
            <strong>{formatNumber(mailing.uploaded)}</strong>
            <small>Всего контактов в базе</small>
          </div>
        </article>

        <article>
          <div className="mailing-details-stat-icon mailing-details-stat-icon--blue">
            <Send size={19} />
          </div>

          <div>
            <span>Доставлено</span>
            <strong>{formatNumber(mailing.delivered)}</strong>
            <small>{deliveryConversion}% от базы</small>
          </div>
        </article>

        <article>
          <div className="mailing-details-stat-icon mailing-details-stat-icon--orange">
            <MessageCircleReply size={19} />
          </div>

          <div>
            <span>Ответили</span>
            <strong>{formatNumber(mailing.replied)}</strong>
            <small>{replyConversion}% от доставленных</small>
          </div>
        </article>

        <article>
          <div className="mailing-details-stat-icon mailing-details-stat-icon--purple">
            <FileText size={19} />
          </div>

          <div>
            <span>Заявки</span>
            <strong>{formatNumber(mailing.applications)}</strong>
            <small>{applicationConversion}% от ответов</small>
          </div>
        </article>

        <article>
          <div className="mailing-details-stat-icon mailing-details-stat-icon--green">
            <CheckCircle2 size={19} />
          </div>

          <div>
            <span>Открытия</span>
            <strong>{formatNumber(mailing.openings)}</strong>
            <small>{openingConversion}% от заявок</small>
          </div>
        </article>
      </section>

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
              <strong>{formatNumber(mailing.uploaded)}</strong>
            </div>

            <small>100%</small>
          </div>

          <div className="mailing-details-funnel-line">
            <span style={{ width: `${deliveryConversion}%` }} />
          </div>

          <div className="mailing-details-funnel-step">
            <div>
              <span>Доставлено</span>
              <strong>{formatNumber(mailing.delivered)}</strong>
            </div>

            <small>{deliveryConversion}%</small>
          </div>

          <div className="mailing-details-funnel-line">
            <span style={{ width: `${replyConversion}%` }} />
          </div>

          <div className="mailing-details-funnel-step">
            <div>
              <span>Ответили</span>
              <strong>{formatNumber(mailing.replied)}</strong>
            </div>

            <small>{replyConversion}%</small>
          </div>

          <div className="mailing-details-funnel-line">
            <span style={{ width: `${applicationConversion}%` }} />
          </div>

          <div className="mailing-details-funnel-step">
            <div>
              <span>Заявки</span>
              <strong>{formatNumber(mailing.applications)}</strong>
            </div>

            <small>{applicationConversion}%</small>
          </div>

          <div className="mailing-details-funnel-line">
            <span style={{ width: `${openingConversion}%` }} />
          </div>

          <div className="mailing-details-funnel-step mailing-details-funnel-step--result">
            <div>
              <span>Открытия</span>
              <strong>{formatNumber(mailing.openings)}</strong>
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
                <option value="all">Все статусы</option>
                <option value="opened">Открытия</option>
                <option value="application">Заявки</option>
                <option value="replied">Ответили</option>
                <option value="delivered">Доставлено</option>
                <option value="no_reply">Без ответа</option>
                <option value="rejected">Отклонено</option>
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
                  <th>Статус</th>
                  <th>Продукт</th>
                  <th>Менеджер</th>
                  <th>Последнее действие</th>
                </tr>
              </thead>

              <tbody>
                {filteredContacts.map((contact) => {
                  const contactStatus =
                    contactStatusConfig[contact.status];

                  return (
                    <tr key={contact.id}>
                      <td>
                        <strong>{contact.username}</strong>
                        <span>{contact.phone}</span>
                      </td>

                      <td>
                        <span
                          className={`mailing-contact-status ${contactStatus.className}`}
                        >
                          {contactStatus.title}
                        </span>
                      </td>

                      <td>{contact.product}</td>
                      <td>{contact.manager}</td>

                      <td>
                        <strong>{contact.lastAction}</strong>
                        <span>{contact.updatedAt}</span>
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
            {activityData.map((activity) => (
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