import { supabase } from "../lib/supabase";
import { getApplicationPayout } from "./applicationService";
import { buildApplicationTimeline } from "../utils/applicationEvents";

const PAGE_SIZE = 50;

const WRITER_FIELDS = `
  id,
  mailing_id,
  telegram_username,
  phone,
  full_name,
  manager_id,
  is_external,
  source,
  responded_at,
  created_at,
  mailing:mailings (
    id,
    name
  ),
  manager:profiles (
    id,
    full_name,
    email
  )
`;

const APPLICATION_FIELDS = `
  id,
  mailing_contact_id,
  created_at,
  status,
  product,
  product_id,
  comment,
  pp_id,
  amount,
  opening_price_snapshot,
  opened_at,
  approved_at,
  rejected_at,
  in_progress_at,
  assigned_manager_id,
  product_data:products (
    id,
    name,
    opening_price
  )
`;

const PRIVILEGED_ROLES = ["admin", "head"];

function createServiceError(message) {
  return new Error(message);
}

function isPrivilegedRole(role) {
  return PRIVILEGED_ROLES.includes(role);
}

async function getCurrentActor() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      user: null,
      profile: null,
      error:
        userError ||
        createServiceError(
          "Пользователь не авторизован"
        ),
    };
  }

  const { data: profile, error } =
    await supabase
      .from("profiles")
      .select("id, role, status")
      .eq("id", user.id)
      .maybeSingle();

  if (error) {
    return {
      user,
      profile: null,
      error,
    };
  }

  return {
    user,
    profile,
    error: null,
  };
}

function emptyStats() {
  return {
    responded: 0,
    applications: 0,
    inProgress: 0,
    opened: 0,
    rejected: 0,
    managers: 0,
  };
}

function isExternalContact(contact) {
  return Boolean(
    contact?.is_external ||
      !contact?.mailing_id ||
      contact?.source === "external"
  );
}

function getContactIdentifier(contact) {
  const telegram = String(
    contact?.telegram_username || ""
  )
    .trim()
    .replace(/^@+/, "");

  if (telegram) {
    return `@${telegram}`;
  }

  if (contact?.phone) {
    return String(contact.phone);
  }

  return contact?.full_name || "Без идентификатора";
}

function getMailingLabel(contact) {
  if (isExternalContact(contact)) {
    return "Вне рассылки";
  }

  return contact?.mailing?.name || "Рассылка";
}

function getManagerName(manager) {
  return (
    manager?.full_name ||
    manager?.email ||
    "Не указан"
  );
}

function applyRespondedRange(query, dateFrom, dateTo) {
  let next = query.not("responded_at", "is", null);

  if (dateFrom) {
    next = next.gte("responded_at", dateFrom);
  }

  if (dateTo) {
    next = next.lt("responded_at", dateTo);
  }

  return next;
}

function applyWriterFilters(
  query,
  { managerId, mailingId, externalOnly }
) {
  let next = query;

  if (managerId) {
    next = next.eq("manager_id", managerId);
  }

  if (externalOnly) {
    next = next.or(
      "is_external.eq.true,mailing_id.is.null,source.eq.external"
    );
  } else if (mailingId) {
    next = next.eq("mailing_id", mailingId);
  }

  return next;
}

async function resolveScope({
  managerId = null,
  mailingId = null,
} = {}) {
  const actor = await getCurrentActor();

  if (!actor.profile) {
    return {
      actor,
      managerId: null,
      mailingId: null,
      externalOnly: false,
      error:
        actor.error ||
        createServiceError(
          "Не удалось определить пользователя"
        ),
    };
  }

  const privileged = isPrivilegedRole(
    actor.profile.role
  );

  let scopedManagerId = null;

  if (!privileged) {
    scopedManagerId = actor.profile.id;
  } else if (
    managerId &&
    managerId !== "all"
  ) {
    scopedManagerId = managerId;
  }

  let scopedMailingId = null;
  let externalOnly = false;

  if (mailingId === "external") {
    externalOnly = true;
  } else if (
    mailingId &&
    mailingId !== "all"
  ) {
    scopedMailingId = mailingId;
  }

  return {
    actor,
    managerId: scopedManagerId,
    mailingId: scopedMailingId,
    externalOnly,
    error: null,
  };
}

async function countExact(query) {
  const { count, error } = await query;

  return {
    count: count || 0,
    error,
  };
}

async function getStatsFallback({
  dateFrom,
  dateTo,
  managerId,
  mailingId,
  externalOnly,
}) {
  const writersQuery = applyWriterFilters(
    applyRespondedRange(
      supabase.from("mailing_contacts").select("id", {
        count: "exact",
        head: true,
      }),
      dateFrom,
      dateTo
    ),
    { managerId, mailingId, externalOnly }
  );

  function applicationQuery(column) {
    let query = supabase
      .from("applications")
      .select("id", {
        count: "exact",
        head: true,
      });

    if (column !== "created_at") {
      query = query.not(column, "is", null);
    }

    if (dateFrom) {
      query = query.gte(column, dateFrom);
    }

    if (dateTo) {
      query = query.lt(column, dateTo);
    }

    if (managerId) {
      query = query.eq(
        "assigned_manager_id",
        managerId
      );
    }

    if (externalOnly) {
      query = query.or(
        "mailing_id.is.null"
      );
    } else if (mailingId) {
      query = query.eq("mailing_id", mailingId);
    }

    return query;
  }

  const [
    respondedResult,
    applicationsResult,
    inProgressResult,
    openedResult,
    rejectedResult,
  ] = await Promise.all([
    countExact(writersQuery),
    countExact(applicationQuery("created_at")),
    countExact(applicationQuery("in_progress_at")),
    countExact(applicationQuery("opened_at")),
    countExact(applicationQuery("rejected_at")),
  ]);

  const firstError = [
    respondedResult.error,
    applicationsResult.error,
    inProgressResult.error,
    openedResult.error,
    rejectedResult.error,
  ].find(Boolean);

  let managersCount = 0;

  if (!mailingId && !externalOnly) {
    const { data: periodStats } = await supabase.rpc(
      "get_crm_period_stats",
      {
        p_from: dateFrom,
        p_to: dateTo,
        p_manager_id: managerId,
      }
    );

    managersCount = Number(periodStats?.managers || 0);
  }

  return {
    data: {
      responded: respondedResult.count,
      applications: applicationsResult.count,
      inProgress: inProgressResult.count,
      opened: openedResult.count,
      rejected: rejectedResult.count,
      managers: managersCount,
    },
    error: firstError || null,
  };
}

