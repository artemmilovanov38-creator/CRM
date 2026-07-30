import {
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Columns3,
  GripVertical,
  List,
  MessageCircle,
  Phone,
  
  Search,
  
  Users,
  
  XCircle,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import "../styles/Applications.css";


import { applicationService } from "../services/applicationService";
import { profileService } from "../services/profileService";
import ApplicationDrawer from "../components/applications/ApplicationDrawer";

const statusOptions = [
  {
    value: "in_progress",
    label: "В работе",
  },
  {
    value: "approved",
    label: "Успешная",
  },
  {
    value: "rejected",
    label: "Отказ",
  },
];



export default function Applications() {
  const [applications, setApplications] =
    useState([]);
  

  const [managers, setManagers] = useState([]);

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [managerFilter, setManagerFilter] =
    useState("all");

  const [isLoading, setIsLoading] =
    useState(true);

 



    const [
  selectedApplication,
  setSelectedApplication,
] = useState(null);

const [isDrawerOpen, setIsDrawerOpen] =
  useState(false);

const [drawerLoading, setDrawerLoading] =
  useState(false);

 

  const [error, setError] = useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

    const [viewMode, setViewMode] =
  useState("kanban");

const [
  draggedApplicationId,
  setDraggedApplicationId,
] = useState(null);

const [dragOverStatus, setDragOverStatus] =
  useState(null);

const [
  movingApplicationId,
  setMovingApplicationId,
] = useState(null);

  useEffect(() => {
    loadPageData();
  }, []);

  async function loadPageData() {
    setIsLoading(true);
    setError("");

    const [
      applicationsResult,
      managersResult,
    ] = await Promise.all([
      applicationService.getApplications(),
      profileService.getManagers(),
    ]);

    if (applicationsResult.error) {
      console.error(
        "Ошибка загрузки заявок:",
        applicationsResult.error
      );

      setError(
        "Не удалось загрузить список заявок"
      );
    }

    if (managersResult.error) {
      console.error(
        "Ошибка загрузки менеджеров:",
        managersResult.error
      );
    }

    setApplications(
  (applicationsResult.data || []).map(
    (application) => ({
      ...application,
      status:
        application.status === "new" ||
        application.status === "waiting"
          ? "in_progress"
          : application.status,
    })
  )
);

    setManagers(managersResult.data || []);

    setIsLoading(false);
  }

  const filteredApplications = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    return applications.filter(
      (application) => {
        const matchesSearch =
          !normalizedSearch ||
          application.full_name
            ?.toLowerCase()
            .includes(normalizedSearch) ||
          application.phone
            ?.toLowerCase()
            .includes(normalizedSearch) ||
          application.telegram
            ?.toLowerCase()
            .includes(normalizedSearch) ||
          application.product
            ?.toLowerCase()
            .includes(normalizedSearch);

        const matchesStatus =
          statusFilter === "all" ||
          application.status === statusFilter;

        const matchesManager =
          managerFilter === "all" ||
          (managerFilter === "unassigned" &&
            !application.assigned_manager_id) ||
          application.assigned_manager_id ===
            managerFilter;

        return (
          matchesSearch &&
          matchesStatus &&
          matchesManager
        );
      }
    );
  }, [
    applications,
    search,
    statusFilter,
    managerFilter,
  ]);

  const stats = useMemo(() => {
    const approvedApplications =
      applications.filter(
        (application) =>
          application.status === "approved"
      );

    const totalAmount =
      approvedApplications.reduce(
        (sum, application) =>
          sum + Number(application.amount || 0),
        0
      );

   return {
  total: applications.length,

  inProgress: applications.filter(
    (application) =>
      application.status === "in_progress"
  ).length,

  approved: approvedApplications.length,

  rejected: applications.filter(
    (application) =>
      application.status === "rejected"
  ).length,

  totalAmount,
};
  }, [applications]);


  function openApplicationDrawer(application) {
  setSelectedApplication(application);
  setIsDrawerOpen(true);
  setError("");
  setSuccessMessage("");
}

