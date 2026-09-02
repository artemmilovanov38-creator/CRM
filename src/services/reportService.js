import { supabase } from "../lib/supabase";
import {
  applicationMatchesDateOnlyPeriod,
  getOpenedAt,
  isDateOnlyInRange,
} from "../utils/applicationEvents";

const APPLICATION_REPORT_FIELDS = `
  id,
  full_name,
  phone,
  telegram,
  source,
  product,
  product_id,
  status,
  assigned_manager_id,
  mailing_id,
  mailing_contact_id,
  amount,
  comment,
  approved_at,
  opened_at,
  rejected_at,
  in_progress_at,
  opening_price_snapshot,
  created_at,
  updated_at,

  product_data:products (
    id,
    name,
    opening_price,
    is_active
  ),

  assigned_manager:profiles!applications_assigned_manager_id_fkey (
    id,
    full_name,
    email,
    role,
    status,
    avatar
  )
`;

const PROFILE_REPORT_FIELDS = `
  id,
  full_name,
  email,
  role,
  status,
  avatar
`;

const PRODUCT_REPORT_FIELDS = `
  id,
  name,
  description,
  opening_price,
  is_active,
  created_at,
  updated_at
`;

const APPLICATION_STATUSES = [
  {
    key: "new",
    title: "Новые",
  },
  {
    key: "in_progress",
    title: "В работе",
  },
  {
    key: "approved",
    title: "Успешно открыты",
  },
  {
    key: "rejected",
    title: "Отказы",
  },
];

function createServiceError(message) {
  return new Error(message);
}

function toSafeNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function roundNumber(value) {
  return Number(
    Number(value || 0).toFixed(1)
  );
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function getProductId(application) {
  return (
    application?.product_id ||
    application?.product_data?.id ||
    null
  );
}

function getProductName(application) {
  return (
    application?.product_data?.name ||
    application?.product ||
    "Продукт не указан"
  );
}

function hasOpeningPriceSnapshot(
  application
) {
  return (
    application
      ?.opening_price_snapshot !==
      null &&
    application
      ?.opening_price_snapshot !==
      undefined
  );
}

/**
 * Возвращает ставку, которая должна
 * использоваться для расчёта выплаты.
 *
 * Для успешной заявки сначала берётся
 * ставка, сохранённая в момент открытия.
 *
 * Текущая ставка продукта используется
 * только как запасной вариант для старых
 * заявок без снимка ставки.
 */
function getApplicationOpeningRate(
  application,
  productMap
) {
  if (
    application?.amount !== null &&
    application?.amount !== undefined &&
    application?.amount !== ""
  ) {
    return toSafeNumber(
      application.amount
    );
  }

  if (
    hasOpeningPriceSnapshot(
      application
    )
  ) {
    return toSafeNumber(
      application
        .opening_price_snapshot
    );
  }

  const productId =
    getProductId(application);

  if (
    productId &&
    productMap.has(productId)
  ) {
    return toSafeNumber(
      productMap.get(productId)
        ?.opening_price
    );
  }

  return toSafeNumber(
    application?.product_data
      ?.opening_price
  );
}

function getProductRecord(
  application,
  productMap
) {
  const productId =
    getProductId(application);

  if (
    productId &&
    productMap.has(productId)
  ) {
    return productMap.get(productId);
  }

  if (
    application?.product_data?.id
  ) {
    return application.product_data;
  }

  return null;
}

function calculateApplicationSalary(
  application,
  productMap
) {
  if (
    application?.status !== "approved"
  ) {
    return 0;
  }

  return getApplicationOpeningRate(
    application,
    productMap
  );
}

/**
 * Дата успешного открытия для отчёта
 * и зарплаты.
 */
function getApplicationOpenedAt(
  application
) {
  return getOpenedAt(application);
}

function isEventInReportPeriod(
  value,
  dateFrom,
  dateTo
) {
  if (!dateFrom && !dateTo) {
    return Boolean(value);
  }

  return isDateOnlyInRange(
    value,
    dateFrom,
    dateTo
  );
}

function isValidDateOnly(dateValue) {
  if (!dateValue) {
    return false;
  }

  const date = new Date(`${dateValue}T00:00:00`);

  return !Number.isNaN(date.getTime());
}

function applicationMatchesStatusPeriod(
  application,
  status,
  dateFrom,
  dateTo
) {
  if (!dateFrom && !dateTo) {
    return true;
  }

  if (status === "approved") {
    return isEventInReportPeriod(
      getApplicationOpenedAt(application),
      dateFrom,
      dateTo
    );
  }

  if (status === "rejected") {
    return isEventInReportPeriod(
      application?.rejected_at,
      dateFrom,
      dateTo
    );
  }

  if (status === "in_progress") {
    return isEventInReportPeriod(
      application?.in_progress_at,
      dateFrom,
      dateTo
    );
  }

  if (status === "new") {
    return isEventInReportPeriod(
      application?.created_at,
      dateFrom,
      dateTo
    );
  }

  return applicationMatchesDateOnlyPeriod(
    application,
    dateFrom,
    dateTo
  );
}

export const reportService = {
  /**
   * Получить заявки для отчёта.
   *
   * Фильтры по менеджеру, продукту,
   * источнику и статусу применяются
   * в Supabase.
   *
   * Период применяется после загрузки:
   * создание — created_at, переход в работу —
   * in_progress_at, открытие — opened_at,
   * отказ — rejected_at.
   */
  async getApplications({
    dateFrom = null,
    dateTo = null,
    managerId = null,
    productId = null,
    product = null,
    source = null,
    status = null,
    mailingId = null,
  } = {}) {
    if (dateFrom && !isValidDateOnly(dateFrom)) {
      return {
        data: [],
        error: createServiceError(
          "Некорректная начальная дата"
        ),
      };
    }

    if (dateTo && !isValidDateOnly(dateTo)) {
      return {
        data: [],
        error: createServiceError(
          "Некорректная конечная дата"
        ),
      };
    }

    if (
      dateFrom &&
      dateTo &&
      dateFrom > dateTo
    ) {
      return {
        data: [],
        error: createServiceError(
          "Начальная дата не может быть позже конечной"
        ),
      };
    }

    let query = supabase
      .from("applications")
      .select(
        APPLICATION_REPORT_FIELDS
      )
      .order("created_at", {
        ascending: true,
      });

    if (managerId) {
      query = query.eq(
        "assigned_manager_id",
        managerId
      );
    }

    if (productId) {
      query = query.eq(
        "product_id",
        productId
      );
    } else if (product) {
      query = query.eq(
        "product",
        product
      );
    }

    if (source) {
      query = query.eq(
        "source",
        source
      );
    }

    if (status) {
      query = query.eq(
        "status",
        status
      );
    }

    if (mailingId) {
      query = query.eq(
        "mailing_id",
        mailingId
      );
    }

    const { data, error } =
      await query;

    if (error) {
      return {
        data: [],
        error,
      };
    }

    const applications =
      (data || []).filter(
        (application) =>
          applicationMatchesStatusPeriod(
            application,
            status,
            dateFrom,
            dateTo
          )
      );

    applications.sort(
      (
        firstApplication,
        secondApplication
      ) => {
        const firstDate =
          new Date(
            getApplicationOpenedAt(
              firstApplication
            ) ||
              firstApplication.created_at ||
              0
          ).getTime();

        const secondDate =
          new Date(
            getApplicationOpenedAt(
              secondApplication
            ) ||
              secondApplication.created_at ||
              0
          ).getTime();

        return firstDate - secondDate;
      }
    );

    return {
      data: applications,
      error: null,
    };
  },

  async getManagers() {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        PROFILE_REPORT_FIELDS
      )
      .in("role", [
        "manager",
        "head",
      ])
      .order("full_name", {
        ascending: true,
      });

    return {
      data: data || [],
      error,
    };
  },

  async getProducts() {
    const { data, error } = await supabase
      .from("products")
      .select(
        PRODUCT_REPORT_FIELDS
      )
      .order("name", {
        ascending: true,
      });

    return {
      data: data || [],
      error,
    };
  },

  async getReportData(
    filters = {}
  ) {
    const [
      applicationsResult,
      managersResult,
      productsResult,
    ] = await Promise.all([
      this.getApplications(filters),
      this.getManagers(),
      this.getProducts(),
    ]);

    if (
      applicationsResult.error
    ) {
      return {
        data: null,
        error:
          applicationsResult.error,
      };
    }

    if (managersResult.error) {
      return {
        data: null,
        error:
          managersResult.error,
      };
    }

    if (productsResult.error) {
      return {
        data: null,
        error:
          productsResult.error,
      };
    }

    const applications =
      applicationsResult.data || [];

    const managers =
      managersResult.data || [];

    const products =
      productsResult.data || [];

    const productMap = new Map(
      products.map((product) => [
        product.id,
        product,
      ])
    );

    const period = {
      dateFrom: filters.dateFrom || null,
      dateTo: filters.dateTo || null,
    };

    return {
      data: {
        applications,
        managers,
        products,

        metrics:
          calculateMetrics(
            applications,
            productMap,
            period
          ),

        statusStats:
          calculateStatusStats(
            applications,
            period
          ),

        productStats:
          calculateProductStats(
            applications,
            products,
            productMap,
            period
          ),

        sourceStats:
          calculateSourceStats(
            applications,
            productMap,
            period
          ),

        managerStats:
          calculateManagerStats(
            applications,
            managers,
            products,
            productMap,
            period
          ),

        dailyStats:
          calculateDailyStats(
            applications,
            productMap,
            period
          ),
      },

      error: null,
    };
  },
};

