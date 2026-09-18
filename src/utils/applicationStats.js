import { matchesSearch } from "./searchMatch.js";
import {
  applicationIsSuccessfulOpeningInPeriod,
  applicationMatchesProductId,
  applicationMatchesStatus,
  applicationMatchesStatusAndPeriod,
  getApplicationPayout,
  isCurrentlyApproved,
  isTimestampInRange,
  normalizeApplicationStatus,
  normalizeProductName,
} from "./applicationEvents.js";

function productName(application) {
  return (
    application?.product_data?.name ||
    application?.product ||
    "Продукт не указан"
  );
}

function managerName(manager) {
  return (
    manager?.full_name ||
    manager?.email ||
    "Без имени"
  );
}

function productKey(application) {
  const id =
    application?.product_id ||
    application?.product_data?.id ||
    null;

  if (id) {
    return String(id);
  }

  const name = normalizeProductName(application?.product);

  return name || "__without-product__";
}

export function getSuccessfulApplications(
  applications = [],
  rangeFrom = null,
  rangeTo = null
) {
  return (applications || []).filter((application) =>
    applicationIsSuccessfulOpeningInPeriod(
      application,
      rangeFrom,
      rangeTo
    )
  );
}

export function sumApplicationPayouts(applications = []) {
  return (applications || []).reduce((sum, application) => {
    return sum + Number(getApplicationPayout(application) || 0);
  }, 0);
}

export function applicationMatchesListFilters(
  application,
  {
    statusFilter = "all",
    rangeFrom = null,
    rangeTo = null,
  } = {}
) {
  if (!applicationMatchesStatus(application, statusFilter)) {
    return false;
  }

  return applicationMatchesStatusAndPeriod(
    application,
    statusFilter,
    rangeFrom,
    rangeTo
  );
}

function emptyProductRow(application) {
  return {
    productId:
      application?.product_id ||
      application?.product_data?.id ||
      null,
    name: productName(application),
    total: 0,
    opened: 0,
    amount: 0,
  };
}

function emptyManagerRow(manager) {
  return {
    id: manager?.id,
    name: managerName(manager),
    applications: 0,
    inProgress: 0,
    opened: 0,
    rejected: 0,
    totalAmount: 0,
  };
}

/**
 * Один набор заявок для карточек, Kanban,
 * таблицы, результата менеджеров, продуктов
 * и суммы успешных. Зарплата использует
 * getSuccessfulApplications из этого же файла.
 */