function closeApplicationDrawer() {
  if (drawerLoading) {
    return;
  }

  setIsDrawerOpen(false);
  setSelectedApplication(null);
}
 

  


  

  async function handleStatusChange(
    applicationId,
    status
  ) {
    setError("");
    setSuccessMessage("");

    const previousApplications =
      applications;

    setApplications((currentApplications) =>
      currentApplications.map(
        (application) =>
          application.id === applicationId
            ? {
                ...application,
                status,
              }
            : application
      )
    );

    const { data, error: updateError } =
      await applicationService.updateStatus(
        applicationId,
        status
      );

    if (updateError) {
      console.error(
        "Ошибка изменения статуса:",
        updateError
      );

      setApplications(previousApplications);

      setError(
        "Не удалось изменить статус заявки"
      );

      return;
    }

    setApplications((currentApplications) =>
      currentApplications.map(
        (application) =>
          application.id === applicationId
            ? data
            : application
      )
    );

    setSuccessMessage(
      "Статус заявки обновлён"
    );
  }

  async function handleManagerChange(
    applicationId,
    managerId
  ) {
    setError("");
    setSuccessMessage("");

    const previousApplications =
      applications;

    const selectedManager =
      managers.find(
        (manager) => manager.id === managerId
      ) || null;

    setApplications((currentApplications) =>
      currentApplications.map(
        (application) =>
          application.id === applicationId
            ? {
                ...application,
                assigned_manager_id:
                  managerId || null,
                assigned_manager:
                  selectedManager,
              }
            : application
      )
    );

    const { data, error: updateError } =
      await applicationService.assignManager(
        applicationId,
        managerId
      );

    if (updateError) {
      console.error(
        "Ошибка назначения менеджера:",
        updateError
      );

      setApplications(previousApplications);

      setError(
        "Не удалось назначить менеджера"
      );

      return;
    }

    setApplications((currentApplications) =>
      currentApplications.map(
        (application) =>
          application.id === applicationId
            ? data
            : application
      )
    );

    setSuccessMessage(
      managerId
        ? "Менеджер назначен"
        : "Менеджер снят с заявки"
    );
  }

  async function handleSaveApplication(
  application,
  form
)

{
  if (!application?.id || drawerLoading) {
    return;
  }

  setDrawerLoading(true);
  setError("");
  setSuccessMessage("");

  const updates = {
    full_name: form.full_name.trim(),

    phone:
      form.phone.trim() || null,

    telegram:
      form.telegram.trim() || null,

    source:
      form.source.trim() || null,

    product:
      form.product.trim() || null,

    status: form.status,

    assigned_manager_id:
      form.assigned_manager_id || null,

    amount:
      form.amount === ""
        ? null
        : Number(form.amount),

    comment:
      form.comment.trim() || null,
  };

  const { data, error: updateError } =
    await applicationService.updateApplication(
      application.id,
      updates
    );

  if (updateError) {
    console.error(
      "Ошибка сохранения заявки:",
      updateError
    );

    setError(
      updateError.message ||
        "Не удалось сохранить заявку"
    );

    setDrawerLoading(false);
    return;
  }

  setApplications((currentApplications) =>
    currentApplications.map((item) =>
      item.id === application.id
        ? data
        : item
    )
  );

  setSelectedApplication(data);
  setSuccessMessage("Заявка сохранена");
  setDrawerLoading(false);
}
async function handleDeleteApplication(
  application
) {
  if (!application?.id || drawerLoading) {
    return;
  }

  setDrawerLoading(true);
  setError("");
  setSuccessMessage("");

  const { error: deleteError } =
    await applicationService.deleteApplication(
      application.id
    );

  if (deleteError) {
    console.error(
      "Ошибка удаления заявки:",
      deleteError
    );

    setError(
      deleteError.message ||
        "Не удалось удалить заявку"
    );

    setDrawerLoading(false);
    return;
  }

  setApplications((currentApplications) =>
    currentApplications.filter(
      (item) => item.id !== application.id
    )
  );

  setDrawerLoading(false);
  setIsDrawerOpen(false);
  setSelectedApplication(null);
  setSuccessMessage("Заявка удалена");
}

  function handleDragStart(event, applicationId) {
  setDraggedApplicationId(applicationId);

  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(
    "text/plain",
    applicationId
  );
}

function handleDragEnd() {
  setDraggedApplicationId(null);
  setDragOverStatus(null);
}

function handleColumnDragOver(event, status) {
  event.preventDefault();

  event.dataTransfer.dropEffect = "move";

  if (dragOverStatus !== status) {
    setDragOverStatus(status);
  }
}

function handleColumnDragLeave(event) {
  if (
    event.currentTarget.contains(
      event.relatedTarget
    )
  ) {
    return;
  }

  setDragOverStatus(null);
}

