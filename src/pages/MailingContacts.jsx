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
  Mail,
  Phone,
  RefreshCw,
  Search,
  Send,
  UserRound,
} from "lucide-react";

import ContactDrawer from "../components/mailings/ContactDrawer";

import { applicationService } from "../services/applicationService";
import mailingContactService from "../services/mailingContactService";
import { mailingService } from "../services/mailingService";
import { productService } from "../services/productService";

import "../styles/MailingContacts.css";

const contactStatusConfig = {
  new: "Новый",
  telegram_found: "Telegram найден",
  telegram_not_found: "Telegram не найден",
  assigned: "Назначен менеджеру",
  sent: "Сообщение отправлено",
  responded: "Ответил",
  application: "Создана заявка",
  opened: "Открытие",
  rejected: "Отказ",
  duplicate: "Дубликат",
};

function getContactName(contact) {
  return (
    contact?.full_name ||
    "Без имени"
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

export default function MailingContacts() {
  const navigate = useNavigate();
  const { mailingId } = useParams();

  const [mailing, setMailing] =
    useState(null);

  const [contacts, setContacts] =
    useState([]);

  const [managers, setManagers] =
    useState([]);

  const [products, setProducts] =
    useState([]);

  const [
    selectedContact,
    setSelectedContact,
  ] = useState(null);

  const [
    selectedContactIds,
    setSelectedContactIds,
  ] = useState([]);

  const [
    bulkManagerId,
    setBulkManagerId,
  ] = useState("");

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

  const [loadError, setLoadError] =
    useState("");

  const loadPageData = useCallback(
    async () => {
      if (!mailingId) {
        setLoadError(
          "Не указан ID партии."
        );

        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError("");

      const [
        mailingResult,
        contactsResult,
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

        mailingContactService
          .getActiveManagers(),

        productService
          .getActiveProducts(),
      ]);

      if (mailingResult.error) {
        console.error(
          "Ошибка загрузки партии:",
          mailingResult.error
        );

        setLoadError(
          mailingResult.error.message ||
            "Не удалось загрузить партию."
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
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const matchesSearch =
          !search ||
          searchableValue.includes(search);

        const matchesStatus =
          statusFilter === "all" ||
          contact.status === statusFilter;

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

  const counters = useMemo(() => {
    return contacts.reduce(
      (result, contact) => {
        result.total += 1;

        if (contact.telegram_found) {
          result.telegramFound += 1;
        }

        if (contact.manager_id) {
          result.assigned += 1;
        }

        if (contact.responded_at) {
          result.responded += 1;
        }

        return result;
      },
      {
        total: 0,
        telegramFound: 0,
        assigned: 0,
        responded: 0,
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
      console.error(
        "Ошибка изменения статуса:",
        result.error
      );

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
      console.error(
        "Ошибка изменения статуса:",
        result.error
      );

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
      console.error(
        "Ошибка сохранения комментария:",
        result.error
      );

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
          "Не удалось назначить менеджера."
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

    setActionLoading(false);
  }

  function toggleContactSelection(
    contactId
  ) {
    setSelectedContactIds(
      (currentIds) => {
        if (
          currentIds.includes(
            contactId
          )
        ) {
          return currentIds.filter(
            (id) =>
              id !== contactId
          );
        }

        return [
          ...currentIds,
          contactId,
        ];
      }
    );
  }

  const allFilteredSelected =
    filteredContacts.length > 0 &&
    filteredContacts.every(
      (contact) =>
        selectedContactIds.includes(
          contact.id
        )
    );

  function toggleSelectAllFiltered() {
    const filteredIds =
      filteredContacts.map(
        (contact) => contact.id
      );

    setSelectedContactIds(
      (currentIds) => {
        if (allFilteredSelected) {
          return currentIds.filter(
            (id) =>
              !filteredIds.includes(id)
          );
        }

        return Array.from(
          new Set([
            ...currentIds,
            ...filteredIds,
          ])
        );
      }
    );
  }

  function clearContactSelection() {
    setSelectedContactIds([]);
    setBulkManagerId("");
  }

  async function handleBulkAssignManager() {
    if (
      selectedContactIds.length === 0 ||
      actionLoading
    ) {
      return;
    }

    setActionLoading(true);

    const results =
      await Promise.all(
        selectedContactIds.map(
          (contactId) =>
            mailingContactService
              .assignManager(
                contactId,
                bulkManagerId || null
              )
        )
      );

    const failedResults =
      results.filter(
        (result) =>
          result.error
      );

    if (failedResults.length > 0) {
      console.error(
        "Ошибки массового назначения:",
        failedResults
      );

      window.alert(
        `Не удалось обновить контактов: ${failedResults.length}`
      );
    }

    await loadPageData();

    setSelectedContactIds([]);
    setBulkManagerId("");
    setActionLoading(false);
  }

  async function handleAutoAssign() {
    if (actionLoading) {
      return;
    }

    if (
      typeof mailingContactService
        .autoAssignManagers !==
      "function"
    ) {
      window.alert(
        "Функция автораспределения пока не подключена."
      );

      return;
    }

    const confirmed =
      window.confirm(
        "Автоматически распределить все нераспределённые контакты между активными менеджерами?"
      );

    if (!confirmed) {
      return;
    }

    setActionLoading(true);

    const result =
      await mailingContactService
        .autoAssignManagers(
          mailingId
        );

    if (result.error) {
      window.alert(
        result.error.message ||
          "Не удалось выполнить распределение."
      );

      setActionLoading(false);
      return;
    }

    await loadPageData();

    window.alert(
      "Контакты успешно распределены."
    );

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
      console.error(
        "Ошибка создания заявки:",
        result.error
      );

      window.alert(
        result.error.message ||
          "Не удалось создать заявку."
      );

      setActionLoading(false);
      return;
    }

    if (result.contact) {
      updateContactOnPage({
        ...result.contact,

        manager:
          managers.find(
            (manager) =>
              manager.id ===
              result.contact.manager_id
          ) ||
          contact.manager ||
          null,
      });
    } else {
      await loadPageData();
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
        <div className="mailing-contacts-state">
          <h2>
            Загружаем контакты...
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
        <div className="mailing-contacts-state">
          <h2>
            Не удалось открыть партию
          </h2>

          <p>{loadError}</p>

          <button
            type="button"
            className="primary-button"
            onClick={loadPageData}
          >
            Повторить
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="mailing-contacts-header">
        <div>
          <button
            type="button"
            className="mailing-contacts-back"
            onClick={() =>
              navigate("/mailings")
            }
          >
            <ArrowLeft size={17} />
            Назад к партиям
          </button>

          <h1>
            {mailing?.name ||
              mailing?.title ||
              "Контакты партии"}
          </h1>

          <p>
            {mailing?.supplier ||
              mailing?.source ||
              "Поставщик не указан"}
          </p>
        </div>

        <div className="mailing-contacts-header__actions">
          <button
            type="button"
            className="secondary-button button-with-icon"
            onClick={loadPageData}
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
            onClick={handleAutoAssign}
            disabled={actionLoading}
          >
            <UserRound size={16} />

            {actionLoading
              ? "Распределяем..."
              : "Автораспределение"}
          </button>
        </div>
      </div>

      <section className="mailing-contacts-summary">
        <article>
          <span>
            Всего контактов
          </span>

          <strong>
            {counters.total}
          </strong>
        </article>

        <article>
          <span>
            Telegram найден
          </span>

          <strong>
            {counters.telegramFound}
          </strong>
        </article>

        <article>
          <span>
            Распределено
          </span>

          <strong>
            {counters.assigned}
          </strong>
        </article>

        <article>
          <span>
            Ответили
          </span>

          <strong>
            {counters.responded}
          </strong>
        </article>
      </section>

      <section className="mailing-contacts-toolbar">
        <div className="search-field">
          <Search size={18} />

          <input
            type="text"
            value={searchValue}
            onChange={(event) =>
              setSearchValue(
                event.target.value
              )
            }
            placeholder="Поиск по имени, телефону, email или Telegram"
          />
        </div>

        <div className="toolbar-filter">
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
              contactStatusConfig
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
        </div>
      </section>

      <section className="mailing-contacts-bulk">
        <label className="mailing-contacts-select-all">
          <input
            type="checkbox"
            checked={
              allFilteredSelected
            }
            onChange={
              toggleSelectAllFiltered
            }
          />

          <span>
            Выбрать все найденные
          </span>
        </label>

        {selectedContactIds.length >
          0 && (
          <div className="mailing-contacts-bulk-actions">
            <strong>
              Выбрано:{" "}
              {
                selectedContactIds.length
              }
            </strong>

            <select
              value={bulkManagerId}
              disabled={actionLoading}
              onChange={(event) =>
                setBulkManagerId(
                  event.target.value
                )
              }
            >
              <option value="">
                Снять менеджера
              </option>

              {managers.map(
                (manager) => (
                  <option
                    key={manager.id}
                    value={manager.id}
                  >
                    {manager.full_name ||
                      manager.email ||
                      "Без имени"}
                  </option>
                )
              )}
            </select>

            <button
              type="button"
              className="primary-button"
              disabled={actionLoading}
              onClick={
                handleBulkAssignManager
              }
            >
              {actionLoading
                ? "Сохраняем..."
                : bulkManagerId
                  ? "Назначить менеджера"
                  : "Снять назначение"}
            </button>

            <button
              type="button"
              className="secondary-button"
              disabled={actionLoading}
              onClick={
                clearContactSelection
              }
            >
              Отменить выбор
            </button>
          </div>
        )}
      </section>

      <div className="mailing-contacts-result">
        Найдено контактов:{" "}
        <strong>
          {filteredContacts.length}
        </strong>
      </div>

      <section className="mailing-contacts-list">
        {filteredContacts.map(
          (contact) => (
            <article
              className="mailing-contact-card"
              key={contact.id}
              role="button"
              tabIndex={0}
              onClick={() =>
                setSelectedContact(
                  contact
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key ===
                    "Enter" ||
                  event.key === " "
                ) {
                  event.preventDefault();

                  setSelectedContact(
                    contact
                  );
                }
              }}
            >
              <label
                className="mailing-contact-checkbox"
                onClick={(event) =>
                  event.stopPropagation()
                }
              >
                <input
                  type="checkbox"
                  checked={selectedContactIds.includes(
                    contact.id
                  )}
                  onChange={() =>
                    toggleContactSelection(
                      contact.id
                    )
                  }
                  aria-label={`Выбрать ${getContactName(
                    contact
                  )}`}
                />
              </label>

              <div className="mailing-contact-avatar">
                <UserRound size={20} />
              </div>

              <div className="mailing-contact-main">
                <div className="mailing-contact-heading">
                  <div>
                    <h2>
                      {getContactName(
                        contact
                      )}
                    </h2>

                    <span
                      className={`mailing-contact-status mailing-contact-status--${
                        contact.status ||
                        "new"
                      }`}
                    >
                      {contactStatusConfig[
                        contact.status
                      ] ||
                        contact.status ||
                        "Новый"}
                    </span>
                  </div>
                </div>

                <div className="mailing-contact-details">
                  <div>
                    <Phone size={15} />

                    <span>
                      {contact.phone ||
                        "Телефон не указан"}
                    </span>
                  </div>

                  <div>
                    <Mail size={15} />

                    <span>
                      {contact.email ||
                        "Email не указан"}
                    </span>
                  </div>

                  <div>
                    <Send size={15} />

                    <span>
                      {contact.telegram_username
                        ? `@${String(
                            contact.telegram_username
                          ).replace(
                            /^@/,
                            ""
                          )}`
                        : "Telegram не найден"}
                    </span>
                  </div>

                  <div>
                    <UserRound
                      size={15}
                    />

                    <span>
                      Менеджер:{" "}
                      {getManagerName(
                        contact.manager
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </article>
          )
        )}
      </section>

      {filteredContacts.length === 0 && (
        <div className="mailing-contacts-state">
          <Search size={28} />

          <h2>
            Контакты не найдены
          </h2>

          <p>
            Измени поисковый запрос или
            фильтр.
          </p>
        </div>
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