function calculateMetrics(
  applications,
  productMap,
  period = {}
) {
  const { dateFrom = null, dateTo = null } =
    period;

  const createdApplications =
    applications.filter((application) =>
      isEventInReportPeriod(
        application.created_at,
        dateFrom,
        dateTo
      )
    );

  const inProgressApplications =
    applications.filter((application) =>
      isEventInReportPeriod(
        application.in_progress_at,
        dateFrom,
        dateTo
      )
    );

  const openedApplications =
    applications.filter((application) =>
      isEventInReportPeriod(
        getApplicationOpenedAt(application),
        dateFrom,
        dateTo
      )
    );

  const paidApplications =
    openedApplications.filter(
      (application) =>
        application.status === "approved"
    );

  const rejectedApplications =
    applications.filter((application) =>
      isEventInReportPeriod(
        application.rejected_at,
        dateFrom,
        dateTo
      )
    );

  const totalApplications =
    createdApplications.length;

  const totalAmount =
    createdApplications.reduce(
      (sum, application) =>
        sum +
        toSafeNumber(application.amount),
      0
    );

  const approvedAmount =
    paidApplications.reduce(
      (sum, application) =>
        sum +
        toSafeNumber(application.amount),
      0
    );

  const salaryFund =
    paidApplications.reduce(
      (sum, application) =>
        sum +
        calculateApplicationSalary(
          application,
          productMap
        ),
      0
    );

  const applicationsWithoutProduct =
    createdApplications.filter(
      (application) => !getProductId(application)
    ).length;

  const approvedWithoutRate =
    paidApplications.filter(
      (application) =>
        calculateApplicationSalary(
          application,
          productMap
        ) <= 0
    ).length;

  const conversion =
    totalApplications > 0
      ? roundNumber(
          (paidApplications.length /
            totalApplications) *
            100
        )
      : 0;

  return {
    totalApplications,
    approved: openedApplications.length,
    rejected: rejectedApplications.length,
    active: inProgressApplications.length,
    new: totalApplications,
    inProgress: inProgressApplications.length,
    waiting: 0,
    conversion,
    totalAmount,
    approvedAmount,
    salaryFund,
    applicationsWithoutProduct,
    approvedWithoutRate,
    averageApplicationAmount:
      totalApplications > 0
        ? Math.round(
            totalAmount / totalApplications
          )
        : 0,
    averageApprovedAmount:
      paidApplications.length > 0
        ? Math.round(
            approvedAmount /
              paidApplications.length
          )
        : 0,
  };
}

