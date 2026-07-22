

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import "../styles/reports.css";
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FileText,
  Filter,
  RefreshCw,
  Search,
  TrendingUp,
  Trophy,
  Users,
  WalletCards,
  XCircle,
} from "lucide-react";

import {
  PRODUCT_RATES,
  reportService,
} from "../services/reportService";

const periodOptions = [
  {
    value: "today",
    label: "Сегодня",
  },
  {
    value: "week",
    label: "Последние 7 дней",
  },
  {
    value: "month",
    label: "Текущий месяц",
  },
  {
    value: "previous-month",
    label: "Прошлый месяц",
  },
  {
    value: "custom",
    label: "Свой период",
  },
];

const statusOptions = [
  {
    value: "",
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
    value: "waiting",
    label: "Ожидание",
  },
  {
    value: "approved",
    label: "Успешные",
  },
  {
    value: "rejected",
    label: "Отказы",
  },
];

const emptyMetrics = {
  totalApplications: 0,
  approved: 0,
  rejected: 0,
  active: 0,
  new: 0,
  inProgress: 0,
  waiting: 0,
  conversion: 0,
  totalAmount: 0,
  approvedAmount: 0,
  salaryFund: 0,
  averageApplicationAmount: 0,
  averageApprovedAmount: 0,
};

const initialReport = {
  applications: [],
  managers: [],
  metrics: emptyMetrics,
  statusStats: [],
  productStats: [],
  sourceStats: [],
  managerStats: [],
  dailyStats: [],
};

export default function Reports() {
  const [report, setReport] =
    useState(initialReport);

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [selectedPeriod, setSelectedPeriod] =
    useState("month");

  const [customDateFrom, setCustomDateFrom] =
    useState("");

  const [customDateTo, setCustomDateTo] =
    useState("");

  const [selectedManagerId, setSelectedManagerId] =
    useState("");

  const [selectedProduct, setSelectedProduct] =
    useState("");

  const [selectedSource, setSelectedSource] =
    useState("");

  const [selectedStatus, setSelectedStatus] =
    useState("");

  const [managerSearch, setManagerSearch] =
    useState("");

  const [managerSort, setManagerSort] =
    useState("approved");

  const dateRange = useMemo(() => {
    if (selectedPeriod === "custom") {
      return {
        dateFrom: customDateFrom || null,
        dateTo: customDateTo || null,
      };
    }

    return getPeriodDateRange(
      selectedPeriod
    );
  }, [
    selectedPeriod,
    customDateFrom,
    customDateTo,
  ]);

  const loadReport = useCallback(
    async ({
      showLoading = true,
    } = {}) => {
      if (
        selectedPeriod === "custom" &&
        customDateFrom &&
        customDateTo &&
        customDateFrom > customDateTo
      ) {
        setError(
          "Начальная дата не может быть позже конечной"
        );

        setIsLoading(false);
        return;
      }

      if (showLoading) {
        setIsLoading(true);
      }

      setError("");

      const { data, error: reportError } =
        await reportService.getReportData({
          dateFrom: dateRange.dateFrom,
          dateTo: dateRange.dateTo,
          managerId:
            selectedManagerId || null,
          product:
            selectedProduct || null,
          source:
            selectedSource || null,
          status:
            selectedStatus || null,
        });

      if (reportError) {
        console.error(
          "Ошибка загрузки отчёта:",
          reportError
        );

        setError(
          "Не удалось загрузить данные отчёта"
        );

        setIsLoading(false);
        return;
      }

      setReport(
        data || initialReport
      );

      setIsLoading(false);
    },
    [
      selectedPeriod,
      customDateFrom,
      customDateTo,
      dateRange.dateFrom,
      dateRange.dateTo,
      selectedManagerId,
      selectedProduct,
      selectedSource,
      selectedStatus,
    ]
  );

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const managerOptions = useMemo(() => {
    return [...report.managers].sort(
      (first, second) => {
        const firstName =
          first.full_name ||
          first.email ||
          "";

        const secondName =
          second.full_name ||
          second.email ||
          "";

        return firstName.localeCompare(
          secondName,
          "ru"
        );
      }
    );
  }, [report.managers]);

  const productOptions = useMemo(() => {
    const values = new Set();

    report.applications.forEach(
      (application) => {
        const product =
          application.product?.trim();

        if (product) {
          values.add(product);
        }
      }
    );

    return Array.from(values).sort(
      (first, second) =>
        first.localeCompare(
          second,
          "ru"
        )
    );
  }, [report.applications]);

  const sourceOptions = useMemo(() => {
    const values = new Set();

    report.applications.forEach(
      (application) => {
        const source =
          application.source?.trim();

        if (source) {
          values.add(source);
        }
      }
    );

    return Array.from(values).sort(
      (first, second) =>
        formatSource(first).localeCompare(
          formatSource(second),
          "ru"
        )
    );
  }, [report.applications]);

  const preparedManagers =
    useMemo(() => {
      const search =
        managerSearch
          .trim()
          .toLowerCase();

      const filtered =
        report.managerStats.filter(
          (manager) => {
            if (!search) {
              return true;
            }

            return (
              manager.name
                .toLowerCase()
                .includes(search) ||
              manager.email
                .toLowerCase()
                .includes(search)
            );
          }
        );

      return [...filtered].sort(
        (first, second) => {
          if (
            managerSort === "name"
          ) {
            return first.name.localeCompare(
              second.name,
              "ru"
            );
          }

          if (
            managerSort ===
            "applications"
          ) {
            return (
              second.applications -
              first.applications
            );
          }

          if (
            managerSort ===
            "conversion"
          ) {
            return (
              second.conversion -
              first.conversion
            );
          }

          if (
            managerSort === "salary"
          ) {
            return (
              second.salary -
              first.salary
            );
          }

          return (
            second.approved -
            first.approved
          );
        }
      );
    }, [
      report.managerStats,
      managerSearch,
      managerSort,
    ]);

  const bestManager =
    useMemo(() => {
      return [...report.managerStats]
        .filter(
          (manager) =>
            manager.id !==
            "unassigned"
        )
        .sort(
          (first, second) =>
            second.approved -
              first.approved ||
            second.conversion -
              first.conversion
        )[0] || null;
    }, [report.managerStats]);

  const maxDailyValue =
    useMemo(() => {
      return Math.max(
        ...report.dailyStats.map(
          (day) =>
            day.applications
        ),
        1
      );
    }, [report.dailyStats]);

  const chartPoints =
    useMemo(() => {
      return buildChartPoints(
        report.dailyStats,
        maxDailyValue
      );
    }, [
      report.dailyStats,
      maxDailyValue,
    ]);

  function handlePeriodChange(event) {
    const value =
      event.target.value;

    setSelectedPeriod(value);

    if (value !== "custom") {
      setCustomDateFrom("");
      setCustomDateTo("");
    }
  }

  function handleResetFilters() {
    setSelectedPeriod("month");
    setCustomDateFrom("");
    setCustomDateTo("");
    setSelectedManagerId("");
    setSelectedProduct("");
    setSelectedSource("");
    setSelectedStatus("");
    setManagerSearch("");
    setManagerSort("approved");
  }

  function handleExport() {
    const rows =
      report.applications.map(
        (application) => ({
          "Дата создания":
            formatDateTime(
              application.created_at
            ),

          "Имя клиента":
            application.full_name ||
            "",

          Телефон:
            application.phone ||
            "",

          Telegram:
            application.telegram ||
            "",

          Источник:
            formatSource(
              application.source
            ),

          Продукт:
            application.product ||
            "",

          Статус:
            getStatusLabel(
              application.status
            ),

          Менеджер:
            application
              .assigned_manager
              ?.full_name ||
            application
              .assigned_manager
              ?.email ||
            "Не назначен",

          Сумма:
            application.amount ??
            "",

          "Расчётная выплата":
            application.status ===
            "approved"
              ? getProductRateByName(
                  application.product
                )
              : 0,
        })
      );

    if (rows.length === 0) {
      setError(
        "Нет данных для выгрузки"
      );

      return;
    }

    downloadCsv(
      rows,
      `report-${dateRange.dateFrom || "all"}-${dateRange.dateTo || "all"}.csv`
    );
  }

  if (isLoading) {
    return (
      <main className="page">
        <div className="reports-loading-state">
          <div className="reports-loading-spinner" />

          <span>
            Загрузка отчёта...
          </span>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
           <div className="page-header">
        <div>
          <h1 className="page-title">
            Отчёты
          </h1>

          <p className="page-description">
            Аналитика заявок, открытий, продуктов и работы менеджеров
          </p>
        </div>

        <div className="reports-header-actions">
          <button
            className="secondary-button button-with-icon"
            type="button"
            onClick={() =>
              loadReport({
                showLoading: true,
              })
            }
          >
            <RefreshCw size={17} />
            Обновить
          </button>

          <button
            className="primary-button button-with-icon"
            type="button"
            onClick={handleExport}
          >
            <Download size={17} />
            Скачать CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="reports-error-message">
          <XCircle size={18} />
          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Закрыть сообщение"
          >
            ×
          </button>
        </div>
      )}

      <section className="reports-filter-card">
        <div className="reports-filter-heading">
          <div>
            <Filter size={18} />

            <div>
              <h2>Фильтры отчёта</h2>
              <p>
                Выберите период, менеджера, продукт или статус
              </p>
            </div>
          </div>

          <button
            className="reports-reset-button"
            type="button"
            onClick={handleResetFilters}
          >
            Сбросить фильтры
          </button>
        </div>

        <div className="reports-filter-grid">
          <label className="reports-filter-field">
            <span>Период</span>

            <div className="reports-filter-control">
              <CalendarDays size={16} />

              <select
                value={selectedPeriod}
                onChange={handlePeriodChange}
              >
                {periodOptions.map(
                  (period) => (
                    <option
                      value={period.value}
                      key={period.value}
                    >
                      {period.label}
                    </option>
                  )
                )}
              </select>
            </div>
          </label>

          {selectedPeriod === "custom" && (
            <>
              <label className="reports-filter-field">
                <span>Дата от</span>

                <div className="reports-filter-control">
                  <CalendarDays size={16} />

                  <input
                    type="date"
                    value={customDateFrom}
                    onChange={(event) =>
                      setCustomDateFrom(
                        event.target.value
                      )
                    }
                  />
                </div>
              </label>

              <label className="reports-filter-field">
                <span>Дата до</span>

                <div className="reports-filter-control">
                  <CalendarDays size={16} />

                  <input
                    type="date"
                    value={customDateTo}
                    onChange={(event) =>
                      setCustomDateTo(
                        event.target.value
                      )
                    }
                  />
                </div>
              </label>
            </>
          )}

          <label className="reports-filter-field">
            <span>Менеджер</span>

            <div className="reports-filter-control">
              <Users size={16} />

              <select
                value={selectedManagerId}
                onChange={(event) =>
                  setSelectedManagerId(
                    event.target.value
                  )
                }
              >
                <option value="">
                  Все менеджеры
                </option>

                {managerOptions.map(
                  (manager) => (
                    <option
                      value={manager.id}
                      key={manager.id}
                    >
                      {manager.full_name ||
                        manager.email ||
                        "Без имени"}
                    </option>
                  )
                )}
              </select>
            </div>
          </label>

          <label className="reports-filter-field">
            <span>Продукт</span>

            <div className="reports-filter-control">
              <WalletCards size={16} />

              <select
                value={selectedProduct}
                onChange={(event) =>
                  setSelectedProduct(
                    event.target.value
                  )
                }
              >
                <option value="">
                  Все продукты
                </option>

                {productOptions.map(
                  (product) => (
                    <option
                      value={product}
                      key={product}
                    >
                      {product}
                    </option>
                  )
                )}
              </select>
            </div>
          </label>

          <label className="reports-filter-field">
            <span>Источник</span>

            <div className="reports-filter-control">
              <TrendingUp size={16} />

              <select
                value={selectedSource}
                onChange={(event) =>
                  setSelectedSource(
                    event.target.value
                  )
                }
              >
                <option value="">
                  Все источники
                </option>

                {sourceOptions.map(
                  (source) => (
                    <option
                      value={source}
                      key={source}
                    >
                      {formatSource(source)}
                    </option>
                  )
                )}
              </select>
            </div>
          </label>

          <label className="reports-filter-field">
            <span>Статус</span>

            <div className="reports-filter-control">
              <CheckCircle2 size={16} />

              <select
                value={selectedStatus}
                onChange={(event) =>
                  setSelectedStatus(
                    event.target.value
                  )
                }
              >
                {statusOptions.map(
                  (status) => (
                    <option
                      value={status.value}
                      key={
                        status.value ||
                        "all"
                      }
                    >
                      {status.label}
                    </option>
                  )
                )}
              </select>
            </div>
          </label>
        </div>
      </section>

      <section className="reports-metrics-grid">
        <article className="reports-metric-card">
          <div className="reports-metric-icon">
            <FileText size={20} />
          </div>

          <div>
            <span>Всего заявок</span>

            <strong>
              {formatNumber(
                report.metrics
                  .totalApplications
              )}
            </strong>

            <small>
              За выбранный период
            </small>
          </div>
        </article>

        <article className="reports-metric-card">
          <div className="reports-metric-icon reports-metric-icon--green">
            <CheckCircle2 size={20} />
          </div>

          <div>
            <span>Успешные открытия</span>

            <strong>
              {formatNumber(
                report.metrics.approved
              )}
            </strong>

            <small>
              Статус approved
            </small>
          </div>
        </article>

        <article className="reports-metric-card">
          <div className="reports-metric-icon reports-metric-icon--orange">
            <TrendingUp size={20} />
          </div>

          <div>
            <span>В работе</span>

            <strong>
              {formatNumber(
                report.metrics.active
              )}
            </strong>

            <small>
              Новые, в работе и ожидании
            </small>
          </div>
        </article>

        <article className="reports-metric-card">
          <div className="reports-metric-icon reports-metric-icon--red">
            <XCircle size={20} />
          </div>

          <div>
            <span>Отказы</span>

            <strong>
              {formatNumber(
                report.metrics.rejected
              )}
            </strong>

            <small>
              Статус rejected
            </small>
          </div>
        </article>

        <article className="reports-metric-card">
          <div className="reports-metric-icon reports-metric-icon--purple">
            <Filter size={20} />
          </div>

          <div>
            <span>Конверсия</span>

            <strong>
              {report.metrics.conversion}%
            </strong>

            <small>
              Из заявки в открытие
            </small>
          </div>
        </article>

        <article className="reports-metric-card">
          <div className="reports-metric-icon reports-metric-icon--pink">
            <CircleDollarSign size={20} />
          </div>

          <div>
            <span>Фонд выплат</span>

            <strong>
              {formatMoney(
                report.metrics.salaryFund
              )}
            </strong>

            <small>
              По успешным продуктам
            </small>
          </div>
        </article>
      </section>

      <div className="reports-main-grid">
        <section className="reports-chart-card">
          <div className="reports-card-heading">
            <div>
              <h2>
                Динамика заявок
              </h2>

              <p>
                Количество заявок и успешных открытий по дням
              </p>
            </div>

            <TrendingUp size={20} />
          </div>

          {report.dailyStats.length > 0 ? (
            <div className="reports-line-chart">
              <div className="reports-line-chart-values">
                <span>
                  {maxDailyValue}
                </span>

                <span>
                  {Math.round(
                    maxDailyValue / 2
                  )}
                </span>

                <span>0</span>
              </div>

              <div className="reports-line-chart-content">
                <svg
                  viewBox="0 0 700 210"
                  preserveAspectRatio="none"
                  aria-label="График заявок"
                >
                  <defs>
                    <linearGradient
                      id="reportsApplicationsGradient"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="currentColor"
                        stopOpacity="0.3"
                      />

                      <stop
                        offset="100%"
                        stopColor="currentColor"
                        stopOpacity="0"
                      />
                    </linearGradient>
                  </defs>

                  <line
                    x1="0"
                    y1="25"
                    x2="700"
                    y2="25"
                    className="reports-chart-grid-line"
                  />

                  <line
                    x1="0"
                    y1="105"
                    x2="700"
                    y2="105"
                    className="reports-chart-grid-line"
                  />

                  <line
                    x1="0"
                    y1="185"
                    x2="700"
                    y2="185"
                    className="reports-chart-grid-line"
                  />

                  <polygon
                    points={`0,190 ${chartPoints} 700,190`}
                    fill="url(#reportsApplicationsGradient)"
                  />

                  <polyline
                    points={chartPoints}
                    fill="none"
                    className="reports-chart-line"
                  />

                  {report.dailyStats.map(
                    (day, index) => {
                      const x =
                        report.dailyStats
                          .length === 1
                          ? 350
                          : (index /
                              (report
                                .dailyStats
                                .length -
                                1)) *
                            700;

                      const y =
                        190 -
                        (day.applications /
                          maxDailyValue) *
                          170;

                      return (
                        <g key={day.date}>
                          <circle
                            cx={x}
                            cy={y}
                            r="5"
                            className="reports-chart-point"
                          />

                          <text
                            x={x}
                            y={Math.max(
                              y - 14,
                              12
                            )}
                            textAnchor="middle"
                            className="reports-chart-value"
                          >
                            {
                              day.applications
                            }
                          </text>
                        </g>
                      );
                    }
                  )}
                </svg>

                <div className="reports-line-chart-labels">
                  {report.dailyStats.map(
                    (day) => (
                      <span key={day.date}>
                        {formatChartDate(
                          day.date
                        )}
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>
          ) : (
            <EmptyReportState
              title="Нет данных для графика"
              description="За выбранный период заявки не найдены"
            />
          )}
        </section>

        <section className="reports-products-card">
          <div className="reports-card-heading">
            <div>
              <h2>
                Продукты
              </h2>

              <p>
                Результаты по продуктам
              </p>
            </div>

            <WalletCards size={20} />
          </div>

          {report.productStats.length > 0 ? (
            <div className="reports-products-list">
              {report.productStats.map(
                (product) => {
                  const maximumApproved =
                    Math.max(
                      ...report.productStats.map(
                        (item) =>
                          item.approved
                      ),
                      1
                    );

                  const progress =
                    (product.approved /
                      maximumApproved) *
                    100;

                  return (
                    <article
                      key={product.key}
                    >
                      <div className="reports-product-line">
                        <div>
                          <strong>
                            {product.title}
                          </strong>

                          <span>
                            {
                              product.applications
                            }{" "}
                            заявок ·{" "}
                            {product.approved}{" "}
                            открытий
                          </span>
                        </div>

                        <strong>
                          {
                            product.conversion
                          }
                          %
                        </strong>
                      </div>

                      <div className="reports-product-progress">
                        <span
                          style={{
                            width: `${progress}%`,
                          }}
                        />
                      </div>

                      <div className="reports-product-extra">
                        <span>
                          Ставка:{" "}
                          {formatMoney(
                            product.rate
                          )}
                        </span>

                        <strong>
                          {formatMoney(
                            product.salary
                          )}
                        </strong>
                      </div>
                    </article>
                  );
                }
              )}
            </div>
          ) : (
            <EmptyReportState
              title="Нет продуктов"
              description="По выбранным фильтрам продукты не найдены"
            />
          )}

          <div className="reports-products-total">
            <span>
              Всего подтверждено
            </span>

            <strong>
              {formatNumber(
                report.metrics.approved
              )}{" "}
              открытий
            </strong>
          </div>
        </section>
      </div>

          <div className="reports-secondary-grid">
        <section className="reports-ranking-card">
          <div className="reports-card-heading">
            <div>
              <h2>Лучший менеджер</h2>

              <p>
                Лидер по успешным открытиям за выбранный период
              </p>
            </div>

            <Trophy size={20} />
          </div>

          {bestManager ? (
            <div className="reports-best-manager">
              <div className="reports-best-manager-avatar">
                {bestManager.avatar ? (
                  <img
                    src={bestManager.avatar}
                    alt={bestManager.name}
                  />
                ) : (
                  <span>
                    {getInitials(
                      bestManager.name
                    )}
                  </span>
                )}
              </div>

              <div className="reports-best-manager-info">
                <span>
                  Лучший результат
                </span>

                <strong>
                  {bestManager.name}
                </strong>

                {bestManager.email && (
                  <small>
                    {bestManager.email}
                  </small>
                )}
              </div>

              <div className="reports-best-manager-result">
                <strong>
                  {bestManager.approved}
                </strong>

                <span>
                  открытий
                </span>
              </div>
            </div>
          ) : (
            <EmptyReportState
              title="Нет данных"
              description="За выбранный период успешные открытия отсутствуют"
            />
          )}

          {bestManager && (
            <div className="reports-ranking-metrics">
              <div>
                <span>Заявок</span>

                <strong>
                  {bestManager.applications}
                </strong>
              </div>

              <div>
                <span>Конверсия</span>

                <strong>
                  {bestManager.conversion}%
                </strong>
              </div>

              <div>
                <span>Выплата</span>

                <strong>
                  {formatMoney(
                    bestManager.salary
                  )}
                </strong>
              </div>
            </div>
          )}
        </section>

        <section className="reports-status-card">
          <div className="reports-card-heading">
            <div>
              <h2>Воронка по статусам</h2>

              <p>
                Распределение заявок внутри выбранного периода
              </p>
            </div>

            <Filter size={20} />
          </div>

          {report.statusStats.length > 0 ? (
            <div className="reports-status-list">
              {report.statusStats.map(
                (status) => (
                  <div
                    className="reports-status-row"
                    key={status.key}
                  >
                    <div className="reports-status-row-header">
                      <span>
                        {status.title}
                      </span>

                      <strong>
                        {status.count}
                      </strong>
                    </div>

                    <div className="reports-status-progress">
                      <span
                        className={`reports-status-progress-bar reports-status-progress-bar--${status.key}`}
                        style={{
                          width: `${status.percent}%`,
                        }}
                      />
                    </div>

                    <small>
                      {status.percent}% от всех заявок
                    </small>
                  </div>
                )
              )}
            </div>
          ) : (
            <EmptyReportState
              title="Нет заявок"
              description="Статусы появятся после добавления заявок"
            />
          )}
        </section>

        <section className="reports-sources-card">
          <div className="reports-card-heading">
            <div>
              <h2>Источники заявок</h2>

              <p>
                Эффективность каналов привлечения
              </p>
            </div>

            <TrendingUp size={20} />
          </div>

          {report.sourceStats.length > 0 ? (
            <div className="reports-sources-list">
              {report.sourceStats.map(
                (source) => (
                  <article
                    key={source.key}
                    className="reports-source-row"
                  >
                    <div className="reports-source-main">
                      <div>
                        <strong>
                          {source.title}
                        </strong>

                        <span>
                          {source.applications} заявок
                        </span>
                      </div>

                      <strong>
                        {source.conversion}%
                      </strong>
                    </div>

                    <div className="reports-source-stats">
                      <span>
                        Успешных:{" "}
                        <strong>
                          {source.approved}
                        </strong>
                      </span>

                      <span>
                        Отказов:{" "}
                        <strong>
                          {source.rejected}
                        </strong>
                      </span>

                      <span>
                        Сумма:{" "}
                        <strong>
                          {formatMoney(
                            source.amount
                          )}
                        </strong>
                      </span>
                    </div>
                  </article>
                )
              )}
            </div>
          ) : (
            <EmptyReportState
              title="Нет источников"
              description="Источники появятся после добавления заявок"
            />
          )}
        </section>
      </div>

      <section className="reports-managers-card">
        <div className="reports-card-heading reports-card-heading--managers">
          <div>
            <h2>
              Эффективность менеджеров
            </h2>

            <p>
              Заявки, открытия, конверсия и расчётная выплата
            </p>
          </div>

          <Users size={20} />
        </div>

        <div className="reports-managers-toolbar">
          <label className="reports-manager-search">
            <Search size={17} />

            <input
              type="text"
              placeholder="Найти менеджера..."
              value={managerSearch}
              onChange={(event) =>
                setManagerSearch(
                  event.target.value
                )
              }
            />
          </label>

          <label className="reports-manager-sort">
            <span>
              Сортировка
            </span>

            <select
              value={managerSort}
              onChange={(event) =>
                setManagerSort(
                  event.target.value
                )
              }
            >
              <option value="approved">
                По открытиям
              </option>

              <option value="applications">
                По заявкам
              </option>

              <option value="conversion">
                По конверсии
              </option>

              <option value="salary">
                По выплате
              </option>

              <option value="name">
                По имени
              </option>
            </select>
          </label>
        </div>

        {preparedManagers.length > 0 ? (
          <div className="reports-table-wrapper">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Менеджер</th>
                  <th>Заявки</th>
                  <th>Открытия</th>
                  <th>В работе</th>
                  <th>Отказы</th>
                  <th>Конверсия</th>
                  <th>Сумма заявок</th>
                  <th>Выплата</th>
                </tr>
              </thead>

              <tbody>
                {preparedManagers.map(
                  (manager, index) => (
                    <tr key={manager.id}>
                      <td>
                        <div className="reports-manager-cell">
                          <div className="reports-manager-position">
                            {index + 1}
                          </div>

                          <div className="reports-manager-avatar">
                            {manager.avatar ? (
                              <img
                                src={manager.avatar}
                                alt={manager.name}
                              />
                            ) : (
                              <span>
                                {getInitials(
                                  manager.name
                                )}
                              </span>
                            )}
                          </div>

                          <div className="reports-manager-name">
                            <strong>
                              {manager.name}
                            </strong>

                            {manager.email && (
                              <span>
                                {manager.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        {manager.applications}
                      </td>

                      <td>
                        <span className="reports-table-success">
                          {manager.approved}
                        </span>
                      </td>

                      <td>
                        {manager.active}
                      </td>

                      <td>
                        <span className="reports-table-danger">
                          {manager.rejected}
                        </span>
                      </td>

                      <td>
                        <div className="reports-conversion-cell">
                          <strong>
                            {manager.conversion}%
                          </strong>

                          <div className="reports-conversion-progress">
                            <span
                              style={{
                                width: `${Math.min(
                                  manager.conversion,
                                  100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      <td>
                        {formatMoney(
                          manager.amount
                        )}
                      </td>

                      <td>
                        <strong className="reports-table-salary">
                          {formatMoney(
                            manager.salary
                          )}
                        </strong>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyReportState
            title="Менеджеры не найдены"
            description="Измени поисковый запрос или выбранные фильтры"
          />
        )}
      </section>

      <section className="reports-summary-card">
        <div className="reports-summary-heading">
          <div>
            <CircleDollarSign size={21} />

            <div>
              <h2>
                Финансовая сводка
              </h2>

              <p>
                Расчёт основан на успешных заявках со статусом approved
              </p>
            </div>
          </div>
        </div>

        <div className="reports-summary-grid">
          <div>
            <span>
              Общая сумма заявок
            </span>

            <strong>
              {formatMoney(
                report.metrics.totalAmount
              )}
            </strong>
          </div>

          <div>
            <span>
              Сумма успешных заявок
            </span>

            <strong>
              {formatMoney(
                report.metrics.approvedAmount
              )}
            </strong>
          </div>

          <div>
            <span>
              Средняя сумма заявки
            </span>

            <strong>
              {formatMoney(
                report.metrics
                  .averageApplicationAmount
              )}
            </strong>
          </div>

          <div>
            <span>
              Средняя успешная заявка
            </span>

            <strong>
              {formatMoney(
                report.metrics
                  .averageApprovedAmount
              )}
            </strong>
          </div>

          <div className="reports-summary-highlight">
            <span>
              Расчётный фонд выплат
            </span>

            <strong>
              {formatMoney(
                report.metrics.salaryFund
              )}
            </strong>
          </div>
        </div>
      </section>
    </main>
  );
}

function EmptyReportState({
  title,
  description,
}) {
  return (
    <div className="reports-empty-state">
      <FileText size={28} />

      <strong>
        {title}
      </strong>

      <span>
        {description}
      </span>
    </div>
  );
}

function getPeriodDateRange(period) {
  const now = new Date();

  if (period === "today") {
    const date = formatDateInput(now);

    return {
      dateFrom: date,
      dateTo: date,
    };
  }

  if (period === "week") {
    const dateFrom = new Date(now);

    dateFrom.setDate(
      dateFrom.getDate() - 6
    );

    return {
      dateFrom:
        formatDateInput(dateFrom),
      dateTo:
        formatDateInput(now),
    };
  }

  if (period === "previous-month") {
    const firstDay =
      new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1
      );

    const lastDay =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        0
      );

    return {
      dateFrom:
        formatDateInput(firstDay),
      dateTo:
        formatDateInput(lastDay),
    };
  }

  const firstDay =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

  return {
    dateFrom:
      formatDateInput(firstDay),
    dateTo:
      formatDateInput(now),
  };
}

function formatDateInput(date) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat(
    "ru-RU"
  ).format(Number(value || 0));
}

function formatMoney(value) {
  return new Intl.NumberFormat(
    "ru-RU",
    {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0,
    }
  ).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      dateStyle: "short",
      timeStyle: "short",
    }
  ).format(new Date(value));
}

function formatChartDate(value) {
  const date =
    new Date(
      `${value}T00:00:00`
    );

  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      day: "2-digit",
      month: "2-digit",
    }
  ).format(date);
}

function formatSource(source) {
  if (
    !source ||
    source === "manual"
  ) {
    return "Вручную";
  }

  return source;
}

function getStatusLabel(status) {
  const labels = {
    new: "Новая",
    in_progress: "В работе",
    waiting: "Ожидание",
    approved: "Успешная",
    rejected: "Отказ",
  };

  return labels[status] || status || "";
}

function getInitials(name) {
  const parts =
    String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  return parts
    .slice(0, 2)
    .map((part) =>
      part.charAt(0).toUpperCase()
    )
    .join("");
}

function getProductRateByName(
  productName
) {
  const normalized =
    String(productName || "")
      .trim()
      .toLowerCase()
      .replaceAll("ё", "е");

  if (
    normalized.includes("альфа") ||
    normalized.includes("alfa") ||
    normalized.includes("alpha")
  ) {
    return PRODUCT_RATES.alfa.rate;
  }

  if (
    normalized.includes("квитанц") ||
    normalized.includes("receipt")
  ) {
    return PRODUCT_RATES.receipt.rate;
  }

  if (
    normalized === "отп" ||
    normalized.includes("отп банк") ||
    normalized.includes("otp")
  ) {
    return PRODUCT_RATES.otp.rate;
  }

  if (
    normalized.includes("газпром") ||
    normalized.includes("газ прем") ||
    normalized.includes("газпрем") ||
    normalized.includes("premium")
  ) {
    return PRODUCT_RATES
      .gazpromPremium.rate;
  }

  return 0;
}

function buildChartPoints(
  dailyStats,
  maxDailyValue
) {
  if (
    !Array.isArray(dailyStats) ||
    dailyStats.length === 0
  ) {
    return "";
  }

  return dailyStats
    .map((day, index) => {
      const x =
        dailyStats.length === 1
          ? 350
          : (index /
              (dailyStats.length - 1)) *
            700;

      const y =
        190 -
        (day.applications /
          maxDailyValue) *
          170;

      return `${x},${y}`;
    })
    .join(" ");
}

function escapeCsvValue(value) {
  const text =
    String(value ?? "");

  return `"${text.replaceAll(
    '"',
    '""'
  )}"`;
}

function downloadCsv(
  rows,
  filename
) {
  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {
    return;
  }

  const headers =
    Object.keys(rows[0]);

  const csvRows = [
    headers
      .map(escapeCsvValue)
      .join(";"),

    ...rows.map((row) =>
      headers
        .map((header) =>
          escapeCsvValue(
            row[header]
          )
        )
        .join(";")
    ),
  ];

  const csvContent =
    `\uFEFF${csvRows.join("\n")}`;

  const blob =
    new Blob(
      [csvContent],
      {
        type: "text/csv;charset=utf-8;",
      }
    );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}