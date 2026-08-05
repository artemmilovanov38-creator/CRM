import { supabase } from "../lib/supabase";

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
 * Дата, по которой заявка попадает
 * в отчёт.
 *
 * Для успешной заявки используется
 * approved_at.
 *
 * Для остальных статусов используется
 * created_at.
 */
function getApplicationReportDate(
  application
) {
  if (
    application?.status === "approved"
  ) {
    return (
      application.approved_at ||
      application.updated_at ||
      application.created_at ||
      null
    );
  }

  return (
    application?.created_at ||
    null
  );
}

function getApplicationReportDateKey(
  application
) {
  const value =
    getApplicationReportDate(
      application
    );

  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "";
  }

  return [
    date.getFullYear(),

    String(
      date.getMonth() + 1
    ).padStart(2, "0"),

    String(
      date.getDate()
    ).padStart(2, "0"),
  ].join("-");
}

function getStartOfDayTimestamp(
  dateValue
) {
  if (!dateValue) {
    return null;
  }

  const date = new Date(
    `${dateValue}T00:00:00`
  );

  if (
    Number.isNaN(date.getTime())
  ) {
    return null;
  }

  return date.getTime();
}

function getEndOfDayTimestamp(
  dateValue
) {
  if (!dateValue) {
    return null;
  }

  const date = new Date(
    `${dateValue}T23:59:59.999`
  );

  if (
    Number.isNaN(date.getTime())
  ) {
    return null;
  }

  return date.getTime();
}

function isApplicationInsidePeriod(
  application,
  dateFrom,
  dateTo
) {
  if (!dateFrom && !dateTo) {
    return true;
  }

  const reportDate =
    getApplicationReportDate(
      application
    );

  if (!reportDate) {
    return false;
  }

  const timestamp =
    new Date(reportDate).getTime();

  if (
    Number.isNaN(timestamp)
  ) {
    return false;
  }

  if (dateFrom) {
    const startTimestamp =
      getStartOfDayTimestamp(
        dateFrom
      );

    if (
      startTimestamp === null ||
      timestamp < startTimestamp
    ) {
      return false;
    }
  }

  if (dateTo) {
    const endTimestamp =
      getEndOfDayTimestamp(
        dateTo
      );

    if (
      endTimestamp === null ||
      timestamp > endTimestamp
    ) {
      return false;
    }
  }

  return true;
}