function calculateStatusStats(
  applications,
  period = {}
) {
  const { dateFrom = null, dateTo = null } =
    period;

  const counts = {
    new: 0,
    in_progress: 0,
    approved: 0,
    rejected: 0,
  };

  applications.forEach((application) => {
    if (
      isEventInReportPeriod(
        application.created_at,
        dateFrom,
        dateTo
      )
    ) {
      counts.new += 1;
    }

    if (
      isEventInReportPeriod(
        application.in_progress_at,
        dateFrom,
        dateTo
      )
    ) {
      counts.in_progress += 1;
    }

    if (
      isEventInReportPeriod(
        getApplicationOpenedAt(application),
        dateFrom,
        dateTo
      )
    ) {
      counts.approved += 1;
    }

    if (
      isEventInReportPeriod(
        application.rejected_at,
        dateFrom,
        dateTo
      )
    ) {
      counts.rejected += 1;
    }
  });

  const total =
    counts.new +
    counts.in_progress +
    counts.approved +
    counts.rejected;

  return APPLICATION_STATUSES.map((status) => {
    const count = counts[status.key] || 0;

    return {
      ...status,
      count,
      percent:
        total > 0
          ? roundNumber((count / total) * 100)
          : 0,
    };
  });
}

function getPeriodEventFlags(
  application,
  dateFrom,
  dateTo
) {
  const openedAt = getApplicationOpenedAt(
    application
  );

  return {
    created: isEventInReportPeriod(
      application?.created_at,
      dateFrom,
      dateTo
    ),
    inProgress: isEventInReportPeriod(
      application?.in_progress_at,
      dateFrom,
      dateTo
    ),
    opened: isEventInReportPeriod(
      openedAt,
      dateFrom,
      dateTo
    ),
    rejected: isEventInReportPeriod(
      application?.rejected_at,
      dateFrom,
      dateTo
    ),
    paid:
      application?.status === "approved" &&
      isEventInReportPeriod(
        openedAt,
        dateFrom,
        dateTo
      ),
  };
}

