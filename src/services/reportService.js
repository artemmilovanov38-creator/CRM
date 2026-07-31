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

function getProductRate(
  application,
  productMap
) {
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

  return getProductRate(
    application,
    productMap
  );
}

function getStartOfDayISOString(
  dateValue
) {
  const date = new Date(
    `${dateValue}T00:00:00`
  );

  if (
    Number.isNaN(date.getTime())
  ) {
    return null;
  }

  return date.toISOString();
}

function getEndOfDayISOString(
  dateValue
) {
  const date = new Date(
    `${dateValue}T23:59:59.999`
  );

  if (
    Number.isNaN(date.getTime())
  ) {
    return null;
  }

  return date.toISOString();
}

export const reportService = {
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
    let query = supabase
      .from("applications")
      .select(
        APPLICATION_REPORT_FIELDS
      )
      .order("created_at", {
        ascending: true,
      });

    if (dateFrom) {
      const dateFromISOString =
        getStartOfDayISOString(
          dateFrom
        );

      if (!dateFromISOString) {
        return {
          data: [],
          error: createServiceError(
            "Некорректная начальная дата"
          ),
        };
      }

      query = query.gte(
        "created_at",
        dateFromISOString
      );
    }

    if (dateTo) {
      const dateToISOString =
        getEndOfDayISOString(
          dateTo
        );

      if (!dateToISOString) {
        return {
          data: [],
          error: createServiceError(
            "Некорректная конечная дата"
          ),
        };
      }

      query = query.lte(
        "created_at",
        dateToISOString
      );
    }

    if (managerId) {
      query = query.eq(
        "assigned_manager_id",
        managerId
      );
    }

    /*
     * Основной фильтр — по product_id.
     */
    if (productId) {
      query = query.eq(
        "product_id",
        productId
      );
    } else if (product) {
      /*
       * Оставляем поддержку старого
       * текстового фильтра, чтобы текущая
       * страница отчётов не сломалась.
       */
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

    return {
      data: data || [],
      error,
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

        metrics: calculateMetrics(
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
            applications
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
        ) === 0
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

    /*
     * Поле оставлено только для
     * совместимости со старой вёрсткой.
     * Статуса waiting больше нет.
     */
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
      isActive:
        Boolean(product.is_active),
      applications: 0,
      approved: 0,
      rejected: 0,
      active: 0,
      amount: 0,
      approvedAmount: 0,
      salary: 0,
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
            getProductName(application),
          name:
            product?.name ||
            getProductName(application),
          rate: getProductRate(
            application,
            productMap
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
        item.approved += 1;

        item.approvedAmount +=
          toSafeNumber(
            application.amount
          );

        item.salary +=
          calculateApplicationSalary(
            application,
            productMap
          );
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
    .map((product) => ({
      ...product,

      conversion:
        product.applications > 0
          ? roundNumber(
              (
                product.approved /
                product.applications
              ) * 100
            )
          : 0,
    }))
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
  applications
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
          title: formatSource(
            source
          ),
          applications: 0,
          approved: 0,
          rejected: 0,
          active: 0,
          amount: 0,
          approvedAmount: 0,
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

          rate: getProductRate(
            application,
            productMap
          ),

          applications: 0,
          approved: 0,
          rejected: 0,
          active: 0,
          salary: 0,
          amount: 0,
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
        managerProduct.approved += 1;

        managerProduct.salary +=
          calculateApplicationSalary(
            application,
            productMap
          );
      }

      if (
        application.status ===
        "rejected"
      ) {
        managerProduct.rejected += 1;
      }
    }
  );

  /*
   * Добавляем продукты без заявок
   * в детализацию менеджера, чтобы
   * интерфейс мог показать нулевые значения.
   */
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

          rate: toSafeNumber(
            product.opening_price
          ),

          applications: 0,
          approved: 0,
          rejected: 0,
          active: 0,
          salary: 0,
          amount: 0,
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
        ),

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
      if (
        !application.created_at
      ) {
        return;
      }

      const dateKey =
        application.created_at.slice(
          0,
          10
        );

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