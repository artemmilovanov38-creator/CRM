import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { applicationService } from "../services/applicationService";
import ContactDrawer from "../components/mailings/ContactDrawer";
import {
  ArrowLeft,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Send,
  UserRound,
} from "lucide-react";

import mailingContactService from "../services/mailingContactService";
import { mailingService } from "../services/mailingService";

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
  return contact.full_name || "Без имени";
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

  const [mailing, setMailing] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [managers, setManagers] = useState([]);
  const [actionLoading, setActionLoading] =
  useState(false);

  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("all");
    const [selectedContact, setSelectedContact] =
  useState(null);
const [selectedContactIds, setSelectedContactIds] =
  useState([]);

const [bulkManagerId, setBulkManagerId] =
  useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadPageData = useCallback(async () => {
    if (!mailingId) {
      setLoadError("Не указан ID партии.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");

    const [
  mailingResult,
  contactsResult,
  managersResult,
] = await Promise.all([
  mailingService.getMailingById(mailingId),
  mailingContactService.getContactsByMailingId(
    mailingId
  ),
  mailingContactService.getActiveManagers(),
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

    setMailing(mailingResult.data);
    setManagers(managersResult.data || []);
    setContacts(contactsResult.data || []);
    setLoading(false);
  }, [mailingId]);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  const filteredContacts = useMemo(() => {
    const search = searchValue
      .trim()
      .toLowerCase();

    return contacts.filter((contact) => {
      const matchesSearch =
        !search ||
        String(contact.full_name || "")
          .toLowerCase()
          .includes(search) ||
        String(contact.phone || "")
          .toLowerCase()
          .includes(search) ||
        String(contact.email || "")
          .toLowerCase()
          .includes(search) ||
        String(contact.telegram_username || "")
          .toLowerCase()
          .includes(search);

      const matchesStatus =
        statusFilter === "all" ||
        contact.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [contacts, searchValue, statusFilter]);

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

  const updateContactOnPage = (updatedContact) => {
  if (!updatedContact?.id) {
    return;
  }

  setContacts((currentContacts) =>
    currentContacts.map((contact) =>
      contact.id === updatedContact.id
        ? {
            ...contact,
            ...updatedContact,
          }
        : contact
    )
  );

  setSelectedContact((currentContact) => {
    if (
      !currentContact ||
      currentContact.id !== updatedContact.id
    ) {
      return currentContact;
    }

    return {
      ...currentContact,
      ...updatedContact,
    };
  });
};

const handleMarkSent = async (contact) => {
  if (!contact?.id || actionLoading) {
    return;
  }

  setActionLoading(true);

  const result =
    await mailingContactService.markAsSent(
      contact.id
    );

  if (result.error) {
    console.error(
      "Ошибка изменения статуса:",
      result.error
    );

    alert(
      result.error.message ||
        "Не удалось отметить отправку."
    );

    setActionLoading(false);
    return;
  }

  updateContactOnPage(result.data);
  setActionLoading(false);
};

const handleMarkResponded = async (contact) => {
  if (!contact?.id || actionLoading) {
    return;
  }

  setActionLoading(true);

  const result =
    await mailingContactService.markAsResponded(
      contact.id
    );

  if (result.error) {
    console.error(
      "Ошибка изменения статуса:",
      result.error
    );

    alert(
      result.error.message ||
        "Не удалось отметить ответ."
    );

    setActionLoading(false);
    return;
  }

  updateContactOnPage(result.data);
  setActionLoading(false);
};
const handleSaveComment = async (
  contact,
  comment
) => {
  if (!contact?.id || actionLoading) {
    return;
  }

  setActionLoading(true);

  const result =
    await mailingContactService.updateComment(
      contact.id,
      comment
    );

  if (result.error) {
    console.error(
      "Ошибка сохранения комментария:",
      result.error
    );

    alert(
      result.error.message ||
        "Не удалось сохранить комментарий."
    );

    setActionLoading(false);
    return;
  }

  updateContactOnPage(result.data);
  setActionLoading(false);
};

const handleAssignManager = async (
  contact,
  managerId
) => {
  if (!contact?.id || actionLoading) {
    return;
  }

  setActionLoading(true);

  const result =
    await mailingContactService.assignManager(
      contact.id,
      managerId
    );

  if (result.error) {
    alert(
      result.error.message ||
        "Не удалось назначить менеджера."
    );

    setActionLoading(false);
    return;
  }

  const manager =
    managers.find(
      (item) => item.id === managerId
    ) || null;

  updateContactOnPage({
    ...result.data,
    manager,
  });

  setActionLoading(false);
};
const toggleContactSelection = (contactId) => {
  setSelectedContactIds((currentIds) => {
    if (currentIds.includes(contactId)) {
      return currentIds.filter(
        (id) => id !== contactId
      );
    }

    return [...currentIds, contactId];
  });
};

const allFilteredSelected =
  filteredContacts.length > 0 &&
  filteredContacts.every((contact) =>
    selectedContactIds.includes(contact.id)
  );

const toggleSelectAllFiltered = () => {
  const filteredIds = filteredContacts.map(
    (contact) => contact.id
  );

  setSelectedContactIds((currentIds) => {
    if (allFilteredSelected) {
      return currentIds.filter(
        (id) => !filteredIds.includes(id)
      );
    }

    return Array.from(
      new Set([
        ...currentIds,
        ...filteredIds,
      ])
    );
  });
};

const clearContactSelection = () => {
  setSelectedContactIds([]);
  setBulkManagerId("");
};
const handleBulkAssignManager = async () => {
  if (
    selectedContactIds.length === 0 ||
    actionLoading
  ) {
    return;
  }

  setActionLoading(true);

  const results = await Promise.all(
    selectedContactIds.map((contactId) =>
      mailingContactService.assignManager(
        contactId,
        bulkManagerId || null
      )
    )
  );

  const failedResults = results.filter(
    (result) => result.error
  );

  if (failedResults.length > 0) {
    console.error(
      "Ошибки массового назначения:",
      failedResults
    );

    alert(
      `Не удалось обновить контактов: ${failedResults.length}`
    );
  }

  await loadPageData();

  setSelectedContactIds([]);
  setBulkManagerId("");
  setActionLoading(false);
};

const handleAutoAssign = async () => {
  if (actionLoading) {
    return;
  }

  const confirmed = window.confirm(
    "Автоматически распределить все нераспределённые контакты между активными менеджерами?"
  );

  if (!confirmed) {
    return;
  }

  setActionLoading(true);

  const result =
    await mailingContactService.autoAssignManagers(
      mailingId
    );

  if (result.error) {
    alert(
      result.error.message ||
        "Не удалось выполнить распределение."
    );

    setActionLoading(false);
    return;
  }

  await loadPageData();

  alert("Контакты успешно распределены.");

  setActionLoading(false);
};

const handleCreateApplication = async (
  contact
) => {
  if (!contact?.id || actionLoading) {
    return;
  }

  setActionLoading(true);

  const result =
    await applicationService.createApplication({
      full_name: contact.full_name,
      phone: contact.phone,
      telegram:
        contact.telegram_username,

      source: "mailing",

      product:
        mailing?.product || null,

      assigned_manager_id:
        contact.manager_id,

      mailing_id:
        mailing?.id,

      mailing_contact_id:
        contact.id,

      comment:
        contact.comment,
    });

  if (result.error) {
  console.error(
    "Ошибка создания заявки:",
    result.error
  );

  if (result.error.code === "23505") {
    alert(
      "Для этого контакта заявка уже создана."
    );
  } else {
    alert(
      result.error.message ||
        "Не удалось создать заявку."
    );
  }

  setActionLoading(false);
  return;
}

  const updatedContact =
    await mailingContactService.markAsApplication(
      contact.id
    );

  if (!updatedContact.error) {
    updateContactOnPage(
      updatedContact.data
    );
  }

  alert("Заявка создана");

  setActionLoading(false);
};
  if (loading) {
    return (
      <main className="page">
        <div className="mailing-contacts-state">
          <h2>Загружаем контакты...</h2>
          <p>Получаем данные из Supabase.</p>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="page">
        <div className="mailing-contacts-state">
          <h2>Не удалось открыть партию</h2>
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
            onClick={() => navigate("/mailings")}
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

        <button
          type="button"
          className="secondary-button button-with-icon"
          onClick={loadPageData}
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

      <section className="mailing-contacts-summary">
        <article>
          <span>Всего контактов</span>
          <strong>{counters.total}</strong>
        </article>

        <article>
          <span>Telegram найден</span>
          <strong>{counters.telegramFound}</strong>
        </article>

        <article>
          <span>Распределено</span>
          <strong>{counters.assigned}</strong>
        </article>

        <article>
          <span>Ответили</span>
          <strong>{counters.responded}</strong>
        </article>
      </section>

      <section className="mailing-contacts-toolbar">
        <div className="search-field">
          <Search size={18} />

          <input
            type="text"
            value={searchValue}
            onChange={(event) =>
              setSearchValue(event.target.value)
            }
            placeholder="Поиск по имени, телефону, email или Telegram"
          />
        </div>

        <div className="toolbar-filter">
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
          >
            <option value="all">
              Все статусы
            </option>

            {Object.entries(
              contactStatusConfig
            ).map(([value, title]) => (
              <option
                key={value}
                value={value}
              >
                {title}
              </option>
            ))}
          </select>
        </div>
      </section>

<section className="mailing-contacts-bulk">
  <label className="mailing-contacts-select-all">
    <input
      type="checkbox"
      checked={allFilteredSelected}
      onChange={toggleSelectAllFiltered}
    />

    <span>
      Выбрать все найденные
    </span>
  </label>

  {selectedContactIds.length > 0 && (
    <div className="mailing-contacts-bulk-actions">
      <strong>
        Выбрано: {selectedContactIds.length}
      </strong>

      <select
        value={bulkManagerId}
        disabled={actionLoading}
        onChange={(event) =>
          setBulkManagerId(event.target.value)
        }
      >
        <option value="">
          Снять менеджера
        </option>

        {managers.map((manager) => (
          <option
            key={manager.id}
            value={manager.id}
          >
            {manager.full_name ||
              manager.email ||
              "Без имени"}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="primary-button"
        disabled={actionLoading}
        onClick={handleBulkAssignManager}
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
        onClick={clearContactSelection}
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
        {filteredContacts.map((contact) => (
          <article
          
  className="mailing-contact-card"
  key={contact.id}
  role="button"
  tabIndex={0}
  onClick={() => setSelectedContact(contact)}
  onKeyDown={(event) => {
    if (
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      setSelectedContact(contact);
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
      toggleContactSelection(contact.id)
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
                    {getContactName(contact)}
                  </h2>

                  <span
                    className={`mailing-contact-status mailing-contact-status--${contact.status}`}
                  >
                    {contactStatusConfig[
                      contact.status
                    ] || contact.status}
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
                        ).replace(/^@/, "")}`
                      : "Telegram не найден"}
                  </span>
                </div>

                <div>
                  <UserRound size={15} />

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
        ))}
      </section>

      {filteredContacts.length === 0 && (
        <div className="mailing-contacts-state">
          <Search size={28} />
          <h2>Контакты не найдены</h2>
          <p>
            Измени поисковый запрос или фильтр.
          </p>
        </div>
      )}
     <ContactDrawer
  contact={selectedContact}
  isOpen={Boolean(selectedContact)}
  onClose={() => setSelectedContact(null)}
  managers={managers}
  onAssignManager={handleAssignManager}
  onMarkSent={handleMarkSent}
  onMarkResponded={handleMarkResponded}
  onSaveComment={handleSaveComment}
  actionLoading={actionLoading}
  onCreateApplication={
  handleCreateApplication
}
/>
    </main>
  );
}