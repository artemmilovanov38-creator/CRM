import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

import {
  CheckCircle2,
  Clock3,
  Filter,
  Inbox,
  RefreshCw,
  Search,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";

import "../styles/Incoming.css";

import { incomingLeadService } from "../services/incomingLeadService";
import { profileService } from "../services/profileService";
import { useAuth } from "../context/AuthContext";

const STATUS_OPTIONS = [
  {
    value: "all",
    label: "Все статусы",
  },
  {
    value: "new",
    label: "Новые",
  },
  {
    value: "in_progress",
    label: "В работе",
  },
  {
    value: "converted",
    label: "Конвертированные",
  },
  {
    value: "rejected",
    label: "Отклонённые",
  },
];

const STATUS_LABELS = {
  new: "Новый",
  in_progress: "В работе",
  converted: "Конвертирован",
  rejected: "Отклонён",
};

export default function Incoming() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();

  const currentProfile = profile || user;

  const [leads, setLeads] = useState([]);
  const [managers, setManagers] = useState([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("all");
  const [sourceFilter, setSourceFilter] =
    useState("all");
  const [managerFilter, setManagerFilter] =
    useState("all");

  const [loading, setLoading] = useState(true);
  const [actionLeadId, setActionLeadId] =
    useState(null);
  const [error, setError] = useState("");

  const [convertLead, setConvertLead] =
  useState(null);

const [convertForm, setConvertForm] =
  useState({
    full_name: "",
    phone: "",
    telegram: "",
    source: "",
    product: "",
    comment: "",
    assigned_manager_id: "",
  });

  useEffect(() => {
    loadPageData();
  }, []);

  useEffect(() => {
  let reloadTimer = null;

  const incomingLeadsChannel = supabase
    .channel("incoming-leads-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "incoming_leads",
      },
      (payload) => {
        console.log(
          "Изменение входящего потока:",
          payload
        );

        clearTimeout(reloadTimer);

        reloadTimer = setTimeout(() => {
          loadPageData();
        }, 300);
      }
    )
    .subscribe((status) => {
      console.log(
        "Realtime incoming_leads:",
        status
      );
    });

  return () => {
    clearTimeout(reloadTimer);

    supabase.removeChannel(
      incomingLeadsChannel
    );
  };
}, []);

  async function loadPageData() {
    setLoading(true);
    setError("");

    const [
      leadsResult,
      managersResult,
    ] = await Promise.all([
      incomingLeadService.getIncomingLeads(),
      profileService.getManagers(),
    ]);

    if (leadsResult.error) {
      console.error(
        "Ошибка загрузки лидов:",
        leadsResult.error
      );

      setError(
        leadsResult.error.message ||
          "Не удалось загрузить входящие лиды"
      );
    } else {
      setLeads(leadsResult.data || []);
    }

    if (managersResult.error) {
      console.error(
        "Ошибка загрузки менеджеров:",
        managersResult.error
      );
    } else {
      setManagers(managersResult.data || []);
    }

    setLoading(false);
  }

  async function handleTakeLead(lead) {
    if (!currentProfile?.id) {
      alert(
        "Не удалось определить текущего пользователя"
      );
      return;
    }

    setActionLeadId(lead.id);

    const result =
      await incomingLeadService.takeLead(
        lead.id,
        currentProfile.id
      );

    if (result.error) {
      console.error(
        "Ошибка назначения лида:",
        result.error
      );

      alert(
        result.error.message ||
          "Не удалось взять лид в работу"
      );

      setActionLeadId(null);
      return;
    }

    
    setActionLeadId(null);
  }

  async function handleReject(lead) {
    const confirmed = window.confirm(
      `Отклонить лид «${
        lead.full_name || "Без имени"
      }»?`
    );

    if (!confirmed) {
      return;
    }

    setActionLeadId(lead.id);

    const result =
      await incomingLeadService.rejectLead(
        lead.id
      );

    if (result.error) {
      console.error(
        "Ошибка отклонения лида:",
        result.error
      );

      alert(
        result.error.message ||
          "Не удалось отклонить лид"
      );

      setActionLeadId(null);
      return;
    }

    
    setActionLeadId(null);
  }

  function openConvertModal(lead) {
  setConvertLead(lead);

  setConvertForm({
    full_name: lead.full_name || "",
    phone: lead.phone || "",
    telegram: lead.telegram || "",
    source: lead.source || "",
    product: lead.product || "",
    comment: lead.comment || "",
    assigned_manager_id:
      lead.assigned_manager_id ||
      currentProfile?.id ||
      "",
  });
}

function closeConvertModal() {
  if (actionLeadId) {
    return;
  }

  setConvertLead(null);

  setConvertForm({
    full_name: "",
    phone: "",
    telegram: "",
    source: "",
    product: "",
    comment: "",
    assigned_manager_id: "",
  });
}

function handleConvertFormChange(event) {
  const { name, value } = event.target;

  setConvertForm((current) => ({
    ...current,
    [name]: value,
  }));
}

async function handleConfirmConvert(event) {
  event.preventDefault();

  if (!convertLead?.id) {
    return;
  }

  if (!convertForm.full_name.trim()) {
    alert("Укажите имя клиента");
    return;
  }

  if (
    !convertForm.phone.trim() &&
    !convertForm.telegram.trim()
  ) {
    alert(
      "Укажите хотя бы телефон или Telegram клиента"
    );
    return;
  }

  setActionLeadId(convertLead.id);

  const preparedLead = {
    ...convertLead,

    full_name: convertForm.full_name.trim(),

    phone:
      convertForm.phone.trim() || null,

    telegram:
      convertForm.telegram.trim() || null,

    source:
      convertForm.source.trim() || "manual",

    product:
      convertForm.product.trim() || null,

    comment:
      convertForm.comment.trim() || null,

    assigned_manager_id:
      convertForm.assigned_manager_id ||
      null,
  };

  const result =
    await incomingLeadService.convertToApplication(
      preparedLead
    );

  if (result.error) {
    console.error(
      "Ошибка создания заявки:",
      result.error
    );

    alert(
      result.error.message ||
        "Не удалось создать заявку"
    );

    setActionLeadId(null);
    return;
  }

  setActionLeadId(null);
  setConvertLead(null);

  navigate(
    `/applications/${result.data.applicationId}`
  );
}

  const sources = useMemo(() => {
    return [
      ...new Set(
        leads
          .map((lead) => lead.source)
          .filter(Boolean)
      ),
    ].sort((a, b) =>
      a.localeCompare(b, "ru")
    );
  }, [leads]);

  const stats = useMemo(() => {
    return {
      total: leads.length,

      new: leads.filter(
        (lead) => lead.status === "new"
      ).length,

      inProgress: leads.filter(
        (lead) =>
          lead.status === "in_progress"
      ).length,

      converted: leads.filter(
        (lead) =>
          lead.status === "converted"
      ).length,

      rejected: leads.filter(
        (lead) =>
          lead.status === "rejected"
      ).length,
    };
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const normalizedSearch = search
      .trim()
      .toLowerCase();

    return leads.filter((lead) => {
      const searchValue = [
        lead.full_name,
        lead.phone,
        lead.telegram,
        lead.product,
        lead.source,
        lead.comment,
        lead.assigned_manager?.full_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !normalizedSearch ||
        searchValue.includes(normalizedSearch);

      const matchesStatus =
        statusFilter === "all" ||
        lead.status === statusFilter;

      const matchesSource =
        sourceFilter === "all" ||
        lead.source === sourceFilter;

      const matchesManager =
        managerFilter === "all" ||
        lead.assigned_manager_id ===
          managerFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesSource &&
        matchesManager
      );
    });
  }, [
    leads,
    search,
    statusFilter,
    sourceFilter,
    managerFilter,
  ]);

  function formatDate(value) {
    if (!value) {
      return "Не указано";
    }

    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setSourceFilter("all");
    setManagerFilter("all");
  }

  const filtersAreActive =
    search ||
    statusFilter !== "all" ||
    sourceFilter !== "all" ||
    managerFilter !== "all";

  return (
    <main className="incoming-page">
      <section className="incoming-heading">
        <div>
          <span className="incoming-heading__eyebrow">
            Работа с новыми обращениями
          </span>

          <h1>Входящий поток</h1>

          <p>
            Обрабатывайте новые обращения,
            назначайте менеджеров и создавайте
            заявки.
          </p>
        </div>

        <button
          className="incoming-refresh-button"
          type="button"
          onClick={loadPageData}
          disabled={loading}
        >
          <RefreshCw
            size={16}
            className={
              loading
                ? "incoming-refresh-icon--loading"
                : ""
            }
          />

          Обновить
        </button>
      </section>

      <section className="incoming-stats">
        <article className="incoming-stat-card">
          <div className="incoming-stat-card__icon">
            <Inbox size={20} />
          </div>

          <div>
            <span>Всего лидов</span>
            <strong>{stats.total}</strong>
          </div>
        </article>

        <article className="incoming-stat-card incoming-stat-card--new">
          <div className="incoming-stat-card__icon">
            <UserPlus size={20} />
          </div>

          <div>
            <span>Новые</span>
            <strong>{stats.new}</strong>
          </div>
        </article>

        <article className="incoming-stat-card incoming-stat-card--progress">
          <div className="incoming-stat-card__icon">
            <Clock3 size={20} />
          </div>

          <div>
            <span>В работе</span>
            <strong>{stats.inProgress}</strong>
          </div>
        </article>

        <article className="incoming-stat-card incoming-stat-card--converted">
          <div className="incoming-stat-card__icon">
            <CheckCircle2 size={20} />
          </div>

          <div>
            <span>Конвертировано</span>
            <strong>{stats.converted}</strong>
          </div>
        </article>

        <article className="incoming-stat-card incoming-stat-card--rejected">
          <div className="incoming-stat-card__icon">
            <XCircle size={20} />
          </div>

          <div>
            <span>Отклонено</span>
            <strong>{stats.rejected}</strong>
          </div>
        </article>
      </section>

      <section className="incoming-toolbar">
        <div className="incoming-search">
          <Search size={17} />

          <input
            type="text"
            placeholder="Поиск по имени, телефону, Telegram..."
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />
        </div>

        <div className="incoming-filter">
          <Filter size={16} />

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
          >
            {STATUS_OPTIONS.map((option) => (
              <option
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="incoming-filter">
          <select
            value={sourceFilter}
            onChange={(event) =>
              setSourceFilter(event.target.value)
            }
          >
            <option value="all">
              Все источники
            </option>

            {sources.map((source) => (
              <option
                key={source}
                value={source}
              >
                {source}
              </option>
            ))}
          </select>
        </div>

        <div className="incoming-filter">
          <Users size={16} />

          <select
            value={managerFilter}
            onChange={(event) =>
              setManagerFilter(event.target.value)
            }
          >
            <option value="all">
              Все менеджеры
            </option>

            {managers.map((manager) => (
              <option
                key={manager.id}
                value={manager.id}
              >
                {manager.full_name ||
                  manager.name ||
                  manager.email}
              </option>
            ))}
          </select>
        </div>

        {filtersAreActive && (
          <button
            className="incoming-reset-button"
            type="button"
            onClick={resetFilters}
          >
            Сбросить
          </button>
        )}
      </section>

      {error && (
        <div className="incoming-error">
          {error}
        </div>
      )}

      {loading ? (
        <div className="incoming-state">
          <div className="incoming-loader" />

          <strong>
            Загружаем входящие лиды
          </strong>

          <span>
            Данные появятся через несколько
            секунд.
          </span>
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="incoming-state">
          <Inbox size={36} />

          <strong>Лиды не найдены</strong>

          <span>
            Попробуйте изменить фильтры или
            поисковый запрос.
          </span>
        </div>
      ) : (
        <>
          <div className="incoming-results">
            Найдено лидов:{" "}
            <strong>
              {filteredLeads.length}
            </strong>
          </div>

          <section className="incoming-grid">
            {filteredLeads.map((lead) => {
              const isProcessing =
                actionLeadId === lead.id;

              return (
                <article
                  key={lead.id}
                  className="incoming-card"
                >
                  <div className="incoming-card__top">
                    <div>
                      <span className="incoming-card__caption">
                        Входящий лид
                      </span>

                      <h3>
                        {lead.full_name ||
                          "Без имени"}
                      </h3>
                    </div>

                    <span
                      className={`incoming-status incoming-status--${lead.status}`}
                    >
                      {STATUS_LABELS[
                        lead.status
                      ] || lead.status}
                    </span>
                  </div>

                  <div className="incoming-card__contacts">
                    <div>
                      <span>Телефон</span>
                      <strong>
                        {lead.phone ||
                          "Не указан"}
                      </strong>
                    </div>

                    <div>
                      <span>Telegram</span>
                      <strong>
                        {lead.telegram ||
                          "Не указан"}
                      </strong>
                    </div>
                  </div>

                  <div className="incoming-card__details">
                    <div>
                      <span>Источник</span>
                      <strong>
                        {lead.source ||
                          "Не указан"}
                      </strong>
                    </div>

                    <div>
                      <span>Продукт</span>
                      <strong>
                        {lead.product ||
                          "Не указан"}
                      </strong>
                    </div>

                    <div>
                      <span>Менеджер</span>
                      <strong>
                        {lead.assigned_manager
                          ?.full_name ||
                          lead.assigned_manager
                            ?.email ||
                          "Не назначен"}
                      </strong>
                    </div>

                    <div>
                      <span>Создан</span>
                      <strong>
                        {formatDate(
                          lead.created_at
                        )}
                      </strong>
                    </div>
                  </div>

                  {lead.comment && (
                    <div className="incoming-card__comment">
                      <span>Комментарий</span>
                      <p>{lead.comment}</p>
                    </div>
                  )}

                  {lead.status ===
                    "converted" &&
                    lead.converted_application_id && (
                      <button
                        className="incoming-open-application"
                        type="button"
                        onClick={() =>
                          navigate(
                            `/applications/${lead.converted_application_id}`
                          )
                        }
                      >
                        Открыть созданную заявку
                      </button>
                    )}

                  <div className="incoming-buttons">
                    {lead.status === "new" && (
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() =>
                          handleTakeLead(lead)
                        }
                      >
                        <UserPlus size={16} />

                        {isProcessing
                          ? "Сохраняем..."
                          : "Взять себе"}
                      </button>
                    )}

                    {lead.status !==
                      "converted" &&
                      lead.status !==
                        "rejected" && (
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() =>
  openConvertModal(lead)
}
                        >
                          <CheckCircle2
                            size={16}
                          />

                        
                        </button>
                      )}

                    {lead.status !==
                      "converted" &&
                      lead.status !==
                        "rejected" && (
                        <button
                          className="danger"
                          type="button"
                          disabled={isProcessing}
                          onClick={() =>
                            handleReject(lead)
                          }
                        >
                          <XCircle size={16} />
                          Отклонить
                        </button>
                      )}
                  </div>
                </article>
              );
            })}
          </section>
        </>
      )}
      {convertLead && (
  <div
    className="incoming-modal-overlay"
    onMouseDown={(event) => {
      if (
        event.target === event.currentTarget
      ) {
        closeConvertModal();
      }
    }}
  >
    <div className="incoming-modal">
      <div className="incoming-modal__header">
        <div>
          <span>
            Преобразование входящего лида
          </span>

          <h2>Создание заявки</h2>

          <p>
            Проверьте данные клиента перед
            созданием заявки.
          </p>
        </div>

        <button
          className="incoming-modal__close"
          type="button"
          onClick={closeConvertModal}
          disabled={Boolean(actionLeadId)}
          aria-label="Закрыть"
        >
          <XCircle size={20} />
        </button>
      </div>

      <form
        className="incoming-modal__form"
        onSubmit={handleConfirmConvert}
      >
        <div className="incoming-modal__grid">
          <label className="incoming-modal__field incoming-modal__field--full">
            <span>ФИО клиента *</span>

            <input
              type="text"
              name="full_name"
              value={convertForm.full_name}
              onChange={
                handleConvertFormChange
              }
              placeholder="Иван Иванов"
              autoFocus
            />
          </label>

          <label className="incoming-modal__field">
            <span>Телефон</span>

            <input
              type="text"
              name="phone"
              value={convertForm.phone}
              onChange={
                handleConvertFormChange
              }
              placeholder="+7 999 000-00-00"
            />
          </label>

          <label className="incoming-modal__field">
            <span>Telegram</span>

            <input
              type="text"
              name="telegram"
              value={convertForm.telegram}
              onChange={
                handleConvertFormChange
              }
              placeholder="@username"
            />
          </label>

          <label className="incoming-modal__field">
            <span>Источник</span>

            <input
              type="text"
              name="source"
              value={convertForm.source}
              onChange={
                handleConvertFormChange
              }
              placeholder="Telegram"
            />
          </label>

          <label className="incoming-modal__field">
            <span>Продукт</span>

            <input
              type="text"
              name="product"
              value={convertForm.product}
              onChange={
                handleConvertFormChange
              }
              placeholder="Альфа"
            />
          </label>

          <label className="incoming-modal__field incoming-modal__field--full">
            <span>Менеджер</span>

            <select
              name="assigned_manager_id"
              value={
                convertForm.assigned_manager_id
              }
              onChange={
                handleConvertFormChange
              }
            >
              <option value="">
                Без менеджера
              </option>

              {managers.map((manager) => (
                <option
                  key={manager.id}
                  value={manager.id}
                >
                  {manager.full_name ||
                    manager.name ||
                    manager.email}
                </option>
              ))}
            </select>
          </label>

          <label className="incoming-modal__field incoming-modal__field--full">
            <span>Комментарий</span>

            <textarea
              name="comment"
              value={convertForm.comment}
              onChange={
                handleConvertFormChange
              }
              rows={4}
              placeholder="Дополнительная информация о клиенте"
            />
          </label>
        </div>

        <div className="incoming-modal__notice">
          После создания входящий лид
          получит статус «Конвертирован», а
          CRM откроет карточку новой заявки.
        </div>

        <div className="incoming-modal__actions">
          <button
            className="incoming-modal__cancel"
            type="button"
            onClick={closeConvertModal}
            disabled={Boolean(actionLeadId)}
          >
            Отмена
          </button>

          <button
            className="incoming-modal__submit"
            type="submit"
            disabled={Boolean(actionLeadId)}
          >
            <CheckCircle2 size={17} />

            {actionLeadId
              ? "Создаём заявку..."
              : "Создать заявку"}
          </button>
        </div>
      </form>
    </div>
  </div>
)}
    </main>
  );
}