import { supabase } from "../lib/supabase";
import { resolveApplicationManagerScope } from "./applicationService";
import { formatServiceError } from "../utils/serviceError";

const PAGE_SIZE = 1000;
const QUERY_TIMEOUT_MS = 12000;

function applyRange(query, column, dateFrom, dateTo) {
  let next = query;

  if (dateFrom) {
    next = next.gte(column, dateFrom);
  }

  if (dateTo) {
    next = next.lt(column, dateTo);
  }

  return next;
}

function applyManagerId(query, column, managerId) {
  if (!managerId) {
    return query;
  }

  if (managerId === "unassigned") {
    return query.is(column, null);
  }

  return query.eq(column, managerId);
}

function applyProductId(
  query,
  productId,
  productName = null
) {
  if (!productId) {
    return query;
  }

  if (!productName) {
    return query.eq("product_id", productId);
  }

  return query.or(
    `product_id.eq.${productId},and(product_id.is.null,product.eq."${String(
      productName
    ).replaceAll('"', '\\"')}")`
  );
}

async function resolveProductName(productId) {
  if (!productId) {
    return null;
  }

  const { data, error } = await supabase
    .from("products")
    .select("name")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    console.error(
      "Не удалось получить название продукта для фильтра:",
      error
    );
    return null;
  }

  return data?.name || null;
}

function openedAmount(row) {
  const amount = Number(
    row?.amount ??
      row?.opening_price_snapshot ??
      0
  );

  return Number.isFinite(amount) ? amount : 0;
}

function emptyApplicationManagerRow(manager) {
  return {
    id: manager?.id,
    name: managerDisplayName(manager),
    applications: 0,
    inProgress: 0,
    opened: 0,
    rejected: 0,
    totalAmount: 0,
  };
}

function mapApplicationManagerRows(
  rows,
  managers = [],
  managerId = null
) {
  const names = new Map(
    (managers || []).map((manager) => [
      manager.id,
      managerDisplayName(manager),
    ])
  );

  const mapped = (rows || []).map((row) => ({
    id: row.manager_id,
    name:
      names.get(row.manager_id) ||
      row.name ||
      "Без имени",
    applications: Number(
      row.applications || 0
    ),
    inProgress: Number(
      row.in_progress || 0
    ),
    opened: Number(row.opened || 0),
    rejected: Number(row.rejected || 0),
    totalAmount: Number(
      row.total_amount || 0
    ),
  }));

  if (managers.length > 0 && mapped.length === 0) {
    const scopedManagers = managerId
      ? managers.filter(
          (manager) => manager.id === managerId
        )
      : managers;

    return scopedManagers
      .map(emptyApplicationManagerRow)
      .sort((a, b) =>
        a.name.localeCompare(b.name, "ru")
      );
  }

  return mapped.sort((a, b) =>
    a.name.localeCompare(b.name, "ru")
  );
}

async function withTimeout(promise, label) {
  let timer = null;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(
        `${label}: превышено время ожидания`
      );
      error.code = "TIMEOUT";
      reject(error);
    }, QUERY_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      promise,
      timeout,
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function countExact(query) {
  try {
    const { count, error } =
      await withTimeout(
        query,
        "count"
      );

    return {
      count: count || 0,
      error,
    };
  } catch (error) {
    return {
      count: 0,
      error,
    };
  }
}

async function fetchAllPages(buildQuery) {
  const rows = [];
  let from = 0;

  while (from < 100000) {
    const { data, error } =
      await buildQuery().range(
        from,
        from + PAGE_SIZE - 1
      );

    if (error) {
      return {
        data: rows,
        error,
      };
    }

    const chunk = data || [];
    rows.push(...chunk);

    if (chunk.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return {
    data: rows,
    error: null,
  };
}

function managerDisplayName(profile) {
  return (
    profile?.full_name ||
    profile?.email ||
    "Без имени"
  );
}

export function emptyIncomingStats() {
  return {
    responded: 0,
    applications: 0,
    inProgress: 0,
    opened: 0,
    rejected: 0,
    managers: 0,
    external: 0,
  };
}

export function emptyApplicationStats() {
  return {
    total: 0,
    newApplications: 0,
    inProgress: 0,
    approved: 0,
    rejected: 0,
    opened: 0,
    totalAmount: 0,
  };
}

function isMissingRejectedAt(error) {
  const message = String(
    error?.message || ""
  ).toLowerCase();

  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    message.includes("rejected_at")
  );
}

function isMissingInProgressAt(error) {
  const message = String(
    error?.message || ""
  ).toLowerCase();

  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    message.includes("in_progress_at")
  );
}

