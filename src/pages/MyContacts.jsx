import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CheckCircle2,
  Clock3,
  FilePlus2,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Send,
  UserRound,
} from "lucide-react";

import ContactDrawer from "../components/mailings/ContactDrawer";

import { applicationService } from "../services/applicationService";
import mailingContactService from "../services/mailingContactService";
import { productService } from "../services/productService";

import "../styles/MyContacts.css";

const contactStatusConfig = {
  new: "Новый",
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

const applicationStatusConfig = {
  new: "Новая",
  in_progress: "В работе",
  approved: "Успешно открыта",
  rejected: "Отказ",
};

export default function MyContacts() {
  const [contacts, setContacts] =
    useState([]);

  const [applications, setApplications] =
    useState([]);

  const [products, setProducts] =
    useState([]);

  const [
    selectedContact,
    setSelectedContact,
  ] = useState(null);

  const [searchValue, setSearchValue] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [loading, setLoading] =
    useState(true);

  const [
    actionLoading,
    setActionLoading,
  ] = useState(false);

  const [error, setError] =
    useState("");

  const loadData = useCallback(
    async () => {
      setLoading(true);
      setError("");

      const [
        contactsResult,
        productsResult,
        applicationsResult,
      ] = await Promise.all([
        mailingContactService
          .getMyContacts(),

        productService
          .getActiveProducts(),

        applicationService
          .getApplications(),
      ]);

      if (contactsResult.error) {
        console.error(
          "Ошибка загрузки контактов:",
          contactsResult.error
        );

        setError(
          contactsResult.error.message ||
            "Не удалось загрузить контакты."
        );

        setContacts([]);
      } else {
        setContacts(
          contactsResult.data || []
        );
      }

      if (productsResult.error) {
        console.error(
          "Ошибка загрузки продуктов:",
          productsResult.error
        );

        setProducts([]);
      } else {
        setProducts(
          productsResult.data || []
        );
      }

      if (applicationsResult.error) {
        console.error(
          "Ошибка загрузки заявок:",
          applicationsResult.error
        );

        setApplications([]);
      } else {
        setApplications(
          applicationsResult.data || []
        );
      }

      setLoading(false);
    },
    []
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const preparedContacts = useMemo(() => {
    return contacts.map((contact) => {
      const contactApplications =
        applicationsByContact[
          contact.id
        ] || [];

      const latestApplication =
        contactApplications[0] || null;

      return {
        ...contact,

        applications:
          contactApplications,

        applications_count:
          contactApplications.length,

        latest_application:
          latestApplication,
      };
    });
  }, [
    contacts,
    applicationsByContact,
  ]);

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
          contact.mailing?.name,
          contact.mailing?.title,
          contact.latest_application
            ?.product_data?.name,
          contact.latest_application
            ?.product,
          applicationStatusConfig[
            contact.latest_application
              ?.status
          ],
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const matchesSearch =
          !search ||
          searchableValue.includes(
            search
          );

        const matchesStatus =
          statusFilter === "all" ||
          contact.status ===
            statusFilter;

        return (
          matchesSearch &&
          matchesStatus
        );
      }
    );
  }, [
    preparedContacts,
    searchValue,
    statusFilter,
  ]);

  const stats = useMemo(() => {
    return {
      totalContacts:
        preparedContacts.length,

      responded:
        preparedContacts.filter(
          (contact) =>
            Boolean(
              contact.responded_at
            )
        ).length,

      applications:
        applications.length,

      approved:
        applications.filter(
          (application) =>
            application.status ===
            "approved"
        ).length,
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
    } else {
      setApplications(
        applicationsResult.data || []
      );
    }
  }

  function openContact(contact) {
    setSelectedContact(contact);
  }

  if (loading) {
    return (
      <main className="page">
        <div className="my-contacts-state">
          <div className="my-contacts-spinner" />

          <strong>
            Загружаем ваши контакты...
          </strong>
        </div>
      </main>
    );
  }

  return (
    <main className="page my-contacts-page">
      <section className="my-contacts-header">
        <div>
          <span className="my-contacts-eyebrow">
            Рабочая база
          </span>

          <h1>Мои контакты</h1>

          <p>
            Здесь отображаются пользователи,
            которых вы отметили как ответивших.
            Откройте контакт, чтобы создать или
            изменить заявку.
          </p>
        </div>

        <button
          className="secondary-button button-with-icon"
          type="button"
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw size={17} />
          Обновить
        </button>
      </section>

      {error && (
        <div className="my-contacts-alert">
          {error}
        </div>
      )}

      <section className="my-contacts-stats">
        <StatCard
          icon={UserRound}
          title="Мои контакты"
          value={
            stats.totalContacts
          }
        />

        <StatCard
          icon={MessageCircle}
          title="Ответили"
          value={stats.responded}
        />

        <StatCard
          icon={FilePlus2}
          title="Всего заявок"
          value={stats.applications}
        />

        <StatCard
          icon={CheckCircle2}
          title="Успешно открыто"
          value={stats.approved}
        />
      </section>

      <section className="my-contacts-toolbar">
        <div className="my-contacts-search">
          <Search size={18} />

          <input
            type="search"
            value={searchValue}
            onChange={(event) =>
              setSearchValue(
                event.target.value
              )
            }
            placeholder="Имя, телефон, Telegram или продукт"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(
              event.target.value
            )
          }
        >
          <option value="all">
            Все контакты
          </option>

          <option value="responded">
            Без заявки
          </option>

          <option value="application">
            Есть заявки
          </option>
        </select>
      </section>

      <div className="my-contacts-result">
        Найдено:{" "}
        <strong>
          {filteredContacts.length}
        </strong>
      </div>

      {filteredContacts.length === 0 ? (
        <div className="my-contacts-state">
          <UserRound size={40} />

          <strong>
            Контакты не найдены
          </strong>

          <span>
            Вы ещё не занесли ответивших
            пользователей или контакты не
            подходят под выбранный фильтр.
          </span>
        </div>
      ) : (
        <section className="my-contacts-grid">
          {filteredContacts.map(
            (contact) => {
              const latestApplication =
                contact.latest_application;

              return (
                <article
                  className="my-contact-card"
                  key={contact.id}
                >
                  <div className="my-contact-card__top">
                    <div className="my-contact-card__avatar">
                      <UserRound
                        size={19}
                      />
                    </div>

                    <div className="my-contact-card__identity">
                      <strong>
                        {contact.full_name ||
                          contact.telegram_username ||
                          contact.phone ||
                          "Без имени"}
                      </strong>

                      <span>
                        {contact.mailing
                          ?.name ||
                          contact.mailing
                            ?.title ||
                          "Рассылка не указана"}
                      </span>
                    </div>

                    <span
                      className={`my-contact-status my-contact-status--${
                        contact.status ||
                        "responded"
                      }`}
                    >
                      {contact
                        .applications_count >
                      0
                        ? `${
                            contact
                              .applications_count
                          } ${getApplicationsWord(
                            contact
                              .applications_count
                          )}`
                        : "Без заявки"}
                    </span>
                  </div>

                  <div className="my-contact-card__details">
                    <DetailRow
                      icon={Phone}
                      value={
                        contact.phone ||
                        "Телефон не указан"
                      }
                    />

                    <DetailRow
                      icon={Send}
                      value={
                        contact.telegram_username
                          ? `@${String(
                              contact.telegram_username
                            ).replace(
                              /^@/,
                              ""
                            )}`
                          : "Telegram не найден"
                      }
                    />

                    <DetailRow
                      icon={Mail}
                      value={
                        contact.email ||
                        "Email не указан"
                      }
                    />

                    <DetailRow
                      icon={Clock3}
                      value={
                        contact.responded_at
                          ? `Ответил: ${formatDate(
                              contact.responded_at
                            )}`
                          : "Дата ответа не указана"
                      }
                    />
                  </div>

                  {latestApplication ? (
                    <div className="my-contact-application-preview">
                      <div>
                        <span>
                          Последняя заявка
                        </span>

                        <strong>
                          {latestApplication
                            .product_data
                            ?.name ||
                            latestApplication
                              .product ||
                            "Без продукта"}
                        </strong>
                      </div>

                      <span
                        className={`my-contact-application-status my-contact-application-status--${latestApplication.status}`}
                      >
                        {applicationStatusConfig[
                          latestApplication
                            .status
                        ] ||
                          latestApplication
                            .status}
                      </span>
                    </div>
                  ) : (
                    <div className="my-contact-no-application">
                      <FilePlus2 size={17} />

                      <span>
                        Заявка ещё не создана
                      </span>
                    </div>
                  )}

                  <div className="my-contact-card__actions">
                    <button
                      className="my-contact-card__button"
                      type="button"
                      onClick={() =>
                        openContact(contact)
                      }
                    >
                      {contact
                        .applications_count >
                      0
                        ? "Открыть и редактировать"
                        : "Создать заявку"}
                    </button>
                  </div>
                </article>
              );
            }
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
        managers={[]}
        products={products}
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

function StatCard({
  icon: Icon,
  title,
  value,
}) {
  return (
    <article className="my-contacts-stat">
      <div>
        <Icon size={19} />
      </div>

      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  );
}

function DetailRow({
  icon: Icon,
  value,
}) {
  return (
    <div className="my-contact-detail">
      <Icon size={15} />
      <span>{value}</span>
    </div>
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

function formatDate(value) {
  if (!value) {
    return "Не указано";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "Не указано";
  }

  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(date);
}