import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FilePlus2,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Send,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";

import ContactDrawer from "../components/mailings/ContactDrawer";

import {
  applicationService,
} from "../services/applicationService";

import mailingContactService from "../services/mailingContactService";

import {
  mailingService,
} from "../services/mailingService";

import {
  productService,
} from "../services/productService";

import "../styles/MailingContacts.css";

const contactStatusConfig = {
  new: "Не ответил",
  telegram_found: "Telegram найден",
  telegram_not_found: "Telegram не найден",
  assigned: "Закреплён",
  sent: "Сообщение отправлено",
  responded: "Ответил",
  application: "Есть заявка",
  opened: "Открытие",
  rejected: "Отказ",
  duplicate: "Дубликат",
};

const processFilterOptions = [
  {
    value: "all",
    title: "Все контакты",
  },
  {
    value: "responded",
    title: "Ответили",
  },
  {
    value: "not_responded",
    title: "Не ответили",
  },
  {
    value: "with_application",
    title: "Есть заявки",
  },
  {
    value: "without_application",
    title: "Без заявки",
  },
];

export default function MailingContacts() {
  const navigate = useNavigate();
  const { mailingId } = useParams();

  const [mailing, setMailing] =
    useState(null);

  const [contacts, setContacts] =
    useState([]);

  const [applications, setApplications] =
    useState([]);

  const [managers, setManagers] =
    useState([]);

  const [products, setProducts] =
    useState([]);

  const [
    selectedContact,
    setSelectedContact,
  ] = useState(null);

  const [searchValue, setSearchValue] =
    useState("");

  const [
    processFilter,
    setProcessFilter,
  ] = useState("all");

  const [loading, setLoading] =
    useState(true);

  const [
    actionLoading,
    setActionLoading,
  ] = useState(false);

  const [loadError, setLoadError] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const loadPageData = useCallback(
    async ({
      showLoader = true,
    } = {}) => {
      if (!mailingId) {
        setLoadError(
          "Не указан ID рассылки."
        );

        setLoading(false);
        return;
      }

      if (showLoader) {
        setLoading(true);
      }

      setLoadError("");
      setSuccessMessage("");

      const [
        mailingResult,
        contactsResult,
        applicationsResult,
        managersResult,
        productsResult,
      ] = await Promise.all([
        mailingService.getMailingById(
          mailingId
        ),

        mailingContactService
          .getContactsByMailingId(
            mailingId
          ),

        applicationService
          .getApplications(),

        mailingContactService
          .getActiveManagers(),

        productService
          .getActiveProducts(),
      ]);

      if (mailingResult.error) {
        console.error(
          "Ошибка загрузки рассылки:",
          mailingResult.error
        );

        setLoadError(
          mailingResult.error.message ||
            "Не удалось загрузить рассылку."
        );

        setLoading(false);
        return;
      }

      if (contactsResult.error) {
        console.error(
          "Ошибка загрузки контактов:",
          contactsResult.error
        );

        setLoadError(
          contactsResult.error.message ||
            "Не удалось загрузить контакты."
        );

        setLoading(false);
        return;
      }

      if (applicationsResult.error) {
        console.error(
          "Ошибка загрузки заявок:",
          applicationsResult.error
        );
      }

      if (managersResult.error) {
        console.error(
          "Ошибка загрузки менеджеров:",
          managersResult.error
        );
      }

      if (productsResult.error) {
        console.error(
          "Ошибка загрузки продуктов:",
          productsResult.error
        );
      }

      setMailing(
        mailingResult.data
      );

      setContacts(
        contactsResult.data || []
      );

      setApplications(
        (
          applicationsResult.data || []
        ).filter(
          (application) =>
            application.mailing_id ===
            mailingId
        )
      );

      setManagers(
        managersResult.data || []
      );

      setProducts(
        productsResult.data || []
      );

      setLoading(false);
    },
    [mailingId]
  );

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  const applicationsByContact =
    useMemo(() => {
      return applications.reduce(
        (result, application) => {
          const contactId =
            application.mailing_contact_id;

          if (!contactId) {
            return result;
          }

          if (!result[contactId]) {
            result[contactId] = [];
          }

          result[contactId].push(
            application
          );

          return result;
        },
        {}
      );
    }, [applications]);

  const preparedContacts = useMemo(
    () => {
      return contacts.map(
        (contact) => {
          const contactApplications =
            applicationsByContact[
              contact.id
            ] || [];

          return {
            ...contact,

            applications:
              contactApplications,

            applications_count:
              contactApplications.length,

            has_responded:
              Boolean(
                contact.responded_at
              ),

            has_application:
              contactApplications.length >
              0,
          };
        }
      );
    },
    [
      contacts,
      applicationsByContact,
    ]
  );

  const filteredContacts = useMemo(() => {
    const search = searchValue
      .trim()
      .toLowerCase();

    return preparedContacts.filter(
      (contact) => {
        const searchableValue = [
          contact.full_name,
          contact.phone,
          contact.email,
          contact.telegram_username,
          contact.manager?.full_name,
          contact.manager?.email,

          ...contact.applications.map(
            (application) =>
              application
                .product_data?.name ||
              application.product
          ),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const matchesSearch =
          !search ||
          searchableValue.includes(
            search
          );

        let matchesProcess = true;

        if (
          processFilter ===
          "responded"
        ) {
          matchesProcess =
            contact.has_responded;
        }

        if (
          processFilter ===
          "not_responded"
        ) {
          matchesProcess =
            !contact.has_responded;
        }

        if (
          processFilter ===
          "with_application"
        ) {
          matchesProcess =
            contact.has_application;
        }

        if (
          processFilter ===
          "without_application"
        ) {
          matchesProcess =
            !contact.has_application;
        }

        return (
          matchesSearch &&
          matchesProcess
        );
      }
    );
  }, [
    preparedContacts,
    searchValue,
    processFilter,
  ]);

  const counters = useMemo(() => {
    const responded =
      preparedContacts.filter(
        (contact) =>
          contact.has_responded
      ).length;

    const notResponded =
      preparedContacts.length -
      responded;

    const contactsWithApplications =
      preparedContacts.filter(
        (contact) =>
          contact.has_application
      ).length;

    const approved =
      applications.filter(
        (application) =>
          application.status ===
          "approved"
      ).length;

    const responseRate =
      preparedContacts.length > 0
        ? (
            (responded /
              preparedContacts.length) *
            100
          ).toFixed(1)
        : "0.0";

    return {
      total:
        preparedContacts.length,

      responded,

      notResponded,

      applications:
        applications.length,

      contactsWithApplications,

      approved,

      responseRate,
    };
  }, [
    preparedContacts,
    applications,
  ]);

  function updateContactOnPage(
    updatedContact
  ) {
    if (!updatedContact?.id) {
      return;
    }

    setContacts(
      (currentContacts) =>
        currentContacts.map(
          (contact) =>
            contact.id ===
            updatedContact.id
              ? {
                  ...contact,
                  ...updatedContact,
                }
              : contact
        )
    );

    setSelectedContact(
      (currentContact) => {
        if (
          !currentContact ||
          currentContact.id !==
            updatedContact.id
        ) {
          return currentContact;
        }

        return {
          ...currentContact,
          ...updatedContact,
        };
      }
    );
  }

  async function handleSaveComment(
    contact,
    comment
  ) {
    if (
      !contact?.id ||
      actionLoading
    ) {
      return;
    }

    setActionLoading(true);

    const result =
      await mailingContactService
        .updateComment(
          contact.id,
          comment
        );

    if (result.error) {
      window.alert(
        result.error.message ||
          "Не удалось сохранить комментарий."
      );

      setActionLoading(false);
      return;
    }

    updateContactOnPage(result.data);

    setSuccessMessage(
      "Комментарий сохранён"
    );

    setActionLoading(false);
  }

  async function handleAssignManager(
    contact,
    managerId
  ) {
    if (
      !contact?.id ||
      actionLoading
    ) {
      return;
    }

    setActionLoading(true);

    const result =
      await mailingContactService
        .assignManager(
          contact.id,
          managerId
        );

    if (result.error) {
      window.alert(
        result.error.message ||
          "Не удалось изменить менеджера."
      );

      setActionLoading(false);
      return;
    }

    const manager =
      managers.find(
        (item) =>
          item.id === managerId
      ) || null;

    updateContactOnPage({
      ...result.data,
      manager,
    });

    setSuccessMessage(
      managerId
        ? "Менеджер изменён"
        : "Менеджер снят"
    );

    setActionLoading(false);
  }

  async function handleContactChanged(
    updatedContact
  ) {
    if (updatedContact?.id) {
      updateContactOnPage(
        updatedContact
      );
    }

    const applicationsResult =
      await applicationService
        .getApplications();

    if (applicationsResult.error) {
      console.error(
        "Ошибка обновления заявок:",
        applicationsResult.error
      );

      return;
    }

    setApplications(
      (
        applicationsResult.data || []
      ).filter(
        (application) =>
          application.mailing_id ===
          mailingId
      )
    );
  }

  function handleExportUnanswered() {
    const unansweredContacts =
      preparedContacts.filter(
        (contact) =>
          !contact.has_responded
      );

    if (
      unansweredContacts.length === 0
    ) {
      window.alert(
        "В этой рассылке нет неответивших контактов."
      );

      return;
    }

    const rows = [
      [
        "Имя",
        "Телефон",
        "Email",
        "Telegram",
        "Рассылка",
      ],

      ...unansweredContacts.map(
        (contact) => [
          contact.full_name || "",
          contact.phone || "",
          contact.email || "",
          formatTelegram(
            contact.telegram_username
          ),
          mailing?.name ||
            mailing?.title ||
            "",
        ]
      ),
    ];

    const csv = rows
      .map((row) =>
        row
          .map(escapeCsvValue)
          .join(";")
      )
      .join("\n");

    const blob = new Blob(
      [`\uFEFF${csv}`],
      {
        type:
          "text/csv;charset=utf-8;",
      }
    );

    const downloadUrl =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = downloadUrl;

    link.download =
      `Неответившие-${sanitizeFileName(
        mailing?.name ||
          mailing?.title ||
          mailingId
      )}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(
      downloadUrl
    );

    setSuccessMessage(
      `Выгружено контактов: ${unansweredContacts.length}`
    );
  }

  if (loading) {
    return (
      <main className="page">
        <div className="mailing-contacts-state">
          <div className="mailing-contacts-loader" />

          <h2>
            Загружаем контакты...
          </h2>

          <p>
            Получаем актуальные данные
            из CRM.
          </p>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="page">
        <div className="mailing-contacts-state">
          <XCircle size={34} />

          <h2>
            Не удалось открыть рассылку
          </h2>

          <p>{loadError}</p>

          <button
            type="button"
            className="primary-button"
            onClick={() =>
              loadPageData()
            }
          >
            Повторить
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page mailing-contacts-page">
      <header className="mailing-contacts-header">
        <div>
          <button
            type="button"
            className="mailing-contacts-back"
            onClick={() =>
              navigate("/mailings")
            }
          >
            <ArrowLeft size={17} />
            Назад к рассылкам
          </button>

          <h1>
            {mailing?.name ||
              mailing?.title ||
              "Контакты рассылки"}
          </h1>

          <p>
            Общая база пользователей,
            которым выполнялась рассылка.
            Менеджеры самостоятельно
            отмечают тех, кто им написал.
          </p>
        </div>

        <div className="mailing-contacts-header__actions">
          <button
            type="button"
            className="secondary-button button-with-icon"
            onClick={() =>
              loadPageData()
            }
            disabled={
              loading ||
              actionLoading
            }
          >
            <RefreshCw size={16} />
            Обновить
          </button>

          <button
            type="button"
            className="primary-button button-with-icon"
            onClick={
              handleExportUnanswered
            }
          >
            <Download size={16} />
            Выгрузить неответивших
          </button>
        </div>
      </header>

      {successMessage && (
        <div className="mailing-contacts-alert mailing-contacts-alert--success">
          <CheckCircle2 size={17} />
          <span>
            {successMessage}
          </span>
        </div>
      )}

      <section className="mailing-contacts-summary mailing-contacts-summary--extended">
        <SummaryCard
          icon={Users}
          title="Всего в рассылке"
          value={counters.total}
        />

        <SummaryCard
          icon={MessageCircle}
          title="Ответили"
          value={counters.responded}
          variant="success"
        />

        <SummaryCard
          icon={XCircle}
          title="Не ответили"
          value={counters.notResponded}
          variant="danger"
        />

        <SummaryCard
          icon={FilePlus2}
          title="Создано заявок"
          value={counters.applications}
          variant="warning"
        />

        <SummaryCard
          icon={CheckCircle2}
          title="Успешно открыто"
          value={counters.approved}
          variant="success"
        />

        <SummaryCard
          icon={Send}
          title="Конверсия в ответ"
          value={`${counters.responseRate}%`}
          variant="blue"
        />
      </section>

      <section className="mailing-contacts-toolbar">
        <div className="search-field">
          <Search size={18} />

          <input
            type="search"
            value={searchValue}
            onChange={(event) =>
              setSearchValue(
                event.target.value
              )
            }
            placeholder="Имя, телефон, email, Telegram, менеджер или продукт"
          />
        </div>

        <div className="toolbar-filter">
          <select
            value={processFilter}
            onChange={(event) =>
              setProcessFilter(
                event.target.value
              )
            }
          >
            {processFilterOptions.map(
              (option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.title}
                </option>
              )
            )}
          </select>
        </div>
      </section>

      <div className="mailing-contacts-result">
        Найдено контактов:{" "}
        <strong>
          {filteredContacts.length}
        </strong>
      </div>

      {filteredContacts.length === 0 ? (
        <div className="mailing-contacts-state">
          <Search size={30} />

          <h2>
            Контакты не найдены
          </h2>

          <p>
            Измените поисковый запрос
            или выбранный фильтр.
          </p>
        </div>
      ) : (
        <section className="mailing-contacts-list">
          {filteredContacts.map(
            (contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                onOpen={() =>
                  setSelectedContact(
                    contact
                  )
                }
              />
            )
          )}
        </section>
      )}

      <ContactDrawer
        contact={selectedContact}
        isOpen={Boolean(
          selectedContact
        )}
        onClose={() =>
          setSelectedContact(null)
        }
        managers={managers}
        products={products}
        onAssignManager={
          handleAssignManager
        }
        onSaveComment={
          handleSaveComment
        }
        onContactChanged={
          handleContactChanged
        }
        actionLoading={
          actionLoading
        }
      />
    </main>
  );
}

function ContactCard({
  contact,
  onOpen,
}) {
  const latestApplication =
    contact.applications?.[0] ||
    null;

  return (
    <article
      className={[
        "mailing-contact-card",
        contact.has_responded
          ? "mailing-contact-card--responded"
          : "mailing-contact-card--unanswered",
      ]
        .filter(Boolean)
        .join(" ")}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" ||
          event.key === " "
        ) {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="mailing-contact-avatar">
        <UserRound size={20} />
      </div>

      <div className="mailing-contact-main">
        <div className="mailing-contact-heading">
          <div>
            <h2>
              {getContactName(contact)}
            </h2>

            <div className="mailing-contact-badges">
              <span
                className={
                  contact.has_responded
                    ? "mailing-contact-response mailing-contact-response--yes"
                    : "mailing-contact-response mailing-contact-response--no"
                }
              >
                {contact.has_responded
                  ? "Ответил"
                  : "Не ответил"}
              </span>

              {contact.has_application && (
                <span className="mailing-contact-application-count">
                  {contact.applications_count}{" "}
                  {getApplicationsWord(
                    contact.applications_count
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mailing-contact-details">
          <ContactDetail
            icon={Phone}
            value={
              contact.phone ||
              "Телефон не указан"
            }
          />

          <ContactDetail
            icon={Mail}
            value={
              contact.email ||
              "Email не указан"
            }
          />

          <ContactDetail
            icon={Send}
            value={
              formatTelegram(
                contact.telegram_username
              ) ||
              "Telegram не указан"
            }
          />

          <ContactDetail
            icon={UserRound}
            value={`Менеджер: ${getManagerName(
              contact.manager
            )}`}
          />
        </div>

        {latestApplication && (
          <div className="mailing-contact-latest-application">
            <div>
              <span>
                Последняя заявка
              </span>

              <strong>
                {latestApplication
                  .product_data?.name ||
                  latestApplication.product ||
                  "Продукт не указан"}
              </strong>
            </div>

            <span
              className={`mailing-contact-application-status mailing-contact-application-status--${latestApplication.status}`}
            >
              {getApplicationStatusName(
                latestApplication.status
              )}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

function SummaryCard({
  icon: Icon,
  title,
  value,
  variant = "",
}) {
  return (
    <article
      className={[
        "mailing-contacts-summary-card",
        variant
          ? `mailing-contacts-summary-card--${variant}`
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="mailing-contacts-summary-card__icon">
        <Icon size={19} />
      </div>

      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function ContactDetail({
  icon: Icon,
  value,
}) {
  return (
    <div>
      <Icon size={15} />
      <span>{value}</span>
    </div>
  );
}

function getContactName(contact) {
  return (
    contact?.full_name ||
    formatTelegram(
      contact?.telegram_username
    ) ||
    contact?.phone ||
    "Без имени"
  );
}

function getManagerName(manager) {
  if (!manager) {
    return "Не закреплён";
  }

  return (
    manager.full_name ||
    manager.name ||
    manager.email ||
    "Не закреплён"
  );
}

function formatTelegram(value) {
  if (!value) {
    return "";
  }

  const username = String(value)
    .trim()
    .replace(
      /^https?:\/\/t\.me\//i,
      ""
    )
    .replace(/^t\.me\//i, "")
    .replace(/^@+/, "");

  return username
    ? `@${username}`
    : "";
}

function getApplicationStatusName(
  status
) {
  const labels = {
    new: "Новая",
    in_progress: "В работе",
    approved: "Успешно открыта",
    rejected: "Отказ",
  };

  return (
    labels[status] ||
    status ||
    "Не указан"
  );
}

function getApplicationsWord(value) {
  const number =
    Math.abs(Number(value || 0));

  const lastTwoDigits =
    number % 100;

  const lastDigit =
    number % 10;

  if (
    lastTwoDigits >= 11 &&
    lastTwoDigits <= 19
  ) {
    return "заявок";
  }

  if (lastDigit === 1) {
    return "заявка";
  }

  if (
    lastDigit >= 2 &&
    lastDigit <= 4
  ) {
    return "заявки";
  }

  return "заявок";
}

function escapeCsvValue(value) {
  const normalizedValue = String(
    value ?? ""
  ).replaceAll('"', '""');

  return `"${normalizedValue}"`;
}

function sanitizeFileName(value) {
  return String(value || "рассылка")
    .replace(
      /[\\/:*?"<>|]+/g,
      "-"
    )
    .trim();
}