async function tryRpc(name, params) {
  try {
    const { data, error } =
      await withTimeout(
        supabase.rpc(name, params),
        name
      );

    if (error) {
      return {
        data: null,
        error,
      };
    }

    return {
      data,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error,
    };
  }
}

function mapAnalyticsError(error) {
  if (!error) {
    return null;
  }

  const mapped = new Error(
    formatServiceError(
      error,
      "Не удалось загрузить аналитику"
    )
  );
  mapped.code = error.code;
  mapped.status = error.status;
  mapped.cause = error;

  return mapped;
}

export const analyticsService = {
  fetchAllPages,

  async getIncomingStats({
    managerId = null,
    dateFrom = null,
    dateTo = null,
  } = {}) {
    if (managerId !== "unassigned") {
      const rpc = await tryRpc(
        "get_crm_period_stats",
        {
          p_from: dateFrom,
          p_to: dateTo,
          p_manager_id: managerId,
        }
      );

      if (!rpc.error && rpc.data) {
        return {
          data: {
            responded: Number(
              rpc.data.responded || 0
            ),
            applications: Number(
              rpc.data.applications || 0
            ),
            inProgress: Number(
              rpc.data.in_progress || 0
            ),
            opened: Number(
              rpc.data.opened || 0
            ),
            rejected: Number(
              rpc.data.rejected || 0
            ),
            managers: Number(
              rpc.data.managers || 0
            ),
            external: Number(
              rpc.data.external || 0
            ),
          },
          error: null,
        };
      }
    }

    const [
      respondedResult,
      applicationsResult,
      inProgressResult,
      openedResult,
      rejectedResult,
      externalResult,
    ] = await Promise.all([
      countExact(
        applyManagerId(
          applyRange(
            supabase
              .from("mailing_contacts")
              .select("id", {
                count: "exact",
                head: true,
              })
              .not(
                "responded_at",
                "is",
                null
              ),
            "responded_at",
            dateFrom,
            dateTo
          ),
          "manager_id",
          managerId
        )
      ),
      countExact(
        applyManagerId(
          applyRange(
            supabase
              .from("applications")
              .select("id", {
                count: "exact",
                head: true,
              }),
            "created_at",
            dateFrom,
            dateTo
          ),
          "assigned_manager_id",
          managerId
        )
      ),
      countExact(
        applyManagerId(
          applyRange(
            supabase
              .from("applications")
              .select("id", {
                count: "exact",
                head: true,
              })
              .not(
                "in_progress_at",
                "is",
                null
              ),
            "in_progress_at",
            dateFrom,
            dateTo
          ),
          "assigned_manager_id",
          managerId
        )
      ),
      countExact(
        applyManagerId(
          applyRange(
            supabase
              .from("applications")
              .select("id", {
                count: "exact",
                head: true,
              })
              .not("opened_at", "is", null),
            "opened_at",
            dateFrom,
            dateTo
          ),
          "assigned_manager_id",
          managerId
        )
      ),
      countExact(
        applyManagerId(
          applyRange(
            supabase
              .from("applications")
              .select("id", {
                count: "exact",
                head: true,
              })
              .not(
                "rejected_at",
                "is",
                null
              ),
            "rejected_at",
            dateFrom,
            dateTo
          ),
          "assigned_manager_id",
          managerId
        )
      ),
      countExact(
        applyManagerId(
          applyRange(
            supabase
              .from("mailing_contacts")
              .select("id", {
                count: "exact",
                head: true,
              })
              .not(
                "responded_at",
                "is",
                null
              )
              .or(
                "is_external.eq.true,source.eq.external,mailing_id.is.null"
              ),
            "responded_at",
            dateFrom,
            dateTo
          ),
          "manager_id",
          managerId
        )
      ),
    ]);

    const firstError = [
      respondedResult.error,
      applicationsResult.error,
      inProgressResult.error,
      openedResult.error,
      rejectedResult.error,
      externalResult.error,
    ].find(
      (error) =>
        error &&
        !isMissingRejectedAt(error) &&
        !isMissingInProgressAt(error)
    );

    return {
      data: {
        responded:
          respondedResult.count,
        applications:
          applicationsResult.count,
        inProgress: isMissingInProgressAt(
          inProgressResult.error
        )
          ? 0
          : inProgressResult.count,
        opened: openedResult.count,
        rejected: isMissingRejectedAt(
          rejectedResult.error
        )
          ? 0
          : rejectedResult.count,
        managers: 0,
        external: externalResult.count,
      },
      error: firstError,
    };
  },

  async getApplicationStats({
    managerId = null,
    dateFrom = null,
    dateTo = null,
    productId = null,
  } = {}) {
    const scope = await resolveApplicationManagerScope(
      managerId
    );

    if (scope.error) {
      return {
        data: emptyApplicationStats(),
        error: mapAnalyticsError(scope.error),
      };
    }

    const scopedManagerId = scope.managerId;
    const productName = productId
      ? await resolveProductName(productId)
      : null;

    if (scopedManagerId !== "unassigned") {
      const rpcParams = {
        p_from: dateFrom,
        p_to: dateTo,
        p_manager_id:
          scopedManagerId &&
          scopedManagerId !== "unassigned"
            ? scopedManagerId
            : null,
        p_product_id: productId || null,
      };

      const rpc = await tryRpc(
        "get_application_period_stats",
        rpcParams
      );

      if (!rpc.error && rpc.data) {
        let payload = rpc.data;

        if (typeof payload === "string") {
          try {
            payload = JSON.parse(payload);
          } catch {
            payload = null;
          }
        }

        if (payload) {
          return {
            data: {
              total: Number(payload.total || 0),
              newApplications: Number(
                payload.new_applications || 0
              ),
              inProgress: Number(
                payload.in_progress || 0
              ),
              approved: Number(
                payload.opened || 0
              ),
              opened: Number(
                payload.opened || 0
              ),
              rejected: Number(
                payload.rejected || 0
              ),
              totalAmount: Number(
                payload.total_amount || 0
              ),
            },
            error: null,
          };
        }
      }
    }

    const createdBase = () =>
      applyProductId(
        applyManagerId(
          applyRange(
            supabase
              .from("applications")
              .select("id", {
                count: "exact",
                head: true,
              }),
            "created_at",
            dateFrom,
            dateTo
          ),
          "assigned_manager_id",
          scopedManagerId
        ),
        productId,
        productName
      );

    const [
      totalResult,
      inProgressResult,
      openedResult,
      rejectedEventResult,
      amountRpc,
    ] = await Promise.all([
      countExact(createdBase()),
      countExact(
        applyProductId(
          applyManagerId(
            applyRange(
              supabase
                .from("applications")
                .select("id", {
                  count: "exact",
                  head: true,
                })
                .not(
                  "in_progress_at",
                  "is",
                  null
                ),
              "in_progress_at",
              dateFrom,
              dateTo
            ),
            "assigned_manager_id",
            scopedManagerId
          ),
          productId,
          productName
        )
      ),
      countExact(
        applyProductId(
          applyManagerId(
            applyRange(
              supabase
                .from("applications")
                .select("id", {
                  count: "exact",
                  head: true,
                })
                .not("opened_at", "is", null),
              "opened_at",
              dateFrom,
              dateTo
            ),
            "assigned_manager_id",
            scopedManagerId
          ),
          productId,
          productName
        )
      ),
      countExact(
        applyProductId(
          applyManagerId(
            applyRange(
              supabase
                .from("applications")
                .select("id", {
                  count: "exact",
                  head: true,
                })
                .not(
                  "rejected_at",
                  "is",
                  null
                ),
              "rejected_at",
              dateFrom,
              dateTo
            ),
            "assigned_manager_id",
            scopedManagerId
          ),
          productId,
          productName
        )
      ),
      this.sumOpenedAmount({
        managerId: scopedManagerId,
        dateFrom,
        dateTo,
        productId,
        productName,
      }),
    ]);

    const firstError = [
      totalResult.error,
      isMissingInProgressAt(
        inProgressResult.error
      )
        ? null
        : inProgressResult.error,
      openedResult.error,
      isMissingRejectedAt(
        rejectedEventResult.error
      )
        ? null
        : rejectedEventResult.error,
    ].find(Boolean);

    return {
      data: {
        total: totalResult.count,
        newApplications: totalResult.count,
        inProgress: isMissingInProgressAt(
          inProgressResult.error
        )
          ? 0
          : inProgressResult.count,
        approved: openedResult.count,
        opened: openedResult.count,
        rejected: isMissingRejectedAt(
          rejectedEventResult.error
        )
          ? 0
          : rejectedEventResult.count,
        totalAmount: Number(
          amountRpc.data || 0
        ),
      },
      error: mapAnalyticsError(firstError),
    };
  },

  async sumOpenedAmount({
    managerId = null,
    dateFrom = null,
    dateTo = null,
    productId = null,
    productName = null,
  } = {}) {
    const scope = await resolveApplicationManagerScope(
      managerId
    );

    if (scope.error) {
      return {
        data: 0,
        error: mapAnalyticsError(scope.error),
      };
    }

    const scopedManagerId = scope.managerId;
    const resolvedProductName =
      productName ??
      (productId
        ? await resolveProductName(productId)
        : null);

    if (scopedManagerId !== "unassigned") {
      const rpcParams = {
        p_from: dateFrom,
        p_to: dateTo,
        p_manager_id:
          scopedManagerId &&
          scopedManagerId !== "unassigned"
            ? scopedManagerId
            : null,
        p_product_id: productId || null,
      };

      const rpc = await tryRpc(
        "sum_opened_amount",
        rpcParams
      );

      if (!rpc.error && rpc.data != null) {
        return {
          data: Number(rpc.data || 0),
          error: null,
        };
      }
    }

    const result = await fetchAllPages(
      () =>
        applyProductId(
          applyManagerId(
            applyRange(
              supabase
                .from("applications")
                .select(
                  "amount, opening_price_snapshot"
                )
                .eq("status", "approved")
                .not("opened_at", "is", null),
              "opened_at",
              dateFrom,
              dateTo
            ),
            "assigned_manager_id",
            scopedManagerId
          ),
          productId,
          resolvedProductName
        )
    );

    const total = (result.data || []).reduce(
      (sum, row) => sum + openedAmount(row),
      0
    );

    return {
      data: total,
      error: result.error,
    };
  },

  async getApplicationManagerAnalytics({
    managerId = null,
    dateFrom = null,
    dateTo = null,
    productId = null,
    managers = [],
  } = {}) {
    const scope = await resolveApplicationManagerScope(
      managerId
    );

    if (scope.error) {
      return {
        data: [],
        error: mapAnalyticsError(scope.error),
      };
    }

    const scopedManagerId = scope.managerId;

    if (scopedManagerId === "unassigned") {
      return {
        data: [],
        error: null,
      };
    }

    const productName = productId
      ? await resolveProductName(productId)
      : null;

    const rpc = await tryRpc(
      "get_application_manager_analytics",
      {
        p_from: dateFrom,
        p_to: dateTo,
        p_manager_id: scopedManagerId,
        p_product_id: productId || null,
      }
    );

    if (!rpc.error && Array.isArray(rpc.data)) {
      return {
        data: mapApplicationManagerRows(
          rpc.data,
          managers,
          scopedManagerId
        ),
        error: null,
      };
    }

    return this.aggregateApplicationManagerAnalytics({
      managerId: scopedManagerId,
      dateFrom,
      dateTo,
      productId,
      productName,
      managers,
    });
  },

  async aggregateApplicationManagerAnalytics({
    managerId = null,
    dateFrom = null,
    dateTo = null,
    productId = null,
    productName = null,
    managers = [],
  } = {}) {
    const resolvedProductName =
      productName ??
      (productId
        ? await resolveProductName(productId)
        : null);

    const scopedQuery = (query) =>
      applyProductId(
        applyManagerId(
          query,
          "assigned_manager_id",
          managerId
        ),
        productId,
        resolvedProductName
      );

    const [
      createdResult,
      inProgressResult,
      openedResult,
      rejectedResult,
    ] = await Promise.all([
      fetchAllPages(() =>
        scopedQuery(
          applyRange(
            supabase
              .from("applications")
              .select(
                "id, assigned_manager_id"
              ),
            "created_at",
            dateFrom,
            dateTo
          )
        )
      ),
      fetchAllPages(() =>
        scopedQuery(
          applyRange(
            supabase
              .from("applications")
              .select(
                "id, assigned_manager_id"
              )
              .not(
                "in_progress_at",
                "is",
                null
              ),
            "in_progress_at",
            dateFrom,
            dateTo
          )
        )
      ),
      fetchAllPages(() =>
        scopedQuery(
          applyRange(
            supabase
              .from("applications")
              .select(
                "id, assigned_manager_id, amount, opening_price_snapshot"
              )
              .eq("status", "approved")
              .not("opened_at", "is", null),
            "opened_at",
            dateFrom,
            dateTo
          )
        )
      ),
      fetchAllPages(() =>
        scopedQuery(
          applyRange(
            supabase
              .from("applications")
              .select("id, assigned_manager_id")
              .not("rejected_at", "is", null),
            "rejected_at",
            dateFrom,
            dateTo
          )
        )
      ),
    ]);

    const firstError =
      createdResult.error ||
      inProgressResult.error ||
      openedResult.error ||
      rejectedResult.error;

    const byId = new Map();

    const ensureRow = (id) => {
      if (!id) {
        return null;
      }

      if (!byId.has(id)) {
        const profile = (managers || []).find(
          (manager) => manager.id === id
        );

        byId.set(
          id,
          emptyApplicationManagerRow(
            profile || { id }
          )
        );
      }

      return byId.get(id);
    };

    for (const row of createdResult.data || []) {
      const item = ensureRow(
        row.assigned_manager_id
      );

      if (!item) {
        continue;
      }

      item.applications += 1;
    }

    for (const row of inProgressResult.data || []) {
      const item = ensureRow(
        row.assigned_manager_id
      );

      if (!item) {
        continue;
      }

      item.inProgress += 1;
    }

    for (const row of openedResult.data || []) {
      const item = ensureRow(
        row.assigned_manager_id
      );

      if (!item) {
        continue;
      }

      item.opened += 1;
      item.totalAmount += openedAmount(row);
    }

    for (const row of rejectedResult.data || []) {
      const item = ensureRow(
        row.assigned_manager_id
      );

      if (!item) {
        continue;
      }

      item.rejected += 1;
    }

    const scopedManagers = managerId
      ? (managers || []).filter(
          (manager) => manager.id === managerId
        )
      : managers || [];

    for (const manager of scopedManagers) {
      ensureRow(manager.id);
    }

    return {
      data: [...byId.values()].sort((a, b) =>
        a.name.localeCompare(b.name, "ru")
      ),
      error: mapAnalyticsError(firstError),
    };
  },

  async getManagerPeriodAnalytics({
    managerId = null,
    dateFrom = null,
    dateTo = null,
    managers = [],
  } = {}) {
    if (managerId === "unassigned") {
      return {
        data: [],
        error: null,
      };
    }

    const rpc = await tryRpc(
      "get_crm_manager_analytics",
      {
        p_from: dateFrom,
        p_to: dateTo,
        p_manager_id: managerId,
      }
    );

    if (!rpc.error && Array.isArray(rpc.data)) {
      const names = new Map(
        (managers || []).map((manager) => [
          manager.id,
          managerDisplayName(manager),
        ])
      );

      const rows = rpc.data.map((row) => ({
        id: row.manager_id,
        name:
          names.get(row.manager_id) ||
          row.name ||
          "Без имени",
        responded: Number(
          row.responded || 0
        ),
        applications: Number(
          row.applications || 0
        ),
        inProgress: Number(
          row.in_progress || 0
        ),
        opened: Number(row.opened || 0),
        rejected: Number(
          row.rejected || 0
        ),
      }));

      if (
        managers.length > 0 &&
        rows.length === 0
      ) {
        const scopedManagers = managerId
          ? managers.filter(
              (manager) =>
                manager.id === managerId
            )
          : managers;

        return {
          data: scopedManagers
            .map((manager) => ({
              id: manager.id,
              name: managerDisplayName(
                manager
              ),
              responded: 0,
              applications: 0,
              inProgress: 0,
              opened: 0,
              rejected: 0,
            }))
            .sort((a, b) =>
              a.name.localeCompare(
                b.name,
                "ru"
              )
            ),
          error: null,
        };
      }

      return {
        data: rows.sort((a, b) =>
          a.name.localeCompare(
            b.name,
            "ru"
          )
        ),
        error: null,
      };
    }

    return {
      data: [],
      error: mapAnalyticsError(
        rpc.error ||
          new Error(
            "Не удалось посчитать аналитику менеджеров"
          )
      ),
    };
  },
};
