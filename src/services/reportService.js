import { supabase } from "../lib/supabase";

const APPLICATION_REPORT_FIELDS = `
  id,
  full_name,
  phone,
  telegram,
  source,
  product,
  status,
  assigned_manager_id,
  amount,
  created_at,
  updated_at,
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

export const reportService = {
  async getApplications({
    dateFrom = null,
    dateTo = null,
    managerId = null,
    product = null,
    source = null,
    status = null,
  } = {}) {
    let query = supabase
      .from("applications")
      .select(APPLICATION_REPORT_FIELDS)
      .order("created_at", {
        ascending: true,
      });

    if (dateFrom) {
      query = query.gte(
        "created_at",
        getStartOfDayISOString(dateFrom)
      );
    }

    if (dateTo) {
      query = query.lte(
        "created_at",
        getEndOfDayISOString(dateTo)
      );
    }

    if (managerId) {
      query = query.eq(
        "assigned_manager_id",
        managerId
      );
    }

    if (product) {
      query = query.eq("product", product);
    }

    if (source) {
      query = query.eq("source", source);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    return {
      data: data || [],
      error,
    };
  },

  async getManagers() {
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_REPORT_FIELDS)
      .in("role", ["manager", "leader"])
      .order("full_name", {
        ascending: true,
      });

    return {
      data: data || [],
      error,
    };
  },

  async getReportData(filters = {}) {
    const [
      applicationsResult,
      managersResult,
    ] = await Promise.all([
      this.getApplications(filters),
      this.getManagers(),
    ]);

    if (applicationsResult.error) {
      return {
        data: null,
        error: applicationsResult.error,
      };
    }

    if (managersResult.error) {
      return {
        data: null,
        error: managersResult.error,
      };
    }

    const applications =
      applicationsResult.data || [];

    const managers =
      managersResult.data || [];

    return {
      data: {
        applications,
        managers,
        metrics: calculateMetrics(
          applications
        ),
        statusStats: calculateStatusStats(
          applications
        ),
        productStats: calculateProductStats(
          applications
        ),
        sourceStats: calculateSourceStats(
          applications
        ),
        managerStats: calculateManagerStats(
          applications,
          managers
        ),
        dailyStats: calculateDailyStats(
          applications
        ),
      },
      error: null,
    };
  },
};

export const PRODUCT_RATES = {
  alfa: {
    key: "alfa",
    title: "Альфа",
    rate: 1200,
  },

  receipt: {
    key: "receipt",
    title: "Квитанция",
    rate: 500,
  },

  otp: {
    key: "otp",
    title: "ОТП",
    rate: 300,
  },

  gazpromPremium: {
    key: "gazpromPremium",
    title: "Газпром премиум",
    rate: 400,
  },

  unknown: {
    key: "unknown",
    title: "Другой продукт",
    rate: 0,
  },
};

export function normalizeProductKey(
  productValue
) {
  const normalized = String(
    productValue || ""
  )
    .trim()
    .toLowerCase()
    .replaceAll("ё", "е");

  if (!normalized) {
    return "unknown";
  }

  if (
    normalized.includes("альфа") ||
    normalized.includes("alfa") ||
    normalized.includes("alpha")
  ) {
    return "alfa";
  }

  if (
    normalized.includes("квитанц") ||
    normalized.includes("receipt")
  ) {
    return "receipt";
  }

  if (
    normalized === "отп" ||
    normalized.includes("отп банк") ||
    normalized.includes("otp")
  ) {
    return "otp";
  }

  if (
    normalized.includes("газпром") ||
    normalized.includes("газ прем") ||
    normalized.includes("газпрем") ||
    normalized.includes("premium")
  ) {
    return "gazpromPremium";
  }

  return "unknown";
}

export function getProductRate(
  productValue
) {
  const productKey =
    normalizeProductKey(productValue);

  return PRODUCT_RATES[productKey]?.rate || 0;
}

export function calculateApplicationSalary(
  application
) {
  if (application?.status !== "approved") {
    return 0;
  }

  return getProductRate(
    application.product
  );
}

function calculateMetrics(applications) {
  const totalApplications =
    applications.length;

  const approvedApplications =
    applications.filter(
      (application) =>
        application.status === "approved"
    );

  const rejectedApplications =
    applications.filter(
      (application) =>
        application.status === "rejected"
    );

  const activeApplications =
    applications.filter((application) =>
      [
        "new",
        "in_progress",
        "waiting",
      ].includes(application.status)
    );

  const totalAmount =
    applications.reduce(
      (sum, application) =>
        sum +
        toSafeNumber(application.amount),
      0
    );

  const approvedAmount =
    approvedApplications.reduce(
      (sum, application) =>
        sum +
        toSafeNumber(application.amount),
      0
    );

  const salaryFund =
    approvedApplications.reduce(
      (sum, application) =>
        sum +
        calculateApplicationSalary(
          application
        ),
      0
    );

  const conversion =
    totalApplications > 0
      ? roundNumber(
          (approvedApplications.length /
            totalApplications) *
            100
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
    waiting:
      applications.filter(
        (application) =>
          application.status === "waiting"
      ).length,
    conversion,
    totalAmount,
    approvedAmount,
    salaryFund,
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
  const statuses = [
    {
      key: "new",
      title: "Новые",
    },
    {
      key: "in_progress",
      title: "В работе",
    },
    {
      key: "waiting",
      title: "Ожидание",
    },
    {
      key: "approved",
      title: "Успешные",
    },
    {
      key: "rejected",
      title: "Отказы",
    },
  ];

  const total = applications.length;

  return statuses.map((status) => {
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
  });
}

function calculateProductStats(
  applications
) {
  const productMap = new Map();

  applications.forEach((application) => {
    const productKey =
      normalizeProductKey(
        application.product
      );

    const productConfig =
      PRODUCT_RATES[productKey] ||
      PRODUCT_RATES.unknown;

    if (!productMap.has(productKey)) {
      productMap.set(productKey, {
        key: productKey,
        title:
          productKey === "unknown"
            ? application.product ||
              productConfig.title
            : productConfig.title,
        applications: 0,
        approved: 0,
        rejected: 0,
        amount: 0,
        salary: 0,
        rate: productConfig.rate,
      });
    }

    const product =
      productMap.get(productKey);

    product.applications += 1;
    product.amount += toSafeNumber(
      application.amount
    );

    if (
      application.status === "approved"
    ) {
      product.approved += 1;
      product.salary +=
        productConfig.rate;
    }

    if (
      application.status === "rejected"
    ) {
      product.rejected += 1;
    }
  });

  return Array.from(
    productMap.values()
  )
    .map((product) => ({
      ...product,
      conversion:
        product.applications > 0
          ? roundNumber(
              (product.approved /
                product.applications) *
                100
            )
          : 0,
    }))
    .sort(
      (first, second) =>
        second.approved -
        first.approved
    );
}

function calculateSourceStats(
  applications
) {
  const sourceMap = new Map();

  applications.forEach((application) => {
    const source =
      application.source?.trim() ||
      "Не указан";

    if (!sourceMap.has(source)) {
      sourceMap.set(source, {
        key: source,
        title: formatSource(source),
        applications: 0,
        approved: 0,
        rejected: 0,
        amount: 0,
      });
    }

    const sourceItem =
      sourceMap.get(source);

    sourceItem.applications += 1;
    sourceItem.amount += toSafeNumber(
      application.amount
    );

    if (
      application.status === "approved"
    ) {
      sourceItem.approved += 1;
    }

    if (
      application.status === "rejected"
    ) {
      sourceItem.rejected += 1;
    }
  });

  return Array.from(
    sourceMap.values()
  )
    .map((source) => ({
      ...source,
      conversion:
        source.applications > 0
          ? roundNumber(
              (source.approved /
                source.applications) *
                100
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
  managers
) {
  const managerMap = new Map();

  managers.forEach((manager) => {
    managerMap.set(manager.id, {
      id: manager.id,
      name:
        manager.full_name ||
        manager.email ||
        "Без имени",
      email: manager.email || "",
      avatar: manager.avatar || null,
      profileStatus:
        manager.status || "active",
      applications: 0,
      approved: 0,
      rejected: 0,
      active: 0,
      amount: 0,
      approvedAmount: 0,
      salary: 0,
      products: {},
    });
  });

  applications.forEach((application) => {
    const managerId =
      application.assigned_manager_id ||
      "unassigned";

    if (!managerMap.has(managerId)) {
      managerMap.set(managerId, {
        id: managerId,
        name:
          managerId === "unassigned"
            ? "Без менеджера"
            : application
                .assigned_manager
                ?.full_name ||
              application
                .assigned_manager
                ?.email ||
              "Неизвестный менеджер",
        email:
          application.assigned_manager
            ?.email || "",
        avatar:
          application.assigned_manager
            ?.avatar || null,
        profileStatus: "active",
        applications: 0,
        approved: 0,
        rejected: 0,
        active: 0,
        amount: 0,
        approvedAmount: 0,
        salary: 0,
        products: {},
      });
    }

    const manager =
      managerMap.get(managerId);

    manager.applications += 1;
    manager.amount += toSafeNumber(
      application.amount
    );

    const productKey =
      normalizeProductKey(
        application.product
      );

    if (!manager.products[productKey]) {
      manager.products[productKey] = {
        key: productKey,
        title:
          PRODUCT_RATES[productKey]
            ?.title ||
          application.product ||
          "Другой продукт",
        applications: 0,
        approved: 0,
        salary: 0,
      };
    }

    manager.products[
      productKey
    ].applications += 1;

    if (
      application.status === "approved"
    ) {
      const salary =
        calculateApplicationSalary(
          application
        );

      manager.approved += 1;
      manager.salary += salary;

      manager.approvedAmount +=
        toSafeNumber(
          application.amount
        );

      manager.products[
        productKey
      ].approved += 1;

      manager.products[
        productKey
      ].salary += salary;
    }

    if (
      application.status === "rejected"
    ) {
      manager.rejected += 1;
    }

    if (
      [
        "new",
        "in_progress",
        "waiting",
      ].includes(application.status)
    ) {
      manager.active += 1;
    }
  });

  return Array.from(
    managerMap.values()
  )
    .map((manager) => ({
      ...manager,
      products: Object.values(
        manager.products
      ),
      conversion:
        manager.applications > 0
          ? roundNumber(
              (manager.approved /
                manager.applications) *
                100
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
        second.conversion -
          first.conversion
    );
}

function calculateDailyStats(
  applications
) {
  const dailyMap = new Map();

  applications.forEach((application) => {
    if (!application.created_at) {
      return;
    }

    const dateKey =
      application.created_at.slice(0, 10);

    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        date: dateKey,
        applications: 0,
        approved: 0,
        rejected: 0,
        amount: 0,
        salary: 0,
      });
    }

    const day = dailyMap.get(dateKey);

    day.applications += 1;
    day.amount += toSafeNumber(
      application.amount
    );

    if (
      application.status === "approved"
    ) {
      day.approved += 1;
      day.salary +=
        calculateApplicationSalary(
          application
        );
    }

    if (
      application.status === "rejected"
    ) {
      day.rejected += 1;
    }
  });

  return Array.from(
    dailyMap.values()
  ).sort((first, second) =>
    first.date.localeCompare(
      second.date
    )
  );
}

function getStartOfDayISOString(
  dateValue
) {
  const date = new Date(
    `${dateValue}T00:00:00`
  );

  return date.toISOString();
}

function getEndOfDayISOString(
  dateValue
) {
  const date = new Date(
    `${dateValue}T23:59:59.999`
  );

  return date.toISOString();
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

function formatSource(source) {
  if (
    !source ||
    source === "manual"
  ) {
    return "Вручную";
  }

  return source;
}