function getApplicationDateKey(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function calculateProductStats(
  applications,
  products,
  productMap,
  period = {}
) {
  const statsMap = new Map();

  products.forEach((product) => {
    statsMap.set(product.id, {
      key: product.id,
      id: product.id,
      productId: product.id,
      title: product.name,
      name: product.name,

      rate: toSafeNumber(
        product.opening_price
      ),

      currentRate: toSafeNumber(
        product.opening_price
      ),

      isActive:
        Boolean(product.is_active),

      applications: 0,
      approved: 0,
      rejected: 0,
      active: 0,
      amount: 0,
      approvedAmount: 0,
      salary: 0,
      rateGroups: {},
    });
  });

  const unknownKey =
    "without-product";

  applications.forEach(
    (application) => {
      const productId =
        getProductId(application);

      const product =
        getProductRecord(
          application,
          productMap
        );

      const mapKey =
        productId || unknownKey;

      if (!statsMap.has(mapKey)) {
        statsMap.set(mapKey, {
          key: mapKey,
          id: productId,
          productId,

          title:
            product?.name ||
            getProductName(
              application
            ),

          name:
            product?.name ||
            getProductName(
              application
            ),

          rate: toSafeNumber(
            product?.opening_price
          ),

          currentRate: toSafeNumber(
            product?.opening_price
          ),

          isActive:
            product?.is_active ??
            false,

          applications: 0,
          approved: 0,
          rejected: 0,
          active: 0,
          amount: 0,
          approvedAmount: 0,
          salary: 0,
          rateGroups: {},
        });
      }

      const item =
        statsMap.get(mapKey);

      const events = getPeriodEventFlags(
        application,
        period.dateFrom,
        period.dateTo
      );

      if (events.created) {
        item.applications += 1;
        item.amount +=
          toSafeNumber(application.amount);
      }

      if (events.inProgress) {
        item.active += 1;
      }

      if (events.opened) {
        const rate = events.paid
          ? calculateApplicationSalary(
              application,
              productMap
            )
          : 0;

        item.approved += 1;

        item.approvedAmount +=
          toSafeNumber(application.amount);

        if (events.paid) {
          item.salary += rate;

          const rateKey = String(rate);

          if (!item.rateGroups[rateKey]) {
            item.rateGroups[rateKey] = {
              rate,
              openings: 0,
              salary: 0,
            };
          }

          item.rateGroups[rateKey].openings += 1;
          item.rateGroups[rateKey].salary += rate;
        }
      }

      if (events.rejected) {
        item.rejected += 1;
      }
    }
  );

  return Array.from(
    statsMap.values()
  )
    .map((product) => {
      const rateGroups =
        Object.values(
          product.rateGroups
        );

      const displayRate =
        rateGroups.length === 1
          ? rateGroups[0].rate
          : product.currentRate;

      return {
        ...product,

        rate: displayRate,

        rateGroups,

        conversion:
          product.applications > 0
            ? roundNumber(
                (
                  product.approved /
                  product.applications
                ) * 100
              )
            : 0,
      };
    })
    .filter(
      (product) =>
        product.applications > 0 ||
        product.isActive
    )
    .sort(
      (first, second) =>
        second.approved -
          first.approved ||
        second.applications -
          first.applications ||
        first.title.localeCompare(
          second.title,
          "ru"
        )
    );
}

function calculateSourceStats(
  applications,
  productMap,
  period = {}
) {
  const sourceMap = new Map();

  applications.forEach(
    (application) => {
      const source =
        String(
          application.source || ""
        ).trim() || "Не указан";

      if (!sourceMap.has(source)) {
        sourceMap.set(source, {
          key: source,

          title:
            formatSource(source),

          applications: 0,
          approved: 0,
          rejected: 0,
          active: 0,
          amount: 0,
          approvedAmount: 0,
          salary: 0,
        });
      }

      const sourceItem =
        sourceMap.get(source);

      const events = getPeriodEventFlags(
        application,
        period.dateFrom,
        period.dateTo
      );

      if (events.created) {
        sourceItem.applications += 1;
        sourceItem.amount +=
          toSafeNumber(application.amount);
      }

      if (events.inProgress) {
        sourceItem.active += 1;
      }

      if (events.opened) {
        sourceItem.approved += 1;
        sourceItem.approvedAmount +=
          toSafeNumber(application.amount);

        if (events.paid) {
          sourceItem.salary +=
            calculateApplicationSalary(
              application,
              productMap
            );
        }
      }

      if (events.rejected) {
        sourceItem.rejected += 1;
      }
    }
  );

  return Array.from(
    sourceMap.values()
  )
    .map((source) => ({
      ...source,

      conversion:
        source.applications > 0
          ? roundNumber(
              (
                source.approved /
                source.applications
              ) * 100
            )
          : 0,
    }))
    .sort(
      (first, second) =>
        second.applications -
        first.applications
    );
}

function calculateManagerStats(
  applications,
  managers,
  products,
  productMap,
  period = {}
) {
  const managerMap = new Map();

  managers.forEach((manager) => {
    managerMap.set(manager.id, {
      id: manager.id,

      name:
        manager.full_name ||
        manager.email ||
        "Без имени",

      email:
        manager.email || "",

      avatar:
        manager.avatar || null,

      profileStatus:
        manager.status ||
        "active",

      role:
        manager.role ||
        "manager",

      applications: 0,
      approved: 0,
      rejected: 0,
      active: 0,
      new: 0,
      inProgress: 0,
      amount: 0,
      approvedAmount: 0,
      salary: 0,
      products: {},
    });
  });

  applications.forEach(
    (application) => {
      const managerId =
        application
          .assigned_manager_id ||
        "unassigned";

      if (
        !managerMap.has(managerId)
      ) {
        managerMap.set(managerId, {
          id: managerId,

          name:
            managerId ===
            "unassigned"
              ? "Без менеджера"
              : application
                  .assigned_manager
                  ?.full_name ||
                application
                  .assigned_manager
                  ?.email ||
                "Неизвестный менеджер",

          email:
            application
              .assigned_manager
              ?.email || "",

          avatar:
            application
              .assigned_manager
              ?.avatar || null,

          profileStatus:
            application
              .assigned_manager
              ?.status ||
            "active",

          role:
            application
              .assigned_manager
              ?.role ||
            "manager",

          applications: 0,
          approved: 0,
          rejected: 0,
          active: 0,
          new: 0,
          inProgress: 0,
          amount: 0,
          approvedAmount: 0,
          salary: 0,
          products: {},
        });
      }

      const manager =
        managerMap.get(managerId);

      const events = getPeriodEventFlags(
        application,
        period.dateFrom,
        period.dateTo
      );

      if (events.created) {
        manager.applications += 1;
        manager.amount +=
          toSafeNumber(application.amount);
        manager.new += 1;
        manager.active += 1;
      }

      if (events.inProgress) {
        manager.inProgress += 1;
        manager.active += 1;
      }

      if (events.opened) {
        manager.approved += 1;
        manager.approvedAmount +=
          toSafeNumber(application.amount);

        if (events.paid) {
          manager.salary +=
            calculateApplicationSalary(
              application,
              productMap
            );
        }
      }

      if (events.rejected) {
        manager.rejected += 1;
      }

      const productId =
        getProductId(application);

      const product =
        getProductRecord(
          application,
          productMap
        );

      const productKey =
        productId ||
        "without-product";

      if (
        !manager.products[
          productKey
        ]
      ) {
        manager.products[
          productKey
        ] = {
          key: productKey,
          id: productId,
          productId,

          title:
            product?.name ||
            getProductName(
              application
            ),

          name:
            product?.name ||
            getProductName(
              application
            ),

          currentRate:
            toSafeNumber(
              product?.opening_price
            ),

          applications: 0,
          approved: 0,
          rejected: 0,
          active: 0,
          salary: 0,
          amount: 0,
          rateGroups: {},
        };
      }

      const managerProduct =
        manager.products[
          productKey
        ];

      if (events.created) {
        managerProduct.applications += 1;
        managerProduct.amount +=
          toSafeNumber(application.amount);
      }

      if (events.inProgress) {
        managerProduct.active += 1;
      }

      if (events.opened) {
        const rate = events.paid
          ? calculateApplicationSalary(
              application,
              productMap
            )
          : 0;

        managerProduct.approved += 1;

        if (events.paid) {
          managerProduct.salary += rate;

          const rateKey = String(rate);

          if (!managerProduct.rateGroups[rateKey]) {
            managerProduct.rateGroups[rateKey] = {
              rate,
              openings: 0,
              salary: 0,
            };
          }

          managerProduct.rateGroups[rateKey].openings += 1;
          managerProduct.rateGroups[rateKey].salary += rate;
        }
      }

      if (events.rejected) {
        managerProduct.rejected += 1;
      }
    }
  );

  managerMap.forEach(
    (manager) => {
      products.forEach((product) => {
        if (
          manager.products[
            product.id
          ]
        ) {
          return;
        }

        manager.products[
          product.id
        ] = {
          key: product.id,
          id: product.id,
          productId: product.id,
          title: product.name,
          name: product.name,

          currentRate:
            toSafeNumber(
              product.opening_price
            ),

          applications: 0,
          approved: 0,
          rejected: 0,
          active: 0,
          salary: 0,
          amount: 0,
          rateGroups: {},
        };
      });
    }
  );

  return Array.from(
    managerMap.values()
  )
    .map((manager) => ({
      ...manager,

      products:
        Object.values(
          manager.products
        ).map((product) => ({
          ...product,

          rateGroups:
            Object.values(
              product.rateGroups
            ),

          rate:
            Object.values(
              product.rateGroups
            ).length === 1
              ? Object.values(
                  product.rateGroups
                )[0].rate
              : product.currentRate,
        })),

      conversion:
        manager.applications > 0
          ? roundNumber(
              (
                manager.approved /
                manager.applications
              ) * 100
            )
          : 0,
    }))
    .filter(
      (manager) =>
        manager.applications > 0
    )
    .sort(
      (first, second) =>
        second.approved -
          first.approved ||
        second.salary -
          first.salary ||
        second.conversion -
          first.conversion
    );
}

function calculateDailyStats(
  applications,
  productMap,
  period = {}
) {
  const dailyMap = new Map();

  function ensureDay(dateKey) {
    if (!dateKey) {
      return null;
    }

    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        date: dateKey,
        applications: 0,
        new: 0,
        inProgress: 0,
        approved: 0,
        rejected: 0,
        active: 0,
        amount: 0,
        approvedAmount: 0,
        salary: 0,
      });
    }

    return dailyMap.get(dateKey);
  }

  applications.forEach((application) => {
    const createdKey = getApplicationDateKey(
      application.created_at
    );
    const inProgressKey = getApplicationDateKey(
      application.in_progress_at
    );
    const openedKey = getApplicationDateKey(
      getApplicationOpenedAt(application)
    );
    const rejectedKey = getApplicationDateKey(
      application.rejected_at
    );

    if (
      isEventInReportPeriod(
        application.created_at,
        period.dateFrom,
        period.dateTo
      )
    ) {
      const day = ensureDay(createdKey);

      if (day) {
        day.applications += 1;
        day.new += 1;
        day.active += 1;
        day.amount += toSafeNumber(
          application.amount
        );
      }
    }

    if (
      isEventInReportPeriod(
        application.in_progress_at,
        period.dateFrom,
        period.dateTo
      )
    ) {
      const day = ensureDay(inProgressKey);

      if (day) {
        day.inProgress += 1;
        day.active += 1;
      }
    }

    if (
      isEventInReportPeriod(
        getApplicationOpenedAt(application),
        period.dateFrom,
        period.dateTo
      )
    ) {
      const day = ensureDay(openedKey);

      if (day) {
        day.approved += 1;
        day.approvedAmount += toSafeNumber(
          application.amount
        );

        if (application.status === "approved") {
          day.salary += calculateApplicationSalary(
            application,
            productMap
          );
        }
      }
    }

    if (
      isEventInReportPeriod(
        application.rejected_at,
        period.dateFrom,
        period.dateTo
      )
    ) {
      const day = ensureDay(rejectedKey);

      if (day) {
        day.rejected += 1;
      }
    }
  });

  return Array.from(
    dailyMap.values()
  )
    .map((day) => ({
      ...day,

      conversion:
        day.applications > 0
          ? roundNumber(
              (
                day.approved /
                day.applications
              ) * 100
            )
          : 0,
    }))
    .sort((first, second) =>
      first.date.localeCompare(
        second.date
      )
    );
}

function formatSource(source) {
  const normalized =
    normalizeText(source);

  if (
    !normalized ||
    normalized === "manual"
  ) {
    return "Вручную";
  }

  if (
    normalized === "mailing"
  ) {
    return "Рассылка";
  }

  if (
    normalized === "telegram"
  ) {
    return "Telegram";
  }

  if (
    normalized === "телефон" ||
    normalized === "phone"
  ) {
    return "Телефон";
  }

  return source;
}

export function calculateReportApplicationSalary(
  application,
  products = []
) {
  const productMap = new Map(
    products.map((product) => [
      product.id,
      product,
    ])
  );

  return calculateApplicationSalary(
    application,
    productMap
  );
}

export default reportService;