function mapApplications(rows = []) {
  return [...rows]
    .sort((left, right) => {
      const leftTime = new Date(
        left.created_at || 0
      ).getTime();
      const rightTime = new Date(
        right.created_at || 0
      ).getTime();

      return leftTime - rightTime;
    })
    .map((application) => ({
      ...application,
      productName:
        application.product_data?.name ||
        application.product ||
        "Без продукта",
      payout: getApplicationPayout(application),
      openedAt:
        application.opened_at ||
        application.approved_at ||
        null,
    }));
}

export const writersDashboardService = {
  pageSize: PAGE_SIZE,
  emptyStats,

  async getMailingOptions() {
    const { data, error } = await supabase
      .from("mailings")
      .select("id, name, created_at")
      .order("created_at", {
        ascending: false,
      });

    return {
      data: data || [],
      error,
    };
  },

  async getStats({
    managerId = null,
    mailingId = null,
    dateFrom = null,
    dateTo = null,
  } = {}) {
    const scope = await resolveScope({
      managerId,
      mailingId,
    });

    if (scope.error) {
      return {
        data: emptyStats(),
        error: scope.error,
      };
    }

    const { data, error } = await supabase.rpc(
      "get_responded_writers_stats",
      {
        p_from: dateFrom,
        p_to: dateTo,
        p_manager_id: scope.managerId,
        p_mailing_id: scope.mailingId,
        p_external_only: scope.externalOnly,
      }
    );

    if (!error && data) {
      return {
        data: {
          responded: Number(data.responded || 0),
          applications: Number(data.applications || 0),
          inProgress: Number(data.in_progress || 0),
          opened: Number(data.opened || 0),
          rejected: Number(data.rejected || 0),
          managers: Number(data.managers || 0),
        },
        error: null,
      };
    }

    return getStatsFallback({
      dateFrom,
      dateTo,
      managerId: scope.managerId,
      mailingId: scope.mailingId,
      externalOnly: scope.externalOnly,
    });
  },

  async getWriters({
    managerId = null,
    mailingId = null,
    dateFrom = null,
    dateTo = null,
    page = 1,
    pageSize = PAGE_SIZE,
  } = {}) {
    const scope = await resolveScope({
      managerId,
      mailingId,
    });

    if (scope.error) {
      return {
        data: [],
        count: 0,
        page: 1,
        pageSize,
        error: scope.error,
      };
    }

    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(
      100,
      Math.max(10, Number(pageSize) || PAGE_SIZE)
    );
    const from = (safePage - 1) * safePageSize;
    const to = from + safePageSize - 1;

    const listQuery = applyWriterFilters(
      applyRespondedRange(
        supabase
          .from("mailing_contacts")
          .select(WRITER_FIELDS, {
            count: "exact",
          })
          .order("responded_at", {
            ascending: false,
          }),
        dateFrom,
        dateTo
      ),
      {
        managerId: scope.managerId,
        mailingId: scope.mailingId,
        externalOnly: scope.externalOnly,
      }
    );

    const { data, error, count } =
      await listQuery.range(from, to);

    if (error) {
      return {
        data: [],
        count: 0,
        page: safePage,
        pageSize: safePageSize,
        error,
      };
    }

    const contacts = data || [];
    const contactIds = contacts.map(
      (contact) => contact.id
    );

    let applicationsByContact = new Map();

    if (contactIds.length > 0) {
      const {
        data: applications,
        error: applicationsError,
      } = await supabase
        .from("applications")
        .select(APPLICATION_FIELDS)
        .in("mailing_contact_id", contactIds)
        .order("created_at", {
          ascending: true,
        });

      if (applicationsError) {
        return {
          data: [],
          count: count || 0,
          page: safePage,
          pageSize: safePageSize,
          error: applicationsError,
        };
      }

      applicationsByContact = new Map();

      (applications || []).forEach((application) => {
        const key = application.mailing_contact_id;
        const current =
          applicationsByContact.get(key) || [];
        current.push(application);
        applicationsByContact.set(key, current);
      });
    }

    return {
      data: contacts.map((contact) => {
        const applications = mapApplications(
          applicationsByContact.get(contact.id) || []
        ).map((application) => ({
          ...application,
          timeline: buildApplicationTimeline({
            application,
            contact,
          }),
        }));

        return {
          ...contact,
          identifier: getContactIdentifier(contact),
          mailingName: getMailingLabel(contact),
          managerName: getManagerName(contact.manager),
          isExternal: isExternalContact(contact),
          applications,
          applicationsCount: applications.length,
          firstApplicationAt:
            applications[0]?.created_at || null,
        };
      }),
      count: count || 0,
      page: safePage,
      pageSize: safePageSize,
      error: null,
    };
  },
};