export const reportService = {
  /**
   * Получить заявки для отчёта.
   *
   * Фильтры по менеджеру, продукту,
   * источнику и статусу применяются
   * в Supabase.
   *
   * Период применяется после загрузки,
   * потому что для successful-заявок
   * используется approved_at, а для
   * остальных — created_at.
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
    if (
      dateFrom &&
      getStartOfDayTimestamp(
        dateFrom
      ) === null
    ) {
      return {
        data: [],
        error: createServiceError(
          "Некорректная начальная дата"
        ),
      };
    }

    if (
      dateTo &&
      getEndOfDayTimestamp(
        dateTo
      ) === null
    ) {
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
          isApplicationInsidePeriod(
            application,
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
            getApplicationReportDate(
              firstApplication
            ) || 0
          ).getTime();

        const secondDate =
          new Date(
            getApplicationReportDate(
              secondApplication
            ) || 0
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

    return {
      data: {
        applications,
        managers,
        products,

        metrics:
          calculateMetrics(
            applications,
            productMap
          ),

        statusStats:
          calculateStatusStats(
            applications
          ),

        productStats:
          calculateProductStats(
            applications,
            products,
            productMap
          ),

        sourceStats:
          calculateSourceStats(
            applications,
            productMap
          ),

        managerStats:
          calculateManagerStats(
            applications,
            managers,
            products,
            productMap
          ),

        dailyStats:
          calculateDailyStats(
            applications,
            productMap
          ),
      },

      error: null,
    };
  },
};

function calculateMetrics(
  applications,
  productMap
) {
  const totalApplications =
    applications.length;

  const approvedApplications =
    applications.filter(
      (application) =>
        application.status ===
        "approved"
    );

  const rejectedApplications =
    applications.filter(
      (application) =>
        application.status ===
        "rejected"
    );

  const activeApplications =
    applications.filter(
      (application) =>
        [
          "new",
          "in_progress",
        ].includes(
          application.status
        )
    );

  const newApplications =
    applications.filter(
      (application) =>
        application.status === "new"
    );

  const inProgressApplications =
    applications.filter(
      (application) =>
        application.status ===
        "in_progress"
    );

  const totalAmount =
    applications.reduce(
      (sum, application) =>
        sum +
        toSafeNumber(
          application.amount
        ),
      0
    );

  const approvedAmount =
    approvedApplications.reduce(
      (sum, application) =>
        sum +
        toSafeNumber(
          application.amount
        ),
      0
    );

  const salaryFund =
    approvedApplications.reduce(
      (sum, application) =>
        sum +
        calculateApplicationSalary(
          application,
          productMap
        ),
      0
    );

  const applicationsWithoutProduct =
    applications.filter(
      (application) =>
        !getProductId(application)
    ).length;

  const approvedWithoutRate =
    approvedApplications.filter(
      (application) =>
        calculateApplicationSalary(
          application,
          productMap
        ) <= 0
    ).length;

  const conversion =
    totalApplications > 0
      ? roundNumber(
          (
            approvedApplications.length /
            totalApplications
          ) * 100
        )
      : 0;

  return {
    totalApplications,

    approved:
      approvedApplications.length,

    rejected:
      rejectedApplications.length,

    active:
      activeApplications.length,

    new:
      newApplications.length,

    inProgress:
      inProgressApplications.length,

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
            totalAmount /
              totalApplications
          )
        : 0,

    averageApprovedAmount:
      approvedApplications.length > 0
        ? Math.round(
            approvedAmount /
              approvedApplications.length
          )
        : 0,
  };
}

function calculateStatusStats(
  applications
) {
  const total =
    applications.length;

  return APPLICATION_STATUSES.map(
    (status) => {
      const count =
        applications.filter(
          (application) =>
            application.status ===
            status.key
        ).length;

      return {
        ...status,
        count,

        percent:
          total > 0
            ? roundNumber(
                (count / total) * 100
              )
            : 0,
      };
    }
  );
}

function calculateProductStats(
  applications,
  products,
  productMap
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

      item.applications += 1;

      item.amount +=
        toSafeNumber(
          application.amount
        );

      if (
        [
          "new",
          "in_progress",
        ].includes(
          application.status
        )
      ) {
        item.active += 1;
      }

      if (
        application.status ===
        "approved"
      ) {
        const rate =
          calculateApplicationSalary(
            application,
            productMap
          );

        item.approved += 1;

        item.approvedAmount +=
          toSafeNumber(
            application.amount
          );

        item.salary += rate;

        const rateKey =
          String(rate);

        if (!item.rateGroups[rateKey]) {
          item.rateGroups[rateKey] = {
            rate,
            openings: 0,
            salary: 0,
          };
        }

        item.rateGroups[
          rateKey
        ].openings += 1;

        item.rateGroups[
          rateKey
        ].salary += rate;
      }

      if (
        application.status ===
        "rejected"
      ) {
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
  productMap
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

      sourceItem.applications += 1;

      sourceItem.amount +=
        toSafeNumber(
          application.amount
        );

      if (
        [
          "new",
          "in_progress",
        ].includes(
          application.status
        )
      ) {
        sourceItem.active += 1;
      }

      if (
        application.status ===
        "approved"
      ) {
        sourceItem.approved += 1;

        sourceItem.approvedAmount +=
          toSafeNumber(
            application.amount
          );

        sourceItem.salary +=
          calculateApplicationSalary(
            application,
            productMap
          );
      }

      if (
        application.status ===
        "rejected"
      ) {
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
  productMap
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

      manager.applications += 1;

      manager.amount +=
        toSafeNumber(
          application.amount
        );

      if (
        application.status === "new"
      ) {
        manager.new += 1;
        manager.active += 1;
      }

      if (
        application.status ===
        "in_progress"
      ) {
        manager.inProgress += 1;
        manager.active += 1;
      }

      if (
        application.status ===
        "approved"
      ) {
        manager.approved += 1;

        manager.approvedAmount +=
          toSafeNumber(
            application.amount
          );

        manager.salary +=
          calculateApplicationSalary(
            application,
            productMap
          );
      }

      if (
        application.status ===
        "rejected"
      ) {
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

      managerProduct.applications +=
        1;

      managerProduct.amount +=
        toSafeNumber(
          application.amount
        );

      if (
        [
          "new",
          "in_progress",
        ].includes(
          application.status
        )
      ) {
        managerProduct.active += 1;
      }

      if (
        application.status ===
        "approved"
      ) {
        const rate =
          calculateApplicationSalary(
            application,
            productMap
          );

        managerProduct.approved += 1;
        managerProduct.salary += rate;

        const rateKey =
          String(rate);

        if (
          !managerProduct
            .rateGroups[rateKey]
        ) {
          managerProduct
            .rateGroups[rateKey] = {
            rate,
            openings: 0,
            salary: 0,
          };
        }

        managerProduct
          .rateGroups[
            rateKey
          ].openings += 1;

        managerProduct
          .rateGroups[
            rateKey
          ].salary += rate;
      }

      if (
        application.status ===
        "rejected"
      ) {
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
  productMap
) {
  const dailyMap = new Map();

  applications.forEach(
    (application) => {
      const dateKey =
        getApplicationReportDateKey(
          application
        );

      if (!dateKey) {
        return;
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

      const day =
        dailyMap.get(dateKey);

      day.applications += 1;

      day.amount +=
        toSafeNumber(
          application.amount
        );

      if (
        application.status === "new"
      ) {
        day.new += 1;
        day.active += 1;
      }

      if (
        application.status ===
        "in_progress"
      ) {
        day.inProgress += 1;
        day.active += 1;
      }

      if (
        application.status ===
        "approved"
      ) {
        day.approved += 1;

        day.approvedAmount +=
          toSafeNumber(
            application.amount
          );

        day.salary +=
          calculateApplicationSalary(
            application,
            productMap
          );
      }

      if (
        application.status ===
        "rejected"
      ) {
        day.rejected += 1;
      }
    }
  );

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