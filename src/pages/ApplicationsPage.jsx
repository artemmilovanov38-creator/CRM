import {
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Columns3,
  GripVertical,
  List,
  MessageCircle,
  Package,
  Phone,
  RefreshCw,
  Search,
  UserRound,
  Users,
  X,
  XCircle,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import "../styles/Applications.css";

import { useAuth } from "../context/AuthContext";
import { applicationService, getApplicationPayout } from "../services/applicationService";
import { productService } from "../services/productService";
import { profileService } from "../services/profileService";
import ApplicationDrawer from "../components/applications/ApplicationDrawer";
import PeriodFilter from "../components/filters/PeriodFilter";
import ManagerAnalytics from "../components/analytics/ManagerAnalytics";
import {
  formatDateInput,
  getPeriodBounds,
} from "../utils/periodRange";
import { formatServiceError } from "../utils/serviceError";
import {
  APPLICATION_STATUS_OPTIONS,
  applicationMatchesStatusAndPeriod,
  buildStatusFilterOptions,
  buildVisibleStatusColumns,
  getOpenedAt,
  getStatusLabel,
  normalizeApplicationStatus,
} from "../utils/applicationEvents";
import { buildApplicationBoard } from "../utils/applicationStats";

const statusOptions = APPLICATION_STATUS_OPTIONS;

export default function ApplicationsPage() {
  const { user } = useAuth();

  const isManager =
    user?.role === "manager";

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

  const [productFilter, setProductFilter] =
    useState("all");

  const [products, setProducts] =
    useState([]);

  const [periodPreset, setPeriodPreset] =
    useState("all");

  const [customFrom, setCustomFrom] =
    useState(formatDateInput(new Date()));

  const [customTo, setCustomTo] =
    useState(formatDateInput(new Date()));

  const [viewMode, setViewMode] =
    useState("kanban");

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const requestIdRef = useRef(0);

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

  const periodRange = useMemo(
    () =>
      getPeriodBounds(
        periodPreset,
        customFrom,
        customTo
      ),
    [
      periodPreset,
      customFrom,
      customTo,
    ]
  );

  const canAssignManager = !isManager;

  const managerIdForQuery =
    isManager || managerFilter === "all"
      ? null
      : managerFilter;

  const productIdForQuery =
    productFilter === "all"
      ? null
      : productFilter;

  const productOptions = useMemo(
    () => {
      const byId = new Map();

      for (const product of products) {
        if (!product?.id) {
          continue;
        }

        byId.set(String(product.id), {
          id: product.id,
          name: product.name,
        });
      }

      for (const application of applications) {
        const id =
          application.product_id ||
          application.product_data?.id;

        if (!id) {
          continue;
        }

        const key = String(id);

        if (byId.has(key)) {
          continue;
        }

        byId.set(key, {
          id,
          name:
            application.product_data
              ?.name ||
            application.product ||
            "Продукт",
        });
      }

      return [...byId.values()].sort(
        (left, right) =>
          String(left.name).localeCompare(
            String(right.name),
            "ru"
          )
      );
    },
    [products, applications]
  );

  const selectedProduct = useMemo(
    () =>
      productOptions.find(
        (product) =>
          String(product.id) ===
          String(productFilter)
      ) || null,
    [productOptions, productFilter]
  );

  const board = useMemo(
    () =>
      buildApplicationBoard({
        applications,
        managers,
        search,
        statusFilter,
        productId: productIdForQuery,
        selectedProduct,
        rangeFrom: periodRange.from,
        rangeTo: periodRange.to,
      }),
    [
      applications,
      managers,
      search,
      statusFilter,
      productIdForQuery,
      selectedProduct,
      periodRange.from,
      periodRange.to,
    ]
  );

  const stats = board.stats;
  const filteredApplications = board.visible;
  const successfulOpenings = board.successful;
  const deferredOpenings = board.deferredOpenings;
  const managerAnalytics = board.managers;
  const productStats = board.products;
  const successfulOpeningsAmount = stats.totalAmount;

  const statusFilterOptions = useMemo(
    () => buildStatusFilterOptions(applications),
    [applications]
  );

  const visibleStatusColumns = useMemo(
    () =>
      buildVisibleStatusColumns(
        filteredApplications,
        statusFilter
      ),
    [filteredApplications, statusFilter]
  );

  const loadPageData = useCallback(
    async (showLoader = true) => {
      if (!user?.id) {
        if (showLoader) {
          setIsLoading(false);
        }

        return;
      }

      const requestId = ++requestIdRef.current;
      const isStale = () =>
        requestId !== requestIdRef.current;

      if (showLoader) {
        setIsLoading(true);
      }

      setError("");

      const scopedManagerId = isManager
        ? user.id
        : managerIdForQuery;

      const applicationsPromise =
        applicationService
          .getApplications({
            dateFrom: periodRange.from,
            dateTo: periodRange.to,
            managerId: scopedManagerId,
            productId: productIdForQuery,
          })
          .catch((loadError) => ({
            data: [],
            error: loadError,
          }));

      const managersPromise = isManager
        ? Promise.resolve({
            data: [],
            error: null,
          })
        : profileService.getManagers().catch(
            (loadError) => ({
              data: [],
              error: loadError,
            })
          );

      const productsPromise = productService
        .getProducts()
        .catch((loadError) => ({
          data: [],
          error: loadError,
        }));

      try {
        const [
          applicationsResult,
          managersResult,
          productsResult,
        ] = await Promise.all([
          applicationsPromise,
          managersPromise,
          productsPromise,
        ]);

        if (isStale()) {
          return;
        }

        if (applicationsResult.error) {
          console.error(
            "Ошибка загрузки заявок:",
            applicationsResult.error
          );

          setError(
            formatServiceError(
              applicationsResult.error,
              "Не удалось загрузить заявки"
            )
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

        setApplications(
          (applicationsResult.data || [])
            .filter(Boolean)
            .map((application) => ({
              ...application,
              status:
                normalizeApplicationStatus(
                  application.status
                ),
            }))
        );

        setManagers(
          (managersResult.data || []).filter(
            (manager) =>
              manager.status !== "blocked"
          )
        );

        setProducts(productsResult.data || []);
      } catch (loadError) {
        if (isStale()) {
          return;
        }

        console.error(
          "Ошибка загрузки заявок:",
          loadError
        );

        setError(
          formatServiceError(
            loadError,
            "Не удалось загрузить заявки"
          )
        );
        setApplications([]);
      } finally {
        if (!isStale() && showLoader) {
          setIsLoading(false);
        }
      }
    },
    [
      isManager,
      managerIdForQuery,
      periodRange.from,
      periodRange.to,
      productIdForQuery,
      user?.id,
    ]
  );

  useEffect(() => {
    loadPageData();

    return () => {
      requestIdRef.current += 1;
    };
  }, [loadPageData]);

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

    loadPageData(false);
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

    loadPageData(false);
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

      pp_id:
        form.pp_id?.trim() || null,
    };

    if (
      form.product_id &&
      String(form.product_id) !==
        String(application.product_id || "")
    ) {
      updates.product_id =
        form.product_id;
    }

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
    loadPageData(false);
  }

  async function handleMarkReceiptOpened(
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

    const {
      data,
      error: openError,
      alreadyOpened,
    } =
      await applicationService.markReceiptOpened(
        application.id
      );

    if (openError) {
      console.error(
        "Ошибка отметки квита:",
        openError
      );

      setError(
        openError.message ||
          "Не удалось отметить квит открытым"
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
      alreadyOpened
        ? "Квит уже был отмечен открытым"
        : "Квит отмечен открытым"
    );
    setDrawerLoading(false);
    loadPageData(false);
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
    loadPageData(false);
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
            {isManager
              ? "Ваши заявки и статусы: новые, в работе, успешно и отказы."
              : "Управляйте заявками, назначайте менеджеров и отслеживайте успешные открытия."}
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

      <p className="applications-period-label">
        Статистика {periodRange.label}
        {managerFilter !== "all" &&
        !isManager
          ? ` · ${
              managerFilter ===
              "unassigned"
                ? "без менеджера"
                : getManagerName(
                    managers.find(
                      (manager) =>
                        manager.id ===
                        managerFilter
                    )
                  )
            }`
          : ""}
        {productFilter !== "all"
          ? ` · ${
              selectedProduct?.name ||
              "выбранный продукт"
            }`
          : ""}
      </p>

      <p className="applications-period-hint">
        «Всего» и «Новые» — по дате создания
        заявки. «В работе» — по дате перехода
        в этот статус. «Успешно открыты»,
        сумма и зарплата — только по дате
        открытия квита. Заявка, созданная
        здесь, а открытая позже, остаётся
        в списке и таблице, но в карточку
        «Успешно открыты» и в зарплату
        попадает в периоде открытия квита.
      </p>

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
          value={successfulOpenings.length}
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
            successfulOpeningsAmount
          )}
          icon={CircleDollarSign}
          compact
        />
      </section>

      {productStats.length > 0 && (
        <section className="applications-product-stats">
          <div className="applications-product-stats__header">
            <Package size={18} />
            <div>
              <h2>По продуктам</h2>
              <p>
                Те же фильтры, что сверху:
                период, менеджер, статус и продукт.
                Успешные считаются по дате открытия
                квита.
              </p>
            </div>
          </div>

          <div className="applications-product-stats__grid">
            {productStats.map((item) => (
              <article
                key={item.productId || item.name}
              >
                <span>{item.name}</span>
                <strong>
                  {item.opened} успешно ·{" "}
                  {formatMoney(item.amount)}
                </strong>
                <small>
                  Заявок: {item.total}
                </small>
              </article>
            ))}
          </div>
        </section>
      )}

      {deferredOpenings.length > 0 && (
        <div className="applications-alert applications-alert--info">
          <div>
            <strong>
              {deferredOpenings.length}{" "}
              {deferredOpenings.length === 1
                ? "заявка создана"
                : deferredOpenings.length < 5
                  ? "заявки созданы"
                  : "заявок создано"}{" "}
              в этом периоде, но квит открыт
              позже
            </strong>
            <p>
              Они не входят в «Успешно открыты»
              и в расчёт зарплаты {periodRange.label}.
              Открытия учтутся в периоде даты
              квита. В таблице они видны.
            </p>
            <ul>
              {deferredOpenings.map((application) => (
                <li key={application.id}>
                  {application.telegram ||
                    application.full_name ||
                    "Без имени"}
                  {" · "}
                  {getProductName(application)}
                  {" · "}
                  {formatApplicationMoney(application)}
                  {" · открыта "}
                  {formatDateTime(getOpenedAt(application))}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {error && (
        <div className="applications-alert applications-alert--error">
          <span>{error}</span>

          <button
            className="applications-alert__retry"
            type="button"
            onClick={() => loadPageData()}
            disabled={isLoading}
          >
            Повторить загрузку
          </button>
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

          <div className="applications-toolbar__filters">
            <select
              className="applications-filter"
              value={statusFilter}
              aria-label="Фильтр по статусу"
              onChange={(event) =>
                setStatusFilter(
                  event.target.value
                )
              }
            >
              {statusFilterOptions.map(
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

            {!isManager && (
              <select
                className="applications-filter"
                value={managerFilter}
                aria-label="Фильтр по менеджеру"
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
            )}

            <select
              className="applications-filter applications-filter--product"
              value={productFilter}
              aria-label="Фильтр по продукту"
              onChange={(event) =>
                setProductFilter(
                  event.target.value
                )
              }
            >
              <option value="all">
                Все продукты
              </option>

              {productOptions.map((product) => (
                <option
                  key={product.id}
                  value={String(product.id)}
                >
                  {product.name}
                </option>
              ))}
            </select>
          </div>

          <PeriodFilter
            preset={periodPreset}
            customFrom={customFrom}
            customTo={customTo}
            onPresetChange={
              setPeriodPreset
            }
            onCustomFromChange={
              setCustomFrom
            }
            onCustomToChange={
              setCustomTo
            }
          />

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

        {!isManager && (
          <ManagerAnalytics
            title={`Результат менеджеров ${periodRange.label}${
              productFilter !== "all"
                ? ` · ${
                    selectedProduct?.name ||
                    "продукт"
                  }`
                : ""
            }`}
            rows={managerAnalytics}
            variant="applications"
          />
        )}

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
                  statusColumns={
                    visibleStatusColumns
                  }
                  rangeFrom={periodRange.from}
                  rangeTo={periodRange.to}
                  managers={managers}
                  canAssignManager={
                    canAssignManager
                  }
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
                  canAssignManager={
                    canAssignManager
                  }
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
                statusColumns={
                  visibleStatusColumns
                }
                rangeFrom={periodRange.from}
                rangeTo={periodRange.to}
                managers={managers}
                canAssignManager={
                  canAssignManager
                }
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
        onMarkOpened={
          handleMarkReceiptOpened
        }
      />
    </main>
  );
}

function ApplicationsMobileList({
  applications,
  statusColumns = statusOptions,
  rangeFrom = null,
  rangeTo = null,
  managers,
  canAssignManager = true,
  onStatusChange,
  onManagerChange,
  onOpenApplication,
}) {
  return (
    <div className="applications-mobile-sections">
      {statusColumns.map((status) => {
        const statusApplications =
          applications.filter(
            (application) =>
              application.status ===
                status.value &&
              applicationMatchesStatusAndPeriod(
                application,
                status.value,
                rangeFrom,
                rangeTo
              )
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
                      canAssignManager={
                        canAssignManager
                      }
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
  canAssignManager = true,
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
            <span>Открыта</span>

            <strong>
              {formatDateTime(
                getOpenedAt(application)
              )}
            </strong>
          </div>

          <div>
            <span>Сумма</span>

            <strong>
              {formatApplicationMoney(
                application
              )}
            </strong>
          </div>
        </div>
      </button>

      <div
        className={[
          "application-mobile-card__controls",
          canAssignManager
            ? ""
            : "application-mobile-card__controls--single",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <label>
          <span>Статус</span>

          <select
            className={`application-mobile-select application-mobile-select--${getSelectStatus(
              application.status
            )}`}
            value={getSelectStatus(
              application.status
            )}
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

        {canAssignManager && (
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

              {getManagerOptions(
                managers,
                application.assigned_manager_id
              ).map(
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
        )}
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
  statusColumns = statusOptions,
  rangeFrom = null,
  rangeTo = null,
  managers,
  canAssignManager = true,
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
    <div
      className={[
        "applications-kanban",
        statusColumns.length === 1
          ? "applications-kanban--single"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {statusColumns.map((status) => {
        const columnApplications =
          applications.filter(
            (application) =>
              application.status ===
                status.value &&
              applicationMatchesStatusAndPeriod(
                application,
                status.value,
                rangeFrom,
                rangeTo
              )
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

                        {canAssignManager && (
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

                              {getManagerOptions(
                                managers,
                                application.assigned_manager_id
                              ).map(
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
                        )}

                        <div className="applications-kanban-card__footer">
                          <strong>
                            {formatApplicationMoney(
                              application
                            )}
                          </strong>

                          <span>
                            {application.status ===
                            "approved"
                              ? `Открыта ${formatDateTime(
                                  getOpenedAt(
                                    application
                                  )
                                )}`
                              : formatDateTime(
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
  canAssignManager = true,
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
            {canAssignManager && (
              <th>Менеджер</th>
            )}
            <th>Статус</th>
            <th>Сумма</th>
            <th>Создана</th>
            <th>Открыта</th>
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

                {canAssignManager && (
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

                      {getManagerOptions(
                        managers,
                        application.assigned_manager_id
                      ).map(
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
                )}

                <td>
                  <select
                    className={`application-status-select application-status-select--${getSelectStatus(
                      application.status
                    )}`}
                    value={
                      getSelectStatus(
                        application.status
                      )
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
                    {formatApplicationMoney(
                      application
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

                <td>
                  <span className="application-date">
                    {formatDateTime(
                      getOpenedAt(application)
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
    "Продукт не указан"
  );
}

function getManagerOptions(
  managers,
  currentManagerId
) {
  const options = Array.isArray(managers)
    ? [...managers]
    : [];

  if (
    currentManagerId &&
    !options.some(
      (manager) =>
        manager.id === currentManagerId
    )
  ) {
    options.push({
      id: currentManagerId,
      full_name: "Менеджер",
    });
  }

  return options;
}

function getSelectStatus(status) {
  if (
    statusOptions.some(
      (item) => item.value === status
    )
  ) {
    return status;
  }

  return "new";
}

function getManagerName(manager) {
  return (
    manager?.full_name ||
    manager?.email ||
    "Без имени"
  );
}

function getInitials(fullName) {
  const name = String(fullName || "").trim();

  if (!name) {
    return "К";
  }

  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase() || "К";
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

function formatApplicationMoney(
  application
) {
  const payout =
    getApplicationPayout(application);

  if (payout === null) {
    return "Не указана";
  }

  return formatMoney(payout);
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