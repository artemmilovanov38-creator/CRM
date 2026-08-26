import { supabase } from "../lib/supabase";

const PAGE_SIZE = 1000;

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

async function countExact(query) {
  const { count, error } = await query;

  return {
    count: count || 0,
    error,
  };
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
  const { data, error } =
    await supabase.rpc(name, params);

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
            data: null,
            error: { message: "skip" },
          })
        : tryRpc("sum_opened_amount", {
            p_from: dateFrom,
            p_to: dateTo,
            p_manager_id: managerId,
          }),
    ]);

    let totalAmount = Number(
      amountRpc.data || 0
    );

    if (amountRpc.error) {
      const amountRows =
        await fetchAllPages(() =>
          applyManagerId(
            applyRange(
              supabase
                .from("applications")
                .select(
                  "amount, opening_price_snapshot"
                )
                .not(
                  "opened_at",
                  "is",
                  null
                ),
              "opened_at",
              dateFrom,
              dateTo
            ),
            "assigned_manager_id",
            managerId
          )
        );

      totalAmount = (
        amountRows.data || []
      ).reduce((sum, row) => {
        const value =
          row.amount !== null &&
          row.amount !== undefined
            ? Number(row.amount)
            : Number(
                row.opening_price_snapshot ||
                  0
              );

        return (
          sum +
          (Number.isFinite(value)
            ? value
            : 0)
        );
      }, 0);
    }

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
        totalAmount,
      },
      error: firstError,
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
      const byId = new Map(
        rpc.data.map((row) => [
          row.manager_id,
          row,
        ])
      );

      const scopedManagers = managerId
        ? managers.filter(
            (manager) =>
              manager.id === managerId
          )
        : managers;

      const merged = scopedManagers.map(
        (manager) => {
          const row =
            byId.get(manager.id);

          return {
            id: manager.id,
            name: managerDisplayName(
              manager
            ),
            responded: Number(
              row?.responded || 0
            ),
            applications: Number(
              row?.applications || 0
            ),
            opened: Number(
              row?.opened || 0
            ),
            rejected: Number(
              row?.rejected || 0
            ),
          };
        }
      );

      return {
        data: merged.sort((a, b) =>
          a.name.localeCompare(
            b.name,
            "ru"
          )
        ),
        error: null,
      };
    }

    const scopedManagers = managerId
      ? managers.filter(
          (manager) =>
            manager.id === managerId
        )
      : managers;

    const rows = await Promise.all(
      scopedManagers.map(
        async (manager) => {
          const [
            responded,
            applications,
            opened,
            rejected,
          ] = await Promise.all([
            countExact(
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
                  .eq(
                    "manager_id",
                    manager.id
                  ),
                "responded_at",
                dateFrom,
                dateTo
              )
            ),
            countExact(
              applyRange(
                supabase
                  .from("applications")
                  .select("id", {
                    count: "exact",
                    head: true,
                  })
                  .eq(
                    "assigned_manager_id",
                    manager.id
                  ),
                "created_at",
                dateFrom,
                dateTo
              )
            ),
            countExact(
              applyRange(
                supabase
                  .from("applications")
                  .select("id", {
                    count: "exact",
                    head: true,
                  })
                  .eq(
                    "assigned_manager_id",
                    manager.id
                  )
                  .not(
                    "opened_at",
                    "is",
                    null
                  ),
                "opened_at",
                dateFrom,
                dateTo
              )
            ),
            countExact(
              applyRange(
                supabase
                  .from("applications")
                  .select("id", {
                    count: "exact",
                    head: true,
                  })
                  .eq(
                    "assigned_manager_id",
                    manager.id
                  )
                  .not(
                    "rejected_at",
                    "is",
                    null
                  ),
                "rejected_at",
                dateFrom,
                dateTo
              )
            ),
          ]);

          return {
            id: manager.id,
            name: managerDisplayName(
              manager
            ),
            responded: responded.count,
            applications:
              applications.count,
            opened: opened.count,
            rejected: rejected.count,
            error:
              responded.error ||
              applications.error ||
              opened.error ||
              rejected.error,
          };
        }
      )
    );

    return {
      data: rows
        .map(
          ({ error: _error, ...row }) =>
            row
        )
        .sort((a, b) =>
          a.name.localeCompare(
            b.name,
            "ru"
          )
        ),
      error: rows.find(
        (row) => row.error
      )?.error,
    };
  },
};