async function handleColumnDrop(event, newStatus) {
  event.preventDefault();

  const applicationId =
    event.dataTransfer.getData("text/plain") ||
    draggedApplicationId;

  setDraggedApplicationId(null);
  setDragOverStatus(null);

  if (!applicationId) {
    return;
  }

  const application = applications.find(
    (item) => item.id === applicationId
  );

  if (
    !application ||
    application.status === newStatus
  ) {
    return;
  }

  setMovingApplicationId(applicationId);

  await handleStatusChange(
    applicationId,
    newStatus
  );

  setMovingApplicationId(null);
}

  return (
    <main className="applications-page">
      <section className="applications-header">
        <div>
          <span className="applications-header__eyebrow">
            Работа с клиентами
          </span>

          <h1>Заявки</h1>

          <p>
            Управляйте входящими заявками,
            назначайте менеджеров и отслеживайте
            результаты.
          </p>
        </div>

        
      </section>

      <section className="applications-stats">
        <StatCard
          title="Всего заявок"
          value={stats.total}
          icon={Users}
        />

       

        <StatCard
          title="В работе"
          value={stats.inProgress}
          icon={Clock3}
        />

        <StatCard
          title="Успешные"
          value={stats.approved}
          icon={CheckCircle2}
        />

        <StatCard
  title="Отказы"
  value={stats.rejected}
  icon={XCircle}
/>

        <StatCard
          title="Сумма успешных"
          value={formatMoney(stats.totalAmount)}
          icon={CircleDollarSign}
          compact
        />
      </section>

      {error && (
        <div className="applications-alert applications-alert--error">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="applications-alert applications-alert--success">
          {successMessage}
        </div>
      )}

      <section className="applications-panel">
        <div className="applications-toolbar">
          <div className="applications-search">
            <Search size={18} />

            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Поиск по имени, телефону, Telegram или продукту"
            />
          </div>

          <select
            className="applications-filter"
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

            {statusOptions.map((status) => (
              <option
                key={status.value}
                value={status.value}
              >
                {status.label}
              </option>
            ))}
          </select>

          <select
            className="applications-filter"
            value={managerFilter}
            onChange={(event) =>
              setManagerFilter(
                event.target.value
              )
            }
          >
            <option value="all">
              Все менеджеры
            </option>

            <option value="unassigned">
              Без менеджера
            </option>

            {managers.map((manager) => (
              <option
                key={manager.id}
                value={manager.id}
              >
                {manager.full_name ||
                  manager.email}
              </option>
            ))}
          </select>


<div className="applications-view-switcher">
  <button
    type="button"
    className={
      viewMode === "kanban"
        ? "applications-view-switcher__button applications-view-switcher__button--active"
        : "applications-view-switcher__button"
    }
    onClick={() => setViewMode("kanban")}
  >
    <Columns3 size={16} />
    <span>Канбан</span>
  </button>

  <button
    type="button"
    className={
      viewMode === "table"
        ? "applications-view-switcher__button applications-view-switcher__button--active"
        : "applications-view-switcher__button"
    }
    onClick={() => setViewMode("table")}
  >
    <List size={16} />
    <span>Таблица</span>
  </button>
</div>
          <button
            className="applications-refresh-button"
            type="button"
            onClick={loadPageData}
            disabled={isLoading}
          >
            Обновить
          </button>
        </div>

        {isLoading ? (
          <div className="applications-state">
            <div className="applications-spinner" />
            <span>Загрузка заявок...</span>
          </div>
        ) : filteredApplications.length ===
          0 ? (
          <div className="applications-state">
            <Users size={42} />

            <strong>
              Заявки не найдены
            </strong>

            <span>
              Создайте первую заявку или измените
              параметры фильтрации.
            </span>
          </div>
        ) : viewMode === "kanban" ? (
  <ApplicationsKanban
    applications={filteredApplications}
    managers={managers}
    draggedApplicationId={
      draggedApplicationId
    }
    dragOverStatus={dragOverStatus}
    movingApplicationId={
      movingApplicationId
    }
    onDragStart={handleDragStart}
    onDragEnd={handleDragEnd}
    onColumnDragOver={
      handleColumnDragOver
    }
    onColumnDragLeave={
      handleColumnDragLeave
    }
    onColumnDrop={handleColumnDrop}
    onManagerChange={
      handleManagerChange
    }
    onOpenApplication={(application) =>
  openApplicationDrawer(application)
}
  />
) : (
  <div className="applications-table-wrapper">
            <table className="applications-table">
              <thead>
                <tr>
                  <th>Клиент</th>
                  <th>Контакты</th>
                  <th>Продукт</th>
                  <th>Менеджер</th>
                  <th>Статус</th>
                  <th>Сумма</th>
<th>Рассылка</th>
<th>Отклик</th>
<th>До заявки</th>
<th>Создана</th>
                </tr>
              </thead>

              <tbody>
                {filteredApplications.map(
                  (application) => (
                    <tr
  key={application.id}
  className="application-table-row"
  onClick={() =>
    openApplicationDrawer(application)
  }
>
                      <td>
                        <div className="application-client">
                          <div className="application-client__avatar">
                            {getInitials(
                              application.full_name
                            )}
                          </div>

                          <div>
                            <strong>
                              {application.full_name}
                            </strong>

                            <span>
                              {formatSource(
                                application.source
                              )}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="application-contacts">
                          <span>
                            <Phone size={13} />
                            {application.phone ||
                              "Не указан"}
                          </span>

                          <span>
                            <MessageCircle
                              size={13}
                            />
                            {application.telegram ||
                              "Не указан"}
                          </span>
                        </div>
                      </td>

                      <td>
                        <span className="application-product">
                          {application.product ||
                            "Не указан"}
                        </span>
                      </td>

                      <td>
                        <select
                          className="application-table-select"
                          value={
                            application.assigned_manager_id ||
                            ""
                          }
                          onClick={(event) =>
  event.stopPropagation()
}
                          onChange={(event) =>
                            handleManagerChange(
                              application.id,
                              event.target.value
                            )
                          }
                        >
                          <option value="">
                            Не назначен
                          </option>

                          {managers.map(
                            (manager) => (
                              <option
                                key={manager.id}
                                value={manager.id}
                              >
                                {manager.full_name ||
                                  manager.email}
                              </option>
                            )
                          )}
                        </select>
                      </td>

                      <td>
                        <select
                          className={`application-status-select application-status-select--${application.status}`}
                          value={application.status}
                          onClick={(event) =>
  event.stopPropagation()
}
                          onChange={(event) =>
                            handleStatusChange(
                              application.id,
                              event.target.value
                            )
                          }
                        >
                          {statusOptions.map(
                            (status) => (
                              <option
                                key={status.value}
                                value={status.value}
                              >
                                {status.label}
                              </option>
                            )
                          )}
                        </select>
                      </td>

                    <td>
  <strong className="application-amount">
    {application.amount === null ||
    application.amount === undefined
      ? "—"
      : formatMoney(application.amount)}
  </strong>
</td>

<td>
  <span className="application-date">
    {formatDateTime(
      application.mailing_contact?.sent_at
    )}
  </span>
</td>

<td>
  <span className="application-date">
    {formatDateTime(
      application.mailing_contact?.responded_at
    )}
  </span>
</td>

<td>
  <span className="application-days">
    {formatDaysToApplication(
      application.mailing_contact?.sent_at,
      application.mailing_contact
        ?.application_created_at ||
        application.created_at
    )}
  </span>
</td>

<td>
  <span className="application-date">
    {formatDateTime(
      application.mailing_contact
        ?.application_created_at ||
        application.created_at
    )}
  </span>
</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      

      <ApplicationDrawer
  application={selectedApplication}
  isOpen={isDrawerOpen}
  managers={managers}
  actionLoading={drawerLoading}
  onClose={closeApplicationDrawer}
  onSave={handleSaveApplication}
  onDelete={handleDeleteApplication}
/>
    </main>
  );
}


function ApplicationsKanban({
  applications,
  managers,
  draggedApplicationId,
  dragOverStatus,
  movingApplicationId,
  onDragStart,
  onDragEnd,
  onColumnDragOver,
  onColumnDragLeave,
  onColumnDrop,
  onManagerChange,
  onOpenApplication,
}) {
  return (
    <div className="applications-kanban">
      {statusOptions.map((status) => {
        const columnApplications =
          applications.filter(
            (application) =>
              application.status === status.value
          );

        const isDragOver =
          dragOverStatus === status.value;

        return (
          <section
            key={status.value}
            className={[
              "applications-kanban-column",
              `applications-kanban-column--${status.value}`,
              isDragOver
                ? "applications-kanban-column--drag-over"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onDragOver={(event) =>
              onColumnDragOver(
                event,
                status.value
              )
            }
            onDragLeave={onColumnDragLeave}
            onDrop={(event) =>
              onColumnDrop(
                event,
                status.value
              )
            }
          >
            <div className="applications-kanban-column__header">
              <div>
                <span
                  className={`applications-kanban-column__dot applications-kanban-column__dot--${status.value}`}
                />

                <strong>{status.label}</strong>
              </div>

              <span className="applications-kanban-column__count">
                {columnApplications.length}
              </span>
            </div>

            <div className="applications-kanban-column__body">
              {columnApplications.length ===
              0 ? (
                <div className="applications-kanban-empty">
                  Перетащите заявку сюда
                </div>
              ) : (
                columnApplications.map(
                  (application) => {
                    const isDragging =
                      draggedApplicationId ===
                      application.id;

                    const isMoving =
                      movingApplicationId ===
                      application.id;

                    return (
                      <article
                        key={application.id}
                        className={[
                          "applications-kanban-card",
                          isDragging
                            ? "applications-kanban-card--dragging"
                            : "",
                          isMoving
                            ? "applications-kanban-card--moving"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        draggable={!isMoving}
                        onDragStart={(event) =>
                          onDragStart(
                            event,
                            application.id
                          )
                        }
                        onDragEnd={onDragEnd}
                        onClick={() =>
  onOpenApplication(application)
}
                      >
                        <div className="applications-kanban-card__top">
                          <div className="applications-kanban-card__client">
                            <div className="applications-kanban-card__avatar">
                              {getInitials(
                                application.full_name
                              )}
                            </div>

                            <div>
                              <strong>
                                {application.full_name ||
                                  "Без имени"}
                              </strong>

                              <span>
                                {formatSource(
                                  application.source
                                )}
                              </span>
                            </div>
                          </div>

                          <GripVertical
                            className="applications-kanban-card__drag-icon"
                            size={17}
                          />
                        </div>

                        <div className="applications-kanban-card__info">
                          <div>
                            <Phone size={13} />

                            <span>
                              {application.phone ||
                                "Телефон не указан"}
                            </span>
                          </div>

                          <div>
                            <MessageCircle
                              size={13}
                            />

                            <span>
                              {application.telegram ||
                                "Telegram не указан"}
                            </span>
                          </div>
                        </div>

                        <div className="applications-kanban-card__product">
                          <span>Продукт</span>

                          <strong>
                            {application.product ||
                              "Не указан"}
                          </strong>
                        </div>

                        {application.comment && (
                          <p className="applications-kanban-card__comment">
                            {application.comment}
                          </p>
                        )}

                        <div className="applications-kanban-card__manager">
                          <span>Менеджер</span>

                          <select
                            value={
                              application.assigned_manager_id ||
                              ""
                            }
                            onClick={(event) =>
                              event.stopPropagation()
                            }
                            onMouseDown={(event) =>
                              event.stopPropagation()
                            }
                            onChange={(event) => {
                              event.stopPropagation();

                              onManagerChange(
                                application.id,
                                event.target.value
                              );
                            }}
                          >
                            <option value="">
                              Не назначен
                            </option>

                            {managers.map(
                              (manager) => (
                                <option
                                  key={manager.id}
                                  value={manager.id}
                                >
                                  {manager.full_name ||
                                    manager.email}
                                </option>
                              )
                            )}
                          </select>
                        </div>

                        <div className="applications-kanban-card__footer">
                          <strong>
                            {application.amount ===
                              null ||
                            application.amount ===
                              undefined
                              ? "Сумма не указана"
                              : formatMoney(
                                  application.amount
                                )}
                          </strong>

                          <span>
                            {formatDateTime(
                              application.created_at
                            )}
                          </span>
                        </div>

                        {isMoving && (
                          <div className="applications-kanban-card__loading">
                            Сохраняем...
                          </div>
                        )}
                      </article>
                    );
                  }
                )
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
function StatCard({
  title,
  value,
  icon: Icon,
  compact = false,
}) {
  return (
    <article className="applications-stat-card">
      <div className="applications-stat-card__icon">
        <Icon size={20} />
      </div>

      <div>
        <span>{title}</span>

        <strong
          className={
            compact
              ? "applications-stat-card__value--compact"
              : ""
          }
        >
          {value}
        </strong>
      </div>
    </article>
  );
}

function getInitials(fullName) {
  if (!fullName) {
    return "К";
  }

  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatMoney(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDateTime(dateValue) {
  if (!dateValue) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateValue));
}
function formatDaysToApplication(
  sentAt,
  applicationCreatedAt
) {
  if (!sentAt || !applicationCreatedAt) {
    return "—";
  }

  const sentDate = new Date(sentAt);
  const applicationDate = new Date(
    applicationCreatedAt
  );

  const difference =
    applicationDate.getTime() -
    sentDate.getTime();

  if (
    Number.isNaN(sentDate.getTime()) ||
    Number.isNaN(applicationDate.getTime()) ||
    difference < 0
  ) {
    return "—";
  }

  const days = Math.floor(
    difference / (1000 * 60 * 60 * 24)
  );

  if (days === 0) {
    return "В тот же день";
  }

  return `${days} дн.`;
}
function formatSource(source) {
  if (!source || source === "manual") {
    return "Вручную";
  }

  return source;
}