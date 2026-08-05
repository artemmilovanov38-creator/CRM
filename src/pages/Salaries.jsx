import {
  Fragment,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Banknote,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Download,
  Package,
  RefreshCw,
  Search,
  TrendingUp,
  UserRound,
  WalletCards,
} from "lucide-react";

import {
  applicationService,
} from "../services/applicationService";

import {
  productService,
} from "../services/productService";

import {
  profileService,
} from "../services/profileService";

export default function Salaries() {
  const defaultPeriod =
    getCurrentMonthPeriod();

  const [applications, setApplications] =
    useState([]);

  const [managers, setManagers] =
    useState([]);

  const [products, setProducts] =
    useState([]);

  const [dateFrom, setDateFrom] =
    useState(defaultPeriod.dateFrom);

  const [dateTo, setDateTo] =
    useState(defaultPeriod.dateTo);

  const [searchValue, setSearchValue] =
    useState("");

  const [
    selectedProductId,
    setSelectedProductId,
  ] = useState("all");

  const [sortValue, setSortValue] =
    useState("salary");

  const [
    expandedManagerId,
    setExpandedManagerId,
  ] = useState(null);

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    loadSalaryData();
  }, []);

  async function loadSalaryData() {
    if (
      dateFrom &&
      dateTo &&
      dateFrom > dateTo
    ) {
      setError(
        "Начальная дата не может быть позже конечной"
      );

      return;
    }

    setIsLoading(true);
    setError("");

    const [
      applicationsResult,
      managersResult,
      productsResult,
    ] = await Promise.all([
      applicationService
        .getApprovedApplicationsByPeriod(
          dateFrom,
          dateTo
        ),

      profileService.getManagers(),

      productService.getProducts(),
    ]);

    if (applicationsResult.error) {
      console.error(
        "Ошибка загрузки успешных открытий:",
        applicationsResult.error
      );

      setError(
        applicationsResult.error.message ||
          "Не удалось загрузить успешные открытия для расчёта зарплаты"
      );
    }

    if (managersResult.error) {
      console.error(
        "Ошибка загрузки менеджеров:",
        managersResult.error
      );

      setError(
        managersResult.error.message ||
          "Не удалось загрузить список менеджеров"
      );
    }

    if (productsResult.error) {
      console.error(
        "Ошибка загрузки продуктов:",
        productsResult.error
      );

      setError(
        productsResult.error.message ||
          "Не удалось загрузить продукты и ставки"
      );
    }

    setApplications(
      applicationsResult.data || []
    );

    setManagers(
      managersResult.data || []
    );

    setProducts(
      productsResult.data || []
    );

    setIsLoading(false);
  }

  const productMap = useMemo(() => {
    return new Map(
      products.map((product) => [
        product.id,
        product,
      ])
    );
  }, [products]);

  const salaryData = useMemo(() => {
    return managers.map((manager) => {
      const managerApplications =
        applications.filter(
          (application) =>
            application.assigned_manager_id ===
            manager.id
        );

      const productStats = {};

      products.forEach((product) => {
        productStats[product.id] = {
          productId: product.id,
          name: product.name,

          currentRate: toSafeNumber(
            product.opening_price
          ),

          openings: 0,
          salary: 0,
          rateGroups: {},
        };
      });

      let unpricedOpenings = 0;

      managerApplications.forEach(
        (application) => {
          const productId =
            application.product_id ||
            application.product_data?.id ||
            null;

          const product = productId
            ? productMap.get(productId)
            : null;

          if (
            !product ||
            !productStats[product.id]
          ) {
            unpricedOpenings += 1;
            return;
          }

          const hasSnapshot =
            application
              .opening_price_snapshot !==
              null &&
            application
              .opening_price_snapshot !==
              undefined;

          const rate = hasSnapshot
            ? toSafeNumber(
                application
                  .opening_price_snapshot
              )
            : toSafeNumber(
                product.opening_price
              );

          /*
           * Если у старой успешной заявки
           * снимок ставки отсутствует,
           * временно используем текущую
           * ставку продукта и показываем
           * предупреждение.
           */
          if (!hasSnapshot) {
            unpricedOpenings += 1;
          }

          const stats =
            productStats[product.id];

          stats.openings += 1;
          stats.salary += rate;

          const rateKey =
            String(rate);

          if (!stats.rateGroups[rateKey]) {
            stats.rateGroups[rateKey] = {
              rate,
              openings: 0,
              salary: 0,
            };
          }

          stats.rateGroups[
            rateKey
          ].openings += 1;

          stats.rateGroups[
            rateKey
          ].salary += rate;
        }
      );

      const productItems =
        Object.values(productStats);

      const totalOpenings =
        productItems.reduce(
          (sum, product) =>
            sum + product.openings,
          0
        );

      const salary =
        productItems.reduce(
          (sum, product) =>
            sum + product.salary,
          0
        );

      return {
        id: manager.id,

        name:
          manager.full_name ||
          manager.email ||
          "Без имени",

        email: manager.email || "",

        avatar: getInitials(
          manager.full_name ||
            manager.email
        ),

        status:
          manager.status || "active",

        products: productStats,

        totalOpenings,
        salary,
        unpricedOpenings,
      };
    });
  }, [
    managers,
    products,
    productMap,
    applications,
  ]);

  const preparedManagers = useMemo(() => {
    const search = searchValue
      .trim()
      .toLowerCase();

    const filtered = salaryData.filter(
      (manager) => {
        const matchesSearch =
          !search ||
          manager.name
            .toLowerCase()
            .includes(search) ||
          manager.email
            .toLowerCase()
            .includes(search);

        const matchesProduct =
          selectedProductId === "all" ||
          (
            manager.products[
              selectedProductId
            ]?.openings || 0
          ) > 0;

        return (
          matchesSearch &&
          matchesProduct
        );
      }
    );

    return [...filtered].sort(
      (first, second) => {
        if (sortValue === "name") {
          return first.name.localeCompare(
            second.name,
            "ru"
          );
        }

        if (sortValue === "openings") {
          return (
            second.totalOpenings -
            first.totalOpenings
          );
        }

        return (
          second.salary -
          first.salary
        );
      }
    );
  }, [
    salaryData,
    searchValue,
    selectedProductId,
    sortValue,
  ]);

  const totals = useMemo(() => {
    const productTotals = {};

    products.forEach((product) => {
      productTotals[product.id] = {
        openings: 0,
        salary: 0,
      };
    });

    return salaryData.reduce(
      (total, manager) => {
        total.openings +=
          manager.totalOpenings;

        total.salary +=
          manager.salary;

        total.unpricedOpenings +=
          manager.unpricedOpenings;

        products.forEach((product) => {
          const managerProduct =
            manager.products[
              product.id
            ];

          if (!managerProduct) {
            return;
          }

          total.products[
            product.id
          ].openings +=
            managerProduct.openings;

          total.products[
            product.id
          ].salary +=
            managerProduct.salary;
        });

        return total;
      },
      {
        openings: 0,
        salary: 0,
        unpricedOpenings: 0,
        products: productTotals,
      }
    );
  }, [salaryData, products]);

  const managersWithOpenings =
    salaryData.filter(
      (manager) =>
        manager.totalOpenings > 0
    ).length;

  const averageSalary =
    managersWithOpenings > 0
      ? Math.round(
          totals.salary /
            managersWithOpenings
        )
      : 0;

  const bestManager = useMemo(() => {
    return [...salaryData]
      .filter(
        (manager) =>
          manager.totalOpenings > 0
      )
      .sort(
        (first, second) =>
          second.salary -
          first.salary
      )[0] || null;
  }, [salaryData]);

  const unassignedSuccessful =
    applications.filter(
      (application) =>
        !application.assigned_manager_id
    ).length;

  function applyCurrentMonth() {
    const period =
      getCurrentMonthPeriod();

    setDateFrom(period.dateFrom);
    setDateTo(period.dateTo);
  }

  function applyFirstHalf() {
    const now = new Date();

    setDateFrom(
      formatInputDate(
        new Date(
          now.getFullYear(),
          now.getMonth(),
          1
        )
      )
    );

    setDateTo(
      formatInputDate(
        new Date(
          now.getFullYear(),
          now.getMonth(),
          15
        )
      )
    );
  }

  function applySecondHalf() {
    const now = new Date();

    setDateFrom(
      formatInputDate(
        new Date(
          now.getFullYear(),
          now.getMonth(),
          16
        )
      )
    );

    setDateTo(
      formatInputDate(
        new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0
        )
      )
    );
  }

  function toggleManager(managerId) {
    setExpandedManagerId(
      (currentId) =>
        currentId === managerId
          ? null
          : managerId
    );
  }

  function downloadSalaryReport() {
    const rows = [];

    preparedManagers.forEach(
      (manager) => {
        const usedProducts =
          products.filter(
            (product) =>
              (
                manager.products[
                  product.id
                ]?.openings || 0
              ) > 0
          );

        if (usedProducts.length === 0) {
          rows.push({
            Менеджер: manager.name,
            Email: manager.email,
            Продукт: "Нет открытий",
            Открытий: 0,
            Ставка: 0,
            Сумма: 0,
            "Итого менеджеру":
              manager.salary,
          });

          return;
        }

        usedProducts.forEach(
          (product) => {
            const productStats =
              manager.products[
                product.id
              ];

            const rateGroups =
              Object.values(
                productStats.rateGroups
              );

            rateGroups.forEach(
              (rateGroup) => {
                rows.push({
                  Менеджер:
                    manager.name,

                  Email:
                    manager.email,

                  Продукт:
                    product.name,

                  Открытий:
                    rateGroup.openings,

                  Ставка:
                    rateGroup.rate,

                  Сумма:
                    rateGroup.salary,

                  "Итого менеджеру":
                    manager.salary,
                });
              }
            );
          }
        );
      }
    );

    const headers = [
      "Менеджер",
      "Email",
      "Продукт",
      "Открытий",
      "Ставка",
      "Сумма",
      "Итого менеджеру",
    ];

    const csv = [
      headers.join(";"),

      ...rows.map((row) =>
        headers
          .map((header) =>
            escapeCsvValue(
              row[header]
            )
          )
          .join(";")
      ),
    ].join("\n");

    const blob = new Blob(
      [`\uFEFF${csv}`],
      {
        type:
          "text/csv;charset=utf-8;",
      }
    );

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;

    link.download =
      `salary-${dateFrom || "start"}-${dateTo || "end"}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <main className="page">
        <div className="users-state">
          <div className="users-state__spinner" />

          <strong>
            Рассчитываем зарплаты...
          </strong>

          <span>
            Загружаем успешные открытия
            за выбранный период
          </span>
        </div>
      </main>
    );
  }

  return (
    <main className="page salaries-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Расчёт зарплаты
          </h1>

          <p className="page-description">
            Зарплата рассчитывается по
            дате успешного открытия и
            ставке, зафиксированной в момент
            перевода заявки в статус
            "Успешно открыта".
          </p>
        </div>

        <div className="page-actions">
          <button
            className="secondary-button button-with-icon"
            type="button"
            onClick={loadSalaryData}
            disabled={isLoading}
          >
            <RefreshCw size={17} />
            Обновить
          </button>

          <button
            className="primary-button button-with-icon"
            type="button"
            onClick={
              downloadSalaryReport
            }
            disabled={
              preparedManagers.length ===
              0
            }
          >
            <Download size={17} />
            Скачать отчёт
          </button>
        </div>
      </div>

      {error && (
        <div className="users-alert users-alert--error">
          {error}
        </div>
      )}

      {unassignedSuccessful > 0 && (
        <div className="inline-notice">
          Успешных открытий без
          назначенного менеджера:{" "}
          <strong>
            {unassignedSuccessful}
          </strong>
        </div>
      )}

      {totals.unpricedOpenings > 0 && (
        <div className="inline-notice">
          Успешных заявок без сохранённого
          снимка ставки:{" "}
          <strong>
            {totals.unpricedOpenings}
          </strong>
          . Для них временно используется
          текущая ставка продукта.
        </div>
      )}

      <section className="salary-summary-grid">
        <SalarySummaryCard
          icon={CircleDollarSign}
          title="Общий фонд выплат"
          value={formatMoney(
            totals.salary
          )}
          description="За выбранный период"
        />

        <SalarySummaryCard
          icon={Package}
          iconClass="salary-summary-icon--purple"
          title="Успешных открытий"
          value={formatNumber(
            totals.openings
          )}
          description="По всем продуктам"
        />

        <SalarySummaryCard
          icon={WalletCards}
          iconClass="salary-summary-icon--orange"
          title="Средняя зарплата"
          value={formatMoney(
            averageSalary
          )}
          description="Среди менеджеров с открытиями"
        />

        <SalarySummaryCard
          icon={TrendingUp}
          iconClass="salary-summary-icon--green"
          title="Лучший менеджер"
          value={
            bestManager?.name ||
            "Нет данных"
          }
          description={
            bestManager
              ? formatMoney(
                  bestManager.salary
                )
              : "0 ₽"
          }
        />
      </section>

      <section className="salary-rates-card">
        <div className="salary-section-heading">
          <div>
            <h2>
              Текущие ставки продуктов
            </h2>

            <p>
              Они применяются только к
              будущим успешным открытиям.
              Старые начисления используют
              сохранённые исторические
              ставки.
            </p>
          </div>

          <Banknote size={20} />
        </div>

        <div className="salary-rates-grid">
          {products.map((product) => (
            <article key={product.id}>
              <div>
                <span>
                  {product.name}
                </span>

                <strong>
                  {formatMoney(
                    product.opening_price
                  )}
                </strong>
              </div>

              <small>
                Открытий за период:{" "}
                {
                  totals.products[
                    product.id
                  ]?.openings || 0
                }
              </small>
            </article>
          ))}
        </div>
      </section>

      <section className="salary-toolbar">
        <div className="search-field">
          <Search size={18} />

          <input
            type="search"
            placeholder="Поиск по менеджеру"
            value={searchValue}
            onChange={(event) =>
              setSearchValue(
                event.target.value
              )
            }
          />
        </div>

        <label className="toolbar-filter salary-period-filter">
          <CalendarDays size={15} />

          <input
            type="date"
            value={dateFrom}
            onChange={(event) =>
              setDateFrom(
                event.target.value
              )
            }
          />
        </label>

        <label className="toolbar-filter salary-period-filter">
          <CalendarDays size={15} />

          <input
            type="date"
            value={dateTo}
            onChange={(event) =>
              setDateTo(
                event.target.value
              )
            }
          />
        </label>

        <div className="toolbar-filter salary-product-filter">
          <select
            value={selectedProductId}
            onChange={(event) =>
              setSelectedProductId(
                event.target.value
              )
            }
          >
            <option value="all">
              Все продукты
            </option>

            {products.map((product) => (
              <option
                key={product.id}
                value={product.id}
              >
                {product.name}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbar-filter">
          <select
            value={sortValue}
            onChange={(event) =>
              setSortValue(
                event.target.value
              )
            }
          >
            <option value="salary">
              По зарплате
            </option>

            <option value="openings">
              По открытиям
            </option>

            <option value="name">
              По имени
            </option>
          </select>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={loadSalaryData}
          disabled={isLoading}
        >
          {isLoading
            ? "Считаем..."
            : "Рассчитать"}
        </button>
      </section>

      <div className="salary-result-line">
        <span>
          Быстрый период:
        </span>

        <button
          type="button"
          onClick={applyFirstHalf}
        >
          1–15
        </button>

        <button
          type="button"
          onClick={applySecondHalf}
        >
          16–конец
        </button>

        <button
          type="button"
          onClick={applyCurrentMonth}
        >
          Текущий месяц
        </button>

        <span>
          Период успешных открытий:{" "}
          <strong>
            {formatPeriodTitle(
              dateFrom,
              dateTo
            )}
          </strong>
        </span>
      </div>

      <section className="salary-table-card">
        <div className="salary-table-wrapper">
          <table className="salary-table">
            <thead>
              <tr>
                <th>Менеджер</th>

                <th>
                  Успешных открытий
                </th>

                <th>Зарплата</th>

                <th />
              </tr>
            </thead>

            <tbody>
              {preparedManagers.map(
                (manager) => {
                  const isExpanded =
                    expandedManagerId ===
                    manager.id;

                  return (
                    <Fragment
                      key={manager.id}
                    >
                      <tr
                        className={
                          isExpanded
                            ? "salary-table-row salary-table-row--expanded"
                            : "salary-table-row"
                        }
                      >
                        <td>
                          <div className="salary-manager-cell">
                            <div className="salary-manager-avatar">
                              {manager.avatar}
                            </div>

                            <div>
                              <strong>
                                {manager.name}
                              </strong>

                              <span>
                                {manager.email}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <strong className="salary-openings-total">
                            {
                              manager.totalOpenings
                            }
                          </strong>
                        </td>

                        <td>
                          <strong className="salary-money-total">
                            {formatMoney(
                              manager.salary
                            )}
                          </strong>
                        </td>

                        <td>
                          <button
                            className={
                              isExpanded
                                ? "salary-expand-button salary-expand-button--active"
                                : "salary-expand-button"
                            }
                            type="button"
                            onClick={() =>
                              toggleManager(
                                manager.id
                              )
                            }
                            aria-label={
                              isExpanded
                                ? "Скрыть детализацию"
                                : "Показать детализацию"
                            }
                          >
                            <ChevronDown
                              size={17}
                            />
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="salary-details-row">
                          <td colSpan="4">
                            <div className="salary-details-content">
                              <div className="salary-details-header">
                                <div>
                                  <UserRound
                                    size={18}
                                  />

                                  <div>
                                    <strong>
                                      Расчёт:{" "}
                                      {manager.name}
                                    </strong>

                                    <span>
                                      {formatPeriodTitle(
                                        dateFrom,
                                        dateTo
                                      )}
                                    </span>
                                  </div>
                                </div>

                                <strong>
                                  {formatMoney(
                                    manager.salary
                                  )}
                                </strong>
                              </div>

                              <div className="salary-details-products">
                                {products.map(
                                  (product) => {
                                    const stats =
                                      manager.products[
                                        product.id
                                      ];

                                    const openings =
                                      stats?.openings ||
                                      0;

                                    const rateGroups =
                                      Object.values(
                                        stats
                                          ?.rateGroups ||
                                          {}
                                      );

                                    return (
                                      <article
                                        key={
                                          product.id
                                        }
                                      >
                                        <div>
                                          <span>
                                            {
                                              product.name
                                            }
                                          </span>

                                          <strong>
                                            {openings}{" "}
                                            {getOpeningsWord(
                                              openings
                                            )}
                                          </strong>

                                          {rateGroups.length >
                                            0 && (
                                            <small>
                                              {rateGroups
                                                .map(
                                                  (
                                                    group
                                                  ) =>
                                                    `${group.openings} × ${formatMoney(
                                                      group.rate
                                                    )}`
                                                )
                                                .join(
                                                  " · "
                                                )}
                                            </small>
                                          )}
                                        </div>

                                        <strong>
                                          {formatMoney(
                                            stats?.salary ||
                                              0
                                          )}
                                        </strong>
                                      </article>
                                    );
                                  }
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                }
              )}
            </tbody>
          </table>
        </div>

        {preparedManagers.length ===
          0 && (
          <div className="salary-empty-state">
            <Search size={28} />

            <h2>
              Данных для расчёта нет
            </h2>

            <p>
              Проверьте период успешных
              открытий, назначение
              менеджеров, продукты и
              статусы заявок.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

function SalarySummaryCard({
  icon: Icon,
  iconClass = "",
  title,
  value,
  description,
}) {
  return (
    <article className="salary-summary-card">
      <div
        className={`salary-summary-icon ${iconClass}`}
      >
        <Icon size={20} />
      </div>

      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{description}</small>
      </div>
    </article>
  );
}

function getCurrentMonthPeriod() {
  const now = new Date();

  return {
    dateFrom: formatInputDate(
      new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      )
    ),

    dateTo: formatInputDate(
      new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0
      )
    ),
  };
}

function formatPeriodTitle(
  dateFrom,
  dateTo
) {
  if (!dateFrom && !dateTo) {
    return "За всё время";
  }

  return `${formatShortDate(
    dateFrom
  )} — ${formatShortDate(dateTo)}`;
}

function formatShortDate(value) {
  if (!value) {
    return "…";
  }

  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }
  ).format(
    new Date(`${value}T00:00:00`)
  );
}

function formatInputDate(date) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getInitials(value) {
  if (!value) {
    return "М";
  }

  return String(value)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getOpeningsWord(value) {
  const number = Math.abs(
    Number(value || 0)
  );

  const lastTwoDigits =
    number % 100;

  const lastDigit =
    number % 10;

  if (
    lastTwoDigits >= 11 &&
    lastTwoDigits <= 19
  ) {
    return "открытий";
  }

  if (lastDigit === 1) {
    return "открытие";
  }

  if (
    lastDigit >= 2 &&
    lastDigit <= 4
  ) {
    return "открытия";
  }

  return "открытий";
}

function toSafeNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
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
    toSafeNumber(value)
  );
}

function formatNumber(value) {
  return new Intl.NumberFormat(
    "ru-RU"
  ).format(
    toSafeNumber(value)
  );
}

function escapeCsvValue(value) {
  const stringValue =
    String(value ?? "");

  return `"${stringValue.replace(
    /"/g,
    '""'
  )}"`;
}