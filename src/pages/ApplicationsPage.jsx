import {
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Columns3,
  GripVertical,
  List,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  UserRound,
  Users,
  X,
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
    value: "new",
    label: "Новая",
  },
  {
    value: "in_progress",
    label: "В работе",
  },
  {
    value: "approved",
    label: "Успешно открыта",
  },
  {
    value: "rejected",
    label: "Отказ",
  },
];

export default function ApplicationsPage() {
  const [applications, setApplications] =
    useState([]);

  const [managers, setManagers] =
    useState([]);

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [managerFilter, setManagerFilter] =
    useState("all");

  const [viewMode, setViewMode] =
    useState("kanban");

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    selectedApplication,
    setSelectedApplication,
  ] = useState(null);

  const [isDrawerOpen, setIsDrawerOpen] =
    useState(false);

  const [drawerLoading, setDrawerLoading] =
    useState(false);

  const [
    draggedApplicationId,
    setDraggedApplicationId,
  ] = useState(null);

  const [
    dragOverStatus,
    setDragOverStatus,
  ] = useState(null);

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
        applicationsResult.error.message ||
          "Не удалось загрузить заявки"
      );
    }

    if (managersResult.error) {
      console.error(
        "Ошибка загрузки менеджеров:",
        managersResult.error
      );
    }

    setApplications(
      (
        applicationsResult.data || []
      ).map((application) => ({
        ...application,

        status:
          application.status === "waiting"
            ? "new"
            : application.status,
      }))
    );

    setManagers(
      managersResult.data || []
    );

    setIsLoading(false);
  }

  const filteredApplications = useMemo(
    () => {
      const normalizedSearch = search
        .trim()
        .toLowerCase();

      return applications.filter(
        (application) => {
          const productName =
            getProductName(application)
              .toLowerCase();

          const searchableValue = [
            application.full_name,
            application.phone,
            application.telegram,
            application.source,
            productName,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          const matchesSearch =
            !normalizedSearch ||
            searchableValue.includes(
              normalizedSearch
            );

          const matchesStatus =
            statusFilter === "all" ||
            application.status ===
              statusFilter;

          const matchesManager =
            managerFilter === "all" ||
            (
              managerFilter ===
                "unassigned" &&
              !application.assigned_manager_id
            ) ||
            application.assigned_manager_id ===
              managerFilter;

          return (
            matchesSearch &&
            matchesStatus &&
            matchesManager
          );
        }
      );
    },
    [
      applications,
      search,
      statusFilter,
      managerFilter,
    ]
  );

  const stats = useMemo(() => {
    const approvedApplications =
      applications.filter(
        (application) =>
          application.status === "approved"
      );

    return {
      total: applications.length,

      newApplications:
        applications.filter(
          (application) =>
            application.status === "new"
        ).length,

      inProgress:
        applications.filter(
          (application) =>
            application.status ===
            "in_progress"
        ).length,

      approved:
        approvedApplications.length,

      rejected:
        applications.filter(
          (application) =>
            application.status ===
            "rejected"
        ).length,

      totalAmount:
        approvedApplications.reduce(
          (sum, application) =>
            sum +
            Number(
              application.amount || 0
            ),
          0
        ),
    };
  }, [applications]);

  function openApplicationDrawer(
    application
  ) {
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

    setApplications(
      (currentApplications) =>
        currentApplications.map(
          (application) =>
            application.id ===
            applicationId
              ? {
                  ...application,
                  status,
                }
              : application
        )
    );

    const {
      data,
      error: updateError,
    } =
      await applicationService.updateStatus(
        applicationId,
        status
      );

    if (updateError) {
      console.error(
        "Ошибка изменения статуса:",
        updateError
      );

      setApplications(
        previousApplications
      );

      setError(
        updateError.message ||
          "Не удалось изменить статус"
      );

      return;
    }

    setApplications(
      (currentApplications) =>
        currentApplications.map(
          (application) =>
            application.id ===
            applicationId
              ? data
              : application
        )
    );

    if (
      selectedApplication?.id ===
      applicationId
    ) {
      setSelectedApplication(data);
    }

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
        (manager) =>
          manager.id === managerId
      ) || null;

    setApplications(
      (currentApplications) =>
        currentApplications.map(
          (application) =>
            application.id ===
            applicationId
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

    const {
      data,
      error: updateError,
    } =
      await applicationService.assignManager(
        applicationId,
        managerId
      );

    if (updateError) {
      console.error(
        "Ошибка назначения менеджера:",
        updateError
      );

      setApplications(
        previousApplications
      );

      setError(
        updateError.message ||
          "Не удалось назначить менеджера"
      );

      return;
    }

    setApplications(
      (currentApplications) =>
        currentApplications.map(
          (application) =>
            application.id ===
            applicationId
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
  ) {
    if (
      !application?.id ||
      drawerLoading
    ) {
      return;
    }

    setDrawerLoading(true);
    setError("");
    setSuccessMessage("");

    const updates = {
      full_name:
        form.full_name.trim(),

      phone:
        form.phone.trim() || null,

      telegram:
        form.telegram.trim() || null,

      source:
        form.source?.trim() || null,

      product_id:
        form.product_id || null,

      status: form.status,

      assigned_manager_id:
        form.assigned_manager_id ||
        null,

      amount:
        form.amount === ""
          ? null
          : Number(form.amount),

      comment:
        form.comment.trim() || null,
    };

    const {
      data,
      error: updateError,
    } =
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

    setApplications(
      (currentApplications) =>
        currentApplications.map(
          (item) =>
            item.id === application.id
              ? data
              : item
        )
    );

    setSelectedApplication(data);
    setSuccessMessage(
      "Заявка сохранена"
    );
    setDrawerLoading(false);
  }

  async function handleDeleteApplication(
    application
  ) {
    if (
      !application?.id ||
      drawerLoading
    ) {
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

    setApplications(
      (currentApplications) =>
        currentApplications.filter(
          (item) =>
            item.id !== application.id
        )
    );

    setDrawerLoading(false);
    setIsDrawerOpen(false);
    setSelectedApplication(null);
    setSuccessMessage(
      "Заявка удалена"
    );
  }

  function handleDragStart(
    event,
    applicationId
  ) {
    setDraggedApplicationId(
      applicationId
    );

    event.dataTransfer.effectAllowed =
      "move";

    event.dataTransfer.setData(
      "text/plain",
      applicationId
    );
  }

  function handleDragEnd() {
    setDraggedApplicationId(null);
    setDragOverStatus(null);
  }

  function handleColumnDragOver(
    event,
    status
  ) {
    event.preventDefault();

    event.dataTransfer.dropEffect =
      "move";

    setDragOverStatus(status);
  }

  function handleColumnDragLeave(
    event
  ) {
    if (
      event.currentTarget.contains(
        event.relatedTarget
      )
    ) {
      return;
    }

    setDragOverStatus(null);
  }

  async function handleColumnDrop(
    event,
    newStatus
  ) {
    event.preventDefault();

    const applicationId =
      event.dataTransfer.getData(
        "text/plain"
      ) || draggedApplicationId;

    setDraggedApplicationId(null);
    setDragOverStatus(null);

    if (!applicationId) {
      return;
    }

    const application =
      applications.find(
        (item) =>
          item.id === applicationId
      );

    if (
      !application ||
      application.status === newStatus
    ) {
      return;
    }

    setMovingApplicationId(
      applicationId
    );

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
            Управляйте заявками,
            назначайте менеджеров и
            отслеживайте успешные открытия.
          </p>
        </div>

        <button
          className="applications-header-refresh"
          type="button"
          onClick={loadPageData}
          disabled={isLoading}
        >
          <RefreshCw
            size={17}
            className={
              isLoading
                ? "applications-refresh-icon--loading"
                : ""
            }
          />

          Обновить
        </button>
      </section>

      <section className="applications-stats">
        <StatCard
          title="Всего"
          value={stats.total}
          icon={Users}
        />

        <StatCard
          title="Новые"
          value={stats.newApplications}
          icon={Clock3}
          variant="blue"
        />

        <StatCard
          title="В работе"
          value={stats.inProgress}
          icon={Clock3}
          variant="warning"
        />

        <StatCard
          title="Успешно открыты"
          value={stats.approved}
          icon={CheckCircle2}
          variant="success"
        />

        <StatCard
          title="Отказы"
          value={stats.rejected}
          icon={XCircle}
          variant="danger"
        />

        <StatCard
          title="Сумма успешных"
          value={formatMoney(
            stats.totalAmount
          )}
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
          <CheckCircle2 size={17} />
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
                setSearch(
                  event.target.value
                )
              }
              placeholder="Имя, телефон, Telegram или продукт"
            />

            {search && (
              <button
                type="button"
                aria-label="Очистить поиск"
                onClick={() =>
                  setSearch("")
                }
              >
                <X size={16} />
              </button>
            )}
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

            {managers.map(
              (manager) => (
                <option
                  key={manager.id}
                  value={manager.id}
                >
                  {getManagerName(
                    manager
                  )}
                </option>
              )
            )}
          </select>

          <div className="applications-view-switcher">
            <button
              type="button"
              className={
                viewMode === "kanban"
                  ? "applications-view-switcher__button applications-view-switcher__button--active"
                  : "applications-view-switcher__button"
              }
              onClick={() =>
                setViewMode("kanban")
              }
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
              onClick={() =>
                setViewMode("table")
              }
            >
              <List size={16} />
              <span>Таблица</span>
            </button>
          </div>
        </div>

        <div className="applications-result-line">
          Найдено заявок:{" "}
          <strong>
            {filteredApplications.length}
          </strong>
        </div>

        {isLoading ? (
          <div className="applications-state">
            <div className="applications-spinner" />

            <strong>
              Загружаем заявки
            </strong>

            <span>
              Получаем актуальные данные из
              CRM.
            </span>
          </div>
        ) : filteredApplications.length ===
          0 ? (
          <div className="applications-state">
            <Users size={42} />

            <strong>
              Заявки не найдены
            </strong>

            <span>
              Измените поиск или выбранные
              фильтры.
            </span>
          </div>
        ) : (
          <>
            <div className="applications-desktop-content">
              {viewMode === "kanban" ? (
                <ApplicationsKanban
                  applications={
                    filteredApplications
                  }
                  managers={managers}
                  draggedApplicationId={
                    draggedApplicationId
                  }
                  dragOverStatus={
                    dragOverStatus
                  }
                  movingApplicationId={
                    movingApplicationId
                  }
                  onDragStart={
                    handleDragStart
                  }
                  onDragEnd={
                    handleDragEnd
                  }
                  onColumnDragOver={
                    handleColumnDragOver
                  }
                  onColumnDragLeave={
                    handleColumnDragLeave
                  }
                  onColumnDrop={
                    handleColumnDrop
                  }
                  onManagerChange={
                    handleManagerChange
                  }
                  onOpenApplication={
                    openApplicationDrawer
                  }
                />
              ) : (
                <ApplicationsTable
                  applications={
                    filteredApplications
                  }
                  managers={managers}
                  onStatusChange={
                    handleStatusChange
                  }
                  onManagerChange={
                    handleManagerChange
                  }
                  onOpenApplication={
                    openApplicationDrawer
                  }
                />
              )}
            </div>

            <div className="applications-mobile-content">
              <ApplicationsMobileList
                applications={
                  filteredApplications
                }
                managers={managers}
                onStatusChange={
                  handleStatusChange
                }
                onManagerChange={
                  handleManagerChange
                }
                onOpenApplication={
                  openApplicationDrawer
                }
              />
            </div>
          </>
        )}
      </section>

      <ApplicationDrawer
        application={
          selectedApplication
        }
        isOpen={isDrawerOpen}
        managers={managers}
        actionLoading={drawerLoading}
        onClose={
          closeApplicationDrawer
        }
        onSave={
          handleSaveApplication
        }
        onDelete={
          handleDeleteApplication
        }
      />
    </main>
  );
}

function ApplicationsMobileList({
  applications,
  managers,
  onStatusChange,
  onManagerChange,
  onOpenApplication,
}) {
  return (
    <div className="applications-mobile-sections">
      {statusOptions.map((status) => {
        const statusApplications =
          applications.filter(
            (application) =>
              application.status ===
              status.value
          );

        return (
          <section
            className="applications-mobile-section"
            key={status.value}
          >
            <div className="applications-mobile-section__header">
              <div>
                <span
                  className={`applications-status-dot applications-status-dot--${status.value}`}
                />

                <strong>
                  {status.label}
                </strong>
              </div>

              <span>
                {
                  statusApplications.length
                }
              </span>
            </div>

            {statusApplications.length ===
            0 ? (
              <div className="applications-mobile-empty">
                В этом статусе заявок нет
              </div>
            ) : (
              <div className="applications-mobile-list">
                {statusApplications.map(
                  (application) => (
                    <ApplicationMobileCard
                      key={application.id}
                      application={
                        application
                      }
                      managers={managers}
                      onStatusChange={
                        onStatusChange
                      }
                      onManagerChange={
                        onManagerChange
                      }
                      onOpenApplication={
                        onOpenApplication
                      }
                    />
                  )
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ApplicationMobileCard({
  application,
  managers,
  onStatusChange,
  onManagerChange,
  onOpenApplication,
}) {
  return (
    <article className="application-mobile-card">
      <button
        className="application-mobile-card__main"
        type="button"
        onClick={() =>
          onOpenApplication(application)
        }
      >
        <div className="application-mobile-card__top">
          <div className="application-mobile-card__person">
            <div className="application-mobile-card__avatar">
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

          <span
            className={`application-mobile-status application-mobile-status--${application.status}`}
          >
            {getStatusLabel(
              application.status
            )}
          </span>
        </div>

        <div className="application-mobile-card__contacts">
          <span>
            <Phone size={14} />
            {application.phone ||
              "Телефон не указан"}
          </span>

          <span>
            <MessageCircle size={14} />
            {application.telegram ||
              "Telegram не указан"}
          </span>
        </div>

        <div className="application-mobile-card__product">
          <span>Продукт</span>

          <strong>
            {getProductName(application)}
          </strong>
        </div>

        <div className="application-mobile-card__meta">
          <div>
            <span>Создана</span>

            <strong>
              {formatDateTime(
                application.created_at
              )}
            </strong>
          </div>

          <div>
            <span>Сумма</span>

            <strong>
              {application.amount ===
                null ||
              application.amount ===
                undefined
                ? "Не указана"
                : formatMoney(
                    application.amount
                  )}
            </strong>
          </div>
        </div>
      </button>

      <div className="application-mobile-card__controls">
        <label>
          <span>Статус</span>

          <select
            className={`application-mobile-select application-mobile-select--${application.status}`}
            value={application.status}
            onChange={(event) =>
              onStatusChange(
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
        </label>

        <label>
          <span>Менеджер</span>

          <select
            className="application-mobile-select"
            value={
              application.assigned_manager_id ||
              ""
            }
            onChange={(event) =>
              onManagerChange(
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
                  {getManagerName(
                    manager
                  )}
                </option>
              )
            )}
          </select>
        </label>
      </div>

      <button
        className="application-mobile-card__open"
        type="button"
        onClick={() =>
          onOpenApplication(application)
        }
      >
        Открыть заявку
      </button>
    </article>
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
              application.status ===
              status.value
          );

        const isDragOver =
          dragOverStatus ===
          status.value;

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
            onDragLeave={
              onColumnDragLeave
            }
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
                  className={`applications-status-dot applications-status-dot--${status.value}`}
                />

                <strong>
                  {status.label}
                </strong>
              </div>

              <span className="applications-kanban-column__count">
                {
                  columnApplications.length
                }
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
                        onDragEnd={
                          onDragEnd
                        }
                        onClick={() =>
                          onOpenApplication(
                            application
                          )
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
                            {getProductName(
                              application
                            )}
                          </strong>
                        </div>

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
                                  {getManagerName(
                                    manager
                                  )}
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

function ApplicationsTable({
  applications,
  managers,
  onStatusChange,
  onManagerChange,
  onOpenApplication,
}) {
  return (
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
            <th>Создана</th>
          </tr>
        </thead>

        <tbody>
          {applications.map(
            (application) => (
              <tr
                key={application.id}
                className="application-table-row"
                onClick={() =>
                  onOpenApplication(
                    application
                  )
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
                    {getProductName(
                      application
                    )}
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
                      onManagerChange(
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
                          {getManagerName(
                            manager
                          )}
                        </option>
                      )
                    )}
                  </select>
                </td>

                <td>
                  <select
                    className={`application-status-select application-status-select--${application.status}`}
                    value={
                      application.status
                    }
                    onClick={(event) =>
                      event.stopPropagation()
                    }
                    onChange={(event) =>
                      onStatusChange(
                        application.id,
                        event.target.value
                      )
                    }
                  >
                    {statusOptions.map(
                      (status) => (
                        <option
                          key={
                            status.value
                          }
                          value={
                            status.value
                          }
                        >
                          {status.label}
                        </option>
                      )
                    )}
                  </select>
                </td>

                <td>
                  <strong className="application-amount">
                    {application.amount ===
                      null ||
                    application.amount ===
                      undefined
                      ? "—"
                      : formatMoney(
                          application.amount
                        )}
                  </strong>
                </td>

                <td>
                  <span className="application-date">
                    {formatDateTime(
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
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  compact = false,
  variant = "",
}) {
  return (
    <article
      className={[
        "applications-stat-card",
        variant
          ? `applications-stat-card--${variant}`
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
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

function getProductName(application) {
  return (
    application?.product_data?.name ||
    application?.product ||
    "Не указан"
  );
}

function getManagerName(manager) {
  return (
    manager?.full_name ||
    manager?.email ||
    "Без имени"
  );
}

function getStatusLabel(statusValue) {
  return (
    statusOptions.find(
      (status) =>
        status.value === statusValue
    )?.label || statusValue
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
  return new Intl.NumberFormat(
    "ru-RU",
    {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0,
    }
  ).format(
    Number(value || 0)
  );
}

function formatDateTime(dateValue) {
  if (!dateValue) {
    return "—";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(date);
}

function formatSource(source) {
  if (!source || source === "manual") {
    return "Вручную";
  }

  return source;
}