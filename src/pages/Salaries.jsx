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
  Filter,
  ReceiptText,
  RefreshCw,
  Search,
  TrendingUp,
  UserRound,
  WalletCards,
} from "lucide-react";

import { applicationService } from "../services/applicationService";
import { profileService } from "../services/profileService";

const productRates = {
  alfa: {
    title: "Альфа",
    rate: 1200,
  },

  receipt: {
    title: "Квитанция",
    rate: 500,
  },

  otp: {
    title: "ОТП",
    rate: 300,
  },

  gazpromPremium: {
    title: "Газпром премиум",
    rate: 400,
  },
};

const periodOptions = [
  {
    id: "current-month",
    title: "Текущий месяц",
  },
  {
    id: "first-half",
    title: "1–15 число",
  },
  {
    id: "second-half",
    title: "16–конец месяца",
  },
  {
    id: "all-time",
    title: "За всё время",
  },
];

export default function Salaries() {
  const [applications, setApplications] = useState([]);
  const [managers, setManagers] = useState([]);

  const [searchValue, setSearchValue] = useState("");
  const [selectedPeriod, setSelectedPeriod] =
    useState("current-month");

  const [selectedProduct, setSelectedProduct] =
    useState("all");

  const [sortValue, setSortValue] =
    useState("salary");

  const [expandedManagerId, setExpandedManagerId] =
    useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const selectedDates = useMemo(
    () => getPeriodDates(selectedPeriod),
    [selectedPeriod]
  );

  useEffect(() => {
    loadSalaryData();
  }, [selectedPeriod]);

  async function loadSalaryData() {
    setIsLoading(true);
    setError("");

    const [applicationsResult, managersResult] =
      await Promise.all([
        applicationService.getApplicationsByPeriod(
          selectedDates.dateFrom,
          selectedDates.dateTo
        ),

        profileService.getManagers(),
      ]);

    if (applicationsResult.error) {
      console.error(
        "Ошибка загрузки заявок:",
        applicationsResult.error
      );

      setError(
        "Не удалось загрузить заявки для расчёта зарплаты."
      );
    }

    if (managersResult.error) {
      console.error(
        "Ошибка загрузки менеджеров:",
        managersResult.error
      );

      setError(
        "Не удалось загрузить список менеджеров."
      );
    }

    setApplications(applicationsResult.data || []);
    setManagers(managersResult.data || []);
    setIsLoading(false);
  }

  const successfulApplications = useMemo(() => {
    return applications.filter(
      (application) =>
        application.status === "approved"
    );
  }, [applications]);

  const salaryData = useMemo(() => {
    return managers.map((manager) => {
      const managerApplications =
        successfulApplications.filter(
          (application) =>
            application.assigned_manager_id ===
            manager.id
        );

      const products = {
        alfa: 0,
        receipt: 0,
        otp: 0,
        gazpromPremium: 0,
      };

      managerApplications.forEach((application) => {
        const productKey = getProductKey(
          application.product
        );

        if (productKey) {
          products[productKey] += 1;
        }
      });

      return {
        id: manager.id,

        name:
          manager.full_name ||
          manager.email ||
          "Без имени",

        email: manager.email || "",

        avatar: getInitials(
          manager.full_name || manager.email
        ),

        department: "Отдел продаж",

        status: manager.status || "active",

        products,
      };
    });
  }, [managers, successfulApplications]);

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
          selectedProduct === "all" ||
          manager.products[selectedProduct] > 0;

        return matchesSearch && matchesProduct;
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
            calculateManagerOpenings(second) -
            calculateManagerOpenings(first)
          );
        }

        if (sortValue === "alfa") {
          return (
            second.products.alfa -
            first.products.alfa
          );
        }

        return (
          calculateManagerSalary(second) -
          calculateManagerSalary(first)
        );
      }
    );
  }, [
    salaryData,
    searchValue,
    selectedProduct,
    sortValue,
  ]);

  const totals = useMemo(() => {
    return salaryData.reduce(
      (result, manager) => {
        result.managers += 1;

        result.openings +=
          calculateManagerOpenings(manager);

        result.salary +=
          calculateManagerSalary(manager);

        Object.keys(productRates).forEach(
          (productKey) => {
            result.products[productKey] +=
              manager.products[productKey] || 0;
          }
        );

        return result;
      },
      {
        managers: 0,
        openings: 0,
        salary: 0,

        products: {
          alfa: 0,
          receipt: 0,
          otp: 0,
          gazpromPremium: 0,
        },
      }
    );
  }, [salaryData]);

  const averageSalary =
    totals.managers > 0
      ? Math.round(
          totals.salary / totals.managers
        )
      : 0;

  const bestManager = useMemo(() => {
    if (salaryData.length === 0) {
      return null;
    }

    return [...salaryData].sort(
      (first, second) =>
        calculateManagerSalary(second) -
        calculateManagerSalary(first)
    )[0];
  }, [salaryData]);

  const unassignedSuccessful =
    successfulApplications.filter(
      (application) =>
        !application.assigned_manager_id
    ).length;

  function toggleManager(managerId) {
    setExpandedManagerId((currentId) =>
      currentId === managerId
        ? null
        : managerId
    );
  }

  function downloadSalaryReport() {
    const rows = preparedManagers.map(
      (manager) => ({
        Менеджер: manager.name,
        Email: manager.email,
        Альфа: manager.products.alfa,
        Квитанция: manager.products.receipt,
        ОТП: manager.products.otp,
        "Газпром премиум":
          manager.products.gazpromPremium,
        "Всего открытий":
          calculateManagerOpenings(manager),
        Зарплата:
          calculateManagerSalary(manager),
      })
    );

    const headers = Object.keys(rows[0] || {
      Менеджер: "",
      Email: "",
      Альфа: "",
      Квитанция: "",
      ОТП: "",
      "Газпром премиум": "",
      "Всего открытий": "",
      Зарплата: "",
    });

    const csv = [
      headers.join(";"),

      ...rows.map((row) =>
        headers
          .map((header) =>
            escapeCsvValue(row[header])
          )
          .join(";")
      ),
    ].join("\n");

    const blob = new Blob(
      [`\uFEFF${csv}`],
      {
        type: "text/csv;charset=utf-8;",
      }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `salary-${selectedPeriod}.csv`;

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
            Загружаем успешные заявки
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
            Зарплаты
          </h1>

          <p className="page-description">
            Автоматический расчёт выплат по
            подтверждённым заявкам
          </p>
        </div>

        <div className="page-actions">
          <button
            className="secondary-button button-with-icon"
            type="button"
            onClick={loadSalaryData}
          >
            <RefreshCw size={17} />
            Обновить
          </button>

          <button
            className="primary-button button-with-icon"
            type="button"
            onClick={downloadSalaryReport}
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
          <span>
            Успешных заявок без назначенного
            менеджера:{" "}
            <strong>
              {unassignedSuccessful}
            </strong>
          </span>
        </div>
      )}

      <section className="salary-summary-grid">
        <SalarySummaryCard
          icon={CircleDollarSign}
          title="Общий фонд выплат"
          value={formatMoney(totals.salary)}
          description="За выбранный период"
        />

        <SalarySummaryCard
          icon={ReceiptText}
          iconClass="salary-summary-icon--purple"
          title="Всего открытий"
          value={formatNumber(totals.openings)}
          description="По всем продуктам"
        />

        <SalarySummaryCard
          icon={WalletCards}
          iconClass="salary-summary-icon--orange"
          title="Средняя зарплата"
          value={formatMoney(averageSalary)}
          description="На одного менеджера"
        />

        <SalarySummaryCard
          icon={TrendingUp}
          iconClass="salary-summary-icon--green"
          title="Лучший менеджер"
          value={
            bestManager?.name || "Нет данных"
          }
          description={
            bestManager
              ? formatMoney(
                  calculateManagerSalary(
                    bestManager
                  )
                )
              : "0 ₽"
          }
        />
      </section>

      <section className="salary-rates-card">
        <div className="salary-section-heading">
          <div>
            <h2>
              Ставки по продуктам
            </h2>

            <p>
              Стоимость одного подтверждённого
              открытия
            </p>
          </div>

          <Banknote size={20} />
        </div>

        <div className="salary-rates-grid">
          {Object.entries(productRates).map(
            ([productKey, product]) => (
              <article key={productKey}>
                <div>
                  <span>
                    {product.title}
                  </span>

                  <strong>
                    {formatMoney(product.rate)}
                  </strong>
                </div>

                <small>
                  Открытий:{" "}
                  {totals.products[productKey]}
                </small>
              </article>
            )
          )}
        </div>
      </section>

      <section className="salary-toolbar">
        <div className="search-field">
          <Search size={18} />

          <input
            type="text"
            placeholder="Поиск по менеджеру"
            value={searchValue}
            onChange={(event) =>
              setSearchValue(
                event.target.value
              )
            }
          />
        </div>

        <div className="toolbar-filter salary-period-filter">
          <CalendarDays size={15} />

          <select
            value={selectedPeriod}
            onChange={(event) =>
              setSelectedPeriod(
                event.target.value
              )
            }
          >
            {periodOptions.map((period) => (
              <option
                value={period.id}
                key={period.id}
              >
                {period.title}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbar-filter salary-product-filter">
          <Filter size={15} />

          <select
            value={selectedProduct}
            onChange={(event) =>
              setSelectedProduct(
                event.target.value
              )
            }
          >
            <option value="all">
              Все продукты
            </option>

            {Object.entries(productRates).map(
              ([key, product]) => (
                <option
                  value={key}
                  key={key}
                >
                  {product.title}
                </option>
              )
            )}
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

            <option value="alfa">
              По Альфе
            </option>

            <option value="name">
              По имени
            </option>
          </select>
        </div>
      </section>

      <div className="salary-result-line">
        Период:{" "}
        <strong>
          {selectedDates.title}
        </strong>

        {" · "}

        Менеджеров:{" "}
        <strong>
          {preparedManagers.length}
        </strong>
      </div>

      <section className="salary-table-card">
        <div className="salary-table-wrapper">
          <table className="salary-table">
            <thead>
              <tr>
                <th>Менеджер</th>
                <th>Альфа</th>
                <th>Квитанция</th>
                <th>ОТП</th>
                <th>Газпром премиум</th>
                <th>Всего</th>
                <th>Зарплата</th>
                <th />
              </tr>
            </thead>

            <tbody>
              {preparedManagers.map(
                (manager) => {
                  const salary =
                    calculateManagerSalary(
                      manager
                    );

                  const openings =
                    calculateManagerOpenings(
                      manager
                    );

                  const isExpanded =
                    expandedManagerId ===
                    manager.id;

                  return (
                    <Fragment key={manager.id}>
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
                                {manager.email ||
                                  manager.department}
                              </span>
                            </div>
                          </div>
                        </td>

                        {Object.keys(
                          productRates
                        ).map((productKey) => (
                          <td key={productKey}>
                            <div className="salary-product-cell">
                              <strong>
                                {
                                  manager.products[
                                    productKey
                                  ]
                                }
                              </strong>

                              <span>
                                {formatMoney(
                                  manager.products[
                                    productKey
                                  ] *
                                    productRates[
                                      productKey
                                    ].rate
                                )}
                              </span>
                            </div>
                          </td>
                        ))}

                        <td>
                          <strong className="salary-openings-total">
                            {openings}
                          </strong>
                        </td>

                        <td>
                          <strong className="salary-money-total">
                            {formatMoney(salary)}
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
                          >
                            <ChevronDown
                              size={17}
                            />
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="salary-details-row">
                          <td colSpan="8">
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
                                      {
                                        selectedDates.title
                                      }
                                    </span>
                                  </div>
                                </div>

                                <strong>
                                  {formatMoney(
                                    salary
                                  )}
                                </strong>
                              </div>

                              <div className="salary-details-products">
                                {Object.entries(
                                  productRates
                                ).map(
                                  ([
                                    productKey,
                                    product,
                                  ]) => {
                                    const count =
                                      manager.products[
                                        productKey
                                      ] || 0;

                                    return (
                                      <article
                                        key={
                                          productKey
                                        }
                                      >
                                        <div>
                                          <span>
                                            {
                                              product.title
                                            }
                                          </span>

                                          <strong>
                                            {count} ×{" "}
                                            {formatMoney(
                                              product.rate
                                            )}
                                          </strong>
                                        </div>

                                        <strong>
                                          {formatMoney(
                                            count *
                                              product.rate
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

        {preparedManagers.length === 0 && (
          <div className="salary-empty-state">
            <Search size={28} />
            <h2>
              Данных для расчёта нет
            </h2>

            <p>
              Проверь период, статусы заявок и
              назначение менеджеров.
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

function calculateManagerSalary(manager) {
  return Object.entries(
    manager.products
  ).reduce(
    (sum, [productKey, count]) =>
      sum +
      count *
        (productRates[productKey]?.rate ||
          0),
    0
  );
}

function calculateManagerOpenings(manager) {
  return Object.values(
    manager.products
  ).reduce(
    (sum, count) => sum + count,
    0
  );
}

function getProductKey(productValue) {
  const product = String(
    productValue || ""
  )
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е");

  if (!product) {
    return null;
  }

  if (
    product.includes("альфа") ||
    product === "alfa"
  ) {
    return "alfa";
  }

  if (
    product.includes("квитанц") ||
    product.includes("receipt")
  ) {
    return "receipt";
  }

  if (
    product.includes("отп") ||
    product === "otp"
  ) {
    return "otp";
  }

  if (
    product.includes("газпром") ||
    product.includes("газ прем") ||
    product.includes("газпрем") ||
    product === "газ"
  ) {
    return "gazpromPremium";
  }

  return null;
}

function getPeriodDates(periodId) {
  const now = new Date();

  const year = now.getFullYear();
  const month = now.getMonth();

  if (periodId === "all-time") {
    return {
      dateFrom: null,
      dateTo: null,
      title: "За всё время",
    };
  }

  if (periodId === "first-half") {
    return {
      dateFrom: formatInputDate(
        new Date(year, month, 1)
      ),

      dateTo: formatInputDate(
        new Date(year, month, 15)
      ),

      title: `1–15 ${getMonthName(
        month
      )} ${year}`,
    };
  }

  if (periodId === "second-half") {
    return {
      dateFrom: formatInputDate(
        new Date(year, month, 16)
      ),

      dateTo: formatInputDate(
        new Date(year, month + 1, 0)
      ),

      title: `16–${new Date(
        year,
        month + 1,
        0
      ).getDate()} ${getMonthName(
        month
      )} ${year}`,
    };
  }

  return {
    dateFrom: formatInputDate(
      new Date(year, month, 1)
    ),

    dateTo: formatInputDate(
      new Date(year, month + 1, 0)
    ),

    title: `${getMonthName(
      month
    )} ${year}`,
  };
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

function getMonthName(monthIndex) {
  return [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ][monthIndex];
}

function getInitials(value) {
  if (!value) {
    return "М";
  }

  return value
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
  ).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat(
    "ru-RU"
  ).format(Number(value || 0));
}

function escapeCsvValue(value) {
  const stringValue = String(
    value ?? ""
  );

  return `"${stringValue.replace(
    /"/g,
    '""'
  )}"`;
}