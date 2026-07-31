import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CheckCircle2,
  Clock3,
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

const statusConfig = {
  new: "Новый",
  telegram_found: "Telegram найден",
  telegram_not_found: "Telegram не найден",
  assigned: "Назначен",
  sent: "Сообщение отправлено",
  responded: "Ответил",
  application: "Создана заявка",
  opened: "Открытие",
  rejected: "Отказ",
  duplicate: "Дубликат",
};

export default function MyContacts() {
  const [contacts, setContacts] =
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
      ] = await Promise.all([
        mailingContactService
          .getMyContacts(),

        productService
          .getActiveProducts(),
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

      setLoading(false);
    },
    []
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredContacts = useMemo(() => {
    const search = searchValue
      .trim()
      .toLowerCase();

    return contacts.filter(
      (contact) => {
        const searchableValue = [
          contact.full_name,
          contact.phone,
          contact.email,
          contact.telegram_username,
          contact.mailing?.name,
          contact.mailing?.title,
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
    contacts,
    searchValue,
    statusFilter,
  ]);

  const stats = useMemo(() => {
    return contacts.reduce(
      (result, contact) => {
        result.total += 1;

        if (contact.sent_at) {
          result.sent += 1;
        }

        if (contact.responded_at) {
          result.responded += 1;
        }

        if (
          contact.application_created_at
        ) {
          result.applications += 1;
        }

        return result;
      },
      {
        total: 0,
        sent: 0,
        responded: 0,
        applications: 0,
      }
    );
  }, [contacts]);

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

  async function handleMarkSent(
    contact
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
        .markAsSent(contact.id);

    if (result.error) {
      window.alert(
        result.error.message ||
          "Не удалось отметить отправку."
      );

      setActionLoading(false);
      return;
    }

    updateContactOnPage(result.data);
    setActionLoading(false);
  }

  async function handleMarkResponded(
    contact
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
        .markAsResponded(contact.id);

    if (result.error) {
      window.alert(
        result.error.message ||
          "Не удалось отметить ответ."
      );

      setActionLoading(false);
      return;
    }

    updateContactOnPage(result.data);
    setActionLoading(false);
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

  async function handleCreateApplication(
    contact,
    productId
  ) {
    if (
      !contact?.id ||
      !productId ||
      actionLoading
    ) {
      return;
    }

    setActionLoading(true);

    const result =
      await applicationService
        .createApplicationFromContact(
          contact,
          contact.manager_id || null,
          productId
        );

    if (result.error) {
      window.alert(
        result.error.message ||
          "Не удалось создать заявку."
      );

      setActionLoading(false);
      return;
    }

    if (result.contact) {
      updateContactOnPage(
        result.contact
      );
    } else {
      await loadData();
    }

    const product =
      products.find(
        (item) =>
          item.id === productId
      );

    window.alert(
      result.alreadyExists
        ? `Заявка по продукту "${
            product?.name ||
            "выбранный продукт"
          }" уже существует.`
        : `Заявка по продукту "${
            product?.name ||
            "выбранный продукт"
          }" создана.`
    );

    setActionLoading(false);
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
            Здесь находятся только
            контакты, назначенные вам
            администратором.
          </p>
        </div>

        <button
          className="secondary-button button-with-icon"
          type="button"
          onClick={loadData}
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
          title="Всего контактов"
          value={stats.total}
        />

        <StatCard
          icon={Send}
          title="Сообщение отправлено"
          value={stats.sent}
        />

        <StatCard
          icon={MessageCircle}
          title="Ответили"
          value={stats.responded}
        />

        <StatCard
          icon={CheckCircle2}
          title="Создано заявок"
          value={stats.applications}
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
            placeholder="Поиск по имени, телефону или Telegram"
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
            Все статусы
          </option>

          {Object.entries(
            statusConfig
          ).map(
            ([value, title]) => (
              <option
                key={value}
                value={value}
              >
                {title}
              </option>
            )
          )}
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
            Администратор ещё не
            назначил вам контакты или
            они не подходят под фильтр.
          </span>
        </div>
      ) : (
        <section className="my-contacts-grid">
          {filteredContacts.map(
            (contact) => (
              <article
                className="my-contact-card"
                key={contact.id}
                onClick={() =>
                  setSelectedContact(
                    contact
                  )
                }
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
                      "new"
                    }`}
                  >
                    {statusConfig[
                      contact.status
                    ] ||
                      contact.status ||
                      "Новый"}
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
                        : contact.sent_at
                          ? `Отправлено: ${formatDate(
                              contact.sent_at
                            )}`
                          : "Сообщение не отправлено"
                    }
                  />
                </div>

                <button
                  className="my-contact-card__button"
                  type="button"
                >
                  Открыть контакт
                </button>
              </article>
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
        managers={[]}
        products={products}
        onMarkSent={handleMarkSent}
        onMarkResponded={
          handleMarkResponded
        }
        onSaveComment={
          handleSaveComment
        }
        onCreateApplication={
          handleCreateApplication
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