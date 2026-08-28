import { supabase } from "../lib/supabase";
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
      openedResult.error,
      rejectedResult.error,
      externalResult.error,
    ].find(
      (error) =>
        error &&
        !isMissingRejectedAt(error)
    );

    return {
      data: {
        responded:
          respondedResult.count,
        applications:
          applicationsResult.count,
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
  } = {}) {
    if (managerId !== "unassigned") {
      const rpc = await tryRpc(
        "get_application_period_stats",
        {
          p_from: dateFrom,
          p_to: dateTo,
          p_manager_id: managerId,
        }
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
      );

    const [
      totalResult,
      newResult,
      inProgressResult,
      waitingResult,
      openedResult,
      rejectedEventResult,
      amountRpc,
    ] = await Promise.all([
      countExact(createdBase()),
      countExact(
        createdBase().eq("status", "new")
      ),
      countExact(
        createdBase().eq(
          "status",
          "in_progress"
        )
      ),
      countExact(
        createdBase().eq("status", "waiting")
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
      managerId === "unassigned"
        ? Promise.resolve({
            data: 0,
            error: null,
          })
        : tryRpc("sum_opened_amount", {
            p_from: dateFrom,
            p_to: dateTo,
            p_manager_id: managerId,
          }),
    ]);

    const firstError = [
      totalResult.error,
      newResult.error,
      inProgressResult.error,
      waitingResult.error,
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
        newApplications:
          newResult.count +
          waitingResult.count,
        inProgress:
          inProgressResult.count,
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
