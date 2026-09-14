import {
  getApplicationPayout,
  normalizeProductName,
} from "./applicationEvents.js";

export const UNKNOWN_PRODUCT_ID = "__without-product__";

function toSafeNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function hasStoredPayout(application) {
  const amount = Number(application?.amount);
  const snapshot = Number(
    application?.opening_price_snapshot
  );

  return (
    (application?.amount !== null &&
      application?.amount !== undefined &&
      application?.amount !== "" &&
      Number.isFinite(amount)) ||
    (application?.opening_price_snapshot !==
      null &&
      application?.opening_price_snapshot !==
        undefined &&
      Number.isFinite(snapshot))
  );
}

function emptyProductStats(product) {
  return {
    productId: product.id,
    name: product.name,
    currentRate: toSafeNumber(
      product.opening_price
    ),
    openings: 0,
    salary: 0,
    missingPayout: 0,
    estimatedPayout: 0,
    rateGroups: {},
  };
}

function resolveProductKey(application, productMap, products) {
  const directId =
    application?.product_id ||
    application?.product_data?.id ||
    null;

  if (directId && productMap.has(String(directId))) {
    return String(directId);
  }

  if (directId) {
    return String(directId);
  }

  const applicationName = normalizeProductName(
    application?.product_data?.name ||
      application?.product
  );

  if (!applicationName) {
    return null;
  }

  const named = (products || []).find(
    (product) =>
      normalizeProductName(product.name) ===
      applicationName
  );

  return named ? String(named.id) : null;
}

function resolveProductName(application, product) {
  return (
    product?.name ||
    application?.product_data?.name ||
    application?.product ||
    "Продукт не указан"
  );
}

function addOpening(stats, payout) {
  stats.openings += 1;

  if (payout === null) {
    stats.missingPayout += 1;
    return;
  }

  stats.salary += payout;

  const rateKey = String(payout);

  if (!stats.rateGroups[rateKey]) {
    stats.rateGroups[rateKey] = {
      rate: payout,
      openings: 0,
      salary: 0,
    };
  }

  stats.rateGroups[rateKey].openings += 1;
  stats.rateGroups[rateKey].salary += payout;
}

/**
 * Единый расчёт зарплаты по успешным заявкам.
 * Каждая заявка даёт одно открытие своего
 * product_id. Сумма берётся из заявки.
 */
export function buildSalaryData({
  managers = [],
  products = [],
  applications = [],
} = {}) {
  const productMap = new Map(
    products.map((product) => [
      String(product.id),
      product,
    ])
  );

  const unknownApplications = [];

  const rows = managers.map((manager) => {
    const managerApplications =
      applications.filter(
        (application) =>
          String(
            application.assigned_manager_id ||
              ""
          ) === String(manager.id)
      );

    const productStats = {};

    products.forEach((product) => {
      productStats[String(product.id)] =
        emptyProductStats(product);
    });

    managerApplications.forEach((application) => {
      const productId = resolveProductKey(
        application,
        productMap,
        products
      );
      const product = productId
        ? productMap.get(String(productId))
        : null;
      const productKey = productId
        ? String(productId)
        : UNKNOWN_PRODUCT_ID;

      if (!productStats[productKey]) {
        productStats[productKey] =
          emptyProductStats({
            id: productId || UNKNOWN_PRODUCT_ID,
            name: resolveProductName(
              application,
              product
            ),
            opening_price:
              product?.opening_price || 0,
          });
      }

      if (!productId || !product) {
        unknownApplications.push({
          application,
          managerId: manager.id,
          reason: !productId
            ? "no_product"
            : "unknown_product",
        });
      }

      const payout = getApplicationPayout({
        ...application,
        product_data:
          application.product_data || product,
      });

      if (!hasStoredPayout(application)) {
        productStats[productKey].estimatedPayout += 1;
      }

      addOpening(
        productStats[productKey],
        payout
      );
    });

    const productItems = Object.values(
      productStats
    );

    return {
      id: manager.id,
      name:
        manager.full_name ||
        manager.email ||
        "Без имени",
      email: manager.email || "",
      avatar: getSalaryInitials(
        manager.full_name || manager.email
      ),
      status: manager.status || "active",
      products: productStats,
      totalOpenings: productItems.reduce(
        (sum, item) => sum + item.openings,
        0
      ),
      salary: productItems.reduce(
        (sum, item) => sum + item.salary,
        0
      ),
      missingPayout: productItems.reduce(
        (sum, item) => sum + item.missingPayout,
        0
      ),
      estimatedPayout: productItems.reduce(
        (sum, item) => sum + item.estimatedPayout,
        0
      ),
      unpricedOpenings: productItems.reduce(
        (sum, item) => sum + item.estimatedPayout,
        0
      ),
    };
  });

  return {
    rows,
    unknownApplications,
    unassignedSuccessful: applications.filter(
      (application) =>
        !application.assigned_manager_id
    ).length,
  };
}

export function countOpeningsByProductId(
  applications,
  productId
) {
  if (!productId) {
    return (applications || []).length;
  }

  return (applications || []).filter(
    (application) =>
      String(
        application?.product_id ||
          application?.product_data?.id ||
          ""
      ) === String(productId)
  ).length;
}

export function countOpeningsByProductName(
  applications,
  productName
) {
  const expected = normalizeProductName(
    productName
  );

  return (applications || []).filter(
    (application) =>
      normalizeProductName(
        application?.product_data?.name ||
          application?.product
      ) === expected
  ).length;
}

function getSalaryInitials(value) {
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