export function buildApplicationBoard({
  applications = [],
  managers = [],
  search = "",
  statusFilter = "all",
  productId = null,
  selectedProduct = null,
  rangeFrom = null,
  rangeTo = null,
} = {}) {
  const matched = (applications || []).filter((application) => {
    const matchesQuery = matchesSearch(
      [
        application.full_name,
        application.phone,
        application.telegram,
        application.source,
        productName(application),
      ],
      search
    );

    return (
      matchesQuery &&
      applicationMatchesProductId(
        application,
        productId,
        selectedProduct
      )
    );
  });

  const visible = matched.filter((application) =>
    applicationMatchesListFilters(application, {
      statusFilter,
      rangeFrom,
      rangeTo,
    })
  );

  const successfulAll = getSuccessfulApplications(
    matched,
    rangeFrom,
    rangeTo
  );

  const successful =
    statusFilter === "all"
      ? successfulAll
      : statusFilter === "approved"
        ? visible
        : [];

  const deferredOpenings = matched.filter((application) => {
    if (!rangeFrom && !rangeTo) {
      return false;
    }

    if (!isCurrentlyApproved(application)) {
      return false;
    }

    if (
      !isTimestampInRange(
        application?.created_at,
        rangeFrom,
        rangeTo
      )
    ) {
      return false;
    }

    return !applicationIsSuccessfulOpeningInPeriod(
      application,
      rangeFrom,
      rangeTo
    );
  });

  const created = matched.filter((application) =>
    !rangeFrom && !rangeTo
      ? true
      : isTimestampInRange(
          application?.created_at,
          rangeFrom,
          rangeTo
        )
  );

  const countByCurrentStatus = (status) =>
    matched.filter((application) =>
      applicationMatchesListFilters(application, {
        statusFilter: status,
        rangeFrom,
        rangeTo,
      })
    ).length;

  const stats =
    statusFilter && statusFilter !== "all"
      ? {
          total: visible.length,
          newApplications:
            statusFilter === "new" ? visible.length : 0,
          inProgress:
            statusFilter === "in_progress"
              ? visible.length
              : 0,
          approved: successful.length,
          opened: successful.length,
          rejected:
            statusFilter === "rejected" ? visible.length : 0,
          totalAmount: sumApplicationPayouts(successful),
        }
      : {
          total: created.length,
          newApplications: countByCurrentStatus("new"),
          inProgress: countByCurrentStatus("in_progress"),
          approved: successful.length,
          opened: successful.length,
          rejected: countByCurrentStatus("rejected"),
          totalAmount: sumApplicationPayouts(successful),
        };

  const productSource =
    statusFilter && statusFilter !== "all" ? visible : matched;
  const productsById = new Map();

  for (const application of productSource) {
    const key = productKey(application);

    if (!productsById.has(key)) {
      productsById.set(key, emptyProductRow(application));
    }

    const row = productsById.get(key);
    const createdInPeriod =
      !rangeFrom && !rangeTo
        ? true
        : isTimestampInRange(
            application?.created_at,
            rangeFrom,
            rangeTo
          );

    if (
      statusFilter &&
      statusFilter !== "all"
    ) {
      row.total += 1;
    } else if (createdInPeriod) {
      row.total += 1;
    }
  }

  for (const application of successful) {
    const key = productKey(application);

    if (!productsById.has(key)) {
      productsById.set(key, emptyProductRow(application));
    }

    const row = productsById.get(key);
    row.opened += 1;
    row.amount += Number(
      getApplicationPayout(application) || 0
    );
  }

  const products = [...productsById.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "ru")
  );

  const managersById = new Map(
    (managers || []).map((manager) => [
      String(manager.id),
      emptyManagerRow(manager),
    ])
  );

  const ensureManager = (id) => {
    if (!id) {
      return null;
    }

    const key = String(id);

    if (!managersById.has(key)) {
      managersById.set(
        key,
        emptyManagerRow({ id })
      );
    }

    return managersById.get(key);
  };

  if (!statusFilter || statusFilter === "all") {
    for (const application of created) {
      const row = ensureManager(application.assigned_manager_id);
      if (row) {
        row.applications += 1;
      }
    }

    for (const application of matched) {
      const row = ensureManager(application.assigned_manager_id);

      if (!row) {
        continue;
      }

      if (
        applicationMatchesListFilters(application, {
          statusFilter: "in_progress",
          rangeFrom,
          rangeTo,
        })
      ) {
        row.inProgress += 1;
      }

      if (
        applicationMatchesListFilters(application, {
          statusFilter: "rejected",
          rangeFrom,
          rangeTo,
        })
      ) {
        row.rejected += 1;
      }
    }

    for (const application of successful) {
      const row = ensureManager(application.assigned_manager_id);

      if (!row) {
        continue;
      }

      row.opened += 1;
      row.totalAmount += Number(
        getApplicationPayout(application) || 0
      );
    }
  } else {
    for (const application of visible) {
      const row = ensureManager(application.assigned_manager_id);

      if (!row) {
        continue;
      }

      row.applications += 1;

      const status = normalizeApplicationStatus(application.status);

      if (status === "in_progress") {
        row.inProgress += 1;
      }

      if (status === "rejected") {
        row.rejected += 1;
      }

      if (status === "approved") {
        row.opened += 1;
        row.totalAmount += Number(
          getApplicationPayout(application) || 0
        );
      }
    }
  }

  const managerRows = [...managersById.values()]
    .filter(
      (row) =>
        row.applications > 0 ||
        row.inProgress > 0 ||
        row.opened > 0 ||
        row.rejected > 0
    )
    .sort((left, right) =>
      left.name.localeCompare(right.name, "ru")
    );

  return {
    matched,
    visible,
    successful,
    deferredOpenings,
    stats,
    products,
    managers: managerRows,
  };
}

export function applicationMatchesListPeriod(
  application,
  rangeFrom,
  rangeTo
) {
  return applicationMatchesStatusAndPeriod(
    application,
    "all",
    rangeFrom,
    rangeTo
  );
}
