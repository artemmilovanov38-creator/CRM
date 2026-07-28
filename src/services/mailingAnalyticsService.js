import { supabase } from "../lib/supabase";
import { mailingService } from "./mailingService";

function toNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function getConversion(value, total) {
  if (!total) {
    return 0;
  }

  return Number(
    ((value / total) * 100).toFixed(1)
  );
}

function getHoursBetween(start, end) {
  if (!start || !end) {
    return null;
  }

  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();

  if (
    Number.isNaN(startTime) ||
    Number.isNaN(endTime) ||
    endTime < startTime
  ) {
    return null;
  }

  return (
    (endTime - startTime) /
    (1000 * 60 * 60)
  );
}

function getAverage(values = []) {
  const validValues = values.filter(
    (value) =>
      value !== null &&
      Number.isFinite(value)
  );

  if (!validValues.length) {
    return 0;
  }

  const total = validValues.reduce(
    (sum, value) => sum + value,
    0
  );

  return Number(
    (total / validValues.length).toFixed(1)
  );
}

function getManagerName(manager) {
  if (!manager) {
    return "Не назначен";
  }

  return (
    manager.full_name ||
    manager.email ||
    "Не назначен"
  );
}

function getContactStatus(contact, application) {
  if (application?.status === "approved") {
    return "approved";
  }

  if (
    application?.status === "rejected" ||
    contact.status === "rejected"
  ) {
    return "rejected";
  }

  if (
    application ||
    contact.application_created_at ||
    contact.status === "application"
  ) {
    return "application";
  }

  if (
    contact.responded_at ||
    contact.status === "responded"
  ) {
    return "replied";
  }

  if (
    contact.sent_at ||
    contact.status === "sent"
  ) {
    return "sent";
  }

  if (
    contact.telegram_username ||
    contact.telegram_found === true
  ) {
    return "telegram_found";
  }

  if (contact.telegram_found === false) {
    return "telegram_not_found";
  }

  return contact.status || "new";
}

function getLastAction(
  contact,
  application
) {
  if (application?.status === "approved") {
    return {
      title: "Заявка успешно завершена",
      date:
        application.updated_at ||
        application.created_at,
      type: "approved",
    };
  }

  if (
    application?.status === "rejected" ||
    contact.status === "rejected"
  ) {
    return {
      title: "Заявка отклонена",
      date:
        application?.updated_at ||
        contact.updated_at,
      type: "rejected",
    };
  }

  if (application) {
    return {
      title: "Создана заявка",
      date:
        contact.application_created_at ||
        application.created_at,
      type: "application",
    };
  }

  if (contact.responded_at) {
    return {
      title: "Клиент ответил",
      date: contact.responded_at,
      type: "replied",
    };
  }

  if (contact.sent_at) {
    return {
      title: "Сообщение отправлено",
      date: contact.sent_at,
      type: "sent",
    };
  }

  if (
    contact.telegram_username ||
    contact.telegram_found === true
  ) {
    return {
      title: "Telegram найден",
      date:
        contact.updated_at ||
        contact.created_at,
      type: "telegram_found",
    };
  }

  return {
    title: "Контакт загружен",
    date: contact.created_at,
    type: "created",
  };
}

function createActivity(
  contacts,
  applications
) {
  const events = [];

  contacts.forEach((contact) => {
    const username =
      contact.telegram_username
        ? `@${String(
            contact.telegram_username
          ).replace(/^@/, "")}`
        : contact.full_name ||
          contact.phone ||
          "Контакт";

    if (contact.sent_at) {
      events.push({
        id: `sent-${contact.id}`,
        title: "Сообщение отправлено",
        description: username,
        date: contact.sent_at,
        type: "sent",
      });
    }

    if (contact.responded_at) {
      events.push({
        id: `responded-${contact.id}`,
        title: "Получен ответ",
        description: username,
        date: contact.responded_at,
        type: "replied",
      });
    }
  });

  applications.forEach((application) => {
    const clientName =
      application.telegram ||
      application.full_name ||
      application.phone ||
      "Клиент";

    events.push({
      id: `application-${application.id}`,
      title:
        application.status === "approved"
          ? "Заявка успешно завершена"
          : application.status === "rejected"
            ? "Заявка отклонена"
            : "Создана заявка",

      description: [
        clientName,
        application.product,
      ]
        .filter(Boolean)
        .join(" · "),

      date:
        application.updated_at ||
        application.created_at,

      type:
        application.status === "approved"
          ? "approved"
          : application.status === "rejected"
            ? "rejected"
            : "application",
    });
  });

  return events
    .filter((event) => event.date)
    .sort(
      (first, second) =>
        new Date(second.date).getTime() -
        new Date(first.date).getTime()
    )
    .slice(0, 30);
}


function createManagerStats(
  contacts,
  applications,
  managerMap
) {
  const statsMap = new Map();

  function ensureManager(managerId) {
    const key = managerId || "unassigned";

    if (!statsMap.has(key)) {
      const manager = managerMap.get(managerId);

      statsMap.set(key, {
        id: managerId || null,
        name: managerId
          ? getManagerName(manager)
          : "Не назначен",

        assigned: 0,
        sent: 0,
        responded: 0,
        applications: 0,
        approved: 0,
        rejected: 0,
      });
    }

    return statsMap.get(key);
  }

  contacts.forEach((contact) => {
    const managerStats = ensureManager(
      contact.manager_id
    );

    managerStats.assigned += 1;

    if (
      contact.sent_at ||
      [
        "sent",
        "responded",
        "application",
        "opened",
      ].includes(contact.status)
    ) {
      managerStats.sent += 1;
    }

    if (
      contact.responded_at ||
      [
        "responded",
        "application",
        "opened",
      ].includes(contact.status)
    ) {
      managerStats.responded += 1;
    }
  });

  applications.forEach((application) => {
    const managerStats = ensureManager(
      application.assigned_manager_id
    );

    managerStats.applications += 1;

    if (application.status === "approved") {
      managerStats.approved += 1;
    }

    if (application.status === "rejected") {
      managerStats.rejected += 1;
    }
  });

  return [...statsMap.values()]
    .map((manager) => ({
      ...manager,

      responseConversion: getConversion(
        manager.responded,
        manager.sent
      ),

      applicationConversion: getConversion(
        manager.applications,
        manager.responded
      ),

      approvalConversion: getConversion(
        manager.approved,
        manager.applications
      ),
    }))
    .sort((first, second) => {
      if (first.id === null) {
        return 1;
      }

      if (second.id === null) {
        return -1;
      }

      return (
        second.responded -
        first.responded
      );
    });
}
function calculateMetrics(
  mailing,
  contacts,
  applications
) {
  const sentContacts = contacts.filter(
    (contact) =>
      contact.sent_at ||
      [
        "sent",
        "responded",
        "application",
        "opened",
      ].includes(contact.status)
  );

  const respondedContacts = contacts.filter(
    (contact) =>
      contact.responded_at ||
      [
        "responded",
        "application",
        "opened",
      ].includes(contact.status)
  );

  const telegramFound = contacts.filter(
    (contact) =>
      contact.telegram_found === true ||
      contact.telegram_username
  ).length;

  const telegramNotFound = contacts.filter(
    (contact) =>
      contact.telegram_found === false &&
      !contact.telegram_username
  ).length;

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

  const revenue =
    approvedApplications.reduce(
      (sum, application) =>
        sum + toNumber(application.amount),
      0
    );

  const purchaseCost = toNumber(
    mailing.purchase_cost
  );

  const profit = revenue - purchaseCost;

  const responseHours = contacts.map(
    (contact) =>
      getHoursBetween(
        contact.sent_at,
        contact.responded_at
      )
  );

  const applicationHours = contacts.map(
    (contact) =>
      getHoursBetween(
        contact.sent_at,
        contact.application_created_at
      )
  );

  const uploaded = contacts.length;
  const sent = sentContacts.length;
  const responded = respondedContacts.length;
  const noReply = contacts.filter(
  (contact) =>
    !contact.responded_at &&
    ![
      "responded",
      "application",
      "opened",
    ].includes(contact.status)
).length;

const unassigned = contacts.filter(
  (contact) => !contact.manager_id
).length;
  const applicationCount =
    applications.length;
  const approved =
    approvedApplications.length;
  const rejected =
    rejectedApplications.length;

  return {
  uploaded,
  telegramFound,
  telegramNotFound,
  sent,
  responded,
  noReply,
  unassigned,
  applications: applicationCount,
  approved,
  rejected,

    sentConversion: getConversion(
      sent,
      uploaded
    ),

    responseConversion: getConversion(
      responded,
      sent
    ),

    applicationConversion: getConversion(
      applicationCount,
      responded
    ),

    saleConversion: getConversion(
      approved,
      applicationCount
    ),

    totalSaleConversion: getConversion(
      approved,
      uploaded
    ),

    purchaseCost,
    revenue,
    profit,

    costPerApplication:
      applicationCount > 0
        ? Number(
            (
              purchaseCost /
              applicationCount
            ).toFixed(2)
          )
        : 0,

    costPerSale:
      approved > 0
        ? Number(
            (
              purchaseCost /
              approved
            ).toFixed(2)
          )
        : 0,

    roi:
      purchaseCost > 0
        ? Number(
            (
              (profit / purchaseCost) *
              100
            ).toFixed(1)
          )
        : 0,

    averageResponseHours:
      getAverage(responseHours),

    averageApplicationHours:
      getAverage(applicationHours),
  };
}

export const mailingAnalyticsService = {
  async getMailingAnalytics(mailingId) {
    if (!mailingId) {
      return {
        data: null,
        error: new Error(
          "Не передан ID партии"
        ),
      };
    }

    const {
      data: mailing,
      error: mailingError,
    } =
      await mailingService.getMailingById(
        mailingId
      );

    if (mailingError || !mailing) {
      return {
        data: null,
        error:
          mailingError ||
          new Error(
            "Партия не найдена"
          ),
      };
    }

    const {
      data: contacts,
      error: contactsError,
    } = await supabase
      .from("mailing_contacts")
      .select(`
        id,
        mailing_id,
        full_name,
        phone,
        email,
        telegram_username,
        telegram_found,
        status,
        manager_id,
        sent_at,
        responded_at,
        application_created_at,
        created_at,
        updated_at
      `)
      .eq("mailing_id", mailingId)
      .order("created_at", {
        ascending: false,
      });

    if (contactsError) {
      return {
        data: null,
        error: contactsError,
      };
    }

    const contactIds = (
      contacts || []
    ).map((contact) => contact.id);

    let applications = [];

    if (contactIds.length > 0) {
      const {
        data: applicationRows,
        error: applicationsError,
      } = await supabase
        .from("applications")
        .select(`
          id,
          mailing_contact_id,
          full_name,
          phone,
          telegram,
          product,
          status,
          assigned_manager_id,
          amount,
          comment,
          created_at,
          updated_at
        `)
        .in(
          "mailing_contact_id",
          contactIds
        )
        .order("created_at", {
          ascending: false,
        });

      if (applicationsError) {
        return {
          data: null,
          error: applicationsError,
        };
      }

      applications =
        applicationRows || [];
    }

    const managerIds = [
      ...(contacts || []).map(
        (contact) => contact.manager_id
      ),
      ...applications.map(
        (application) =>
          application.assigned_manager_id
      ),
    ].filter(Boolean);

    const uniqueManagerIds = [
      ...new Set(managerIds),
    ];

    let managers = [];

    if (uniqueManagerIds.length > 0) {
      const {
        data: managerRows,
        error: managersError,
      } = await supabase
        .from("profiles")
        .select(`
          id,
          full_name,
          email
        `)
        .in("id", uniqueManagerIds);

      if (managersError) {
        console.error(
          "Ошибка загрузки менеджеров:",
          managersError
        );
      } else {
        managers = managerRows || [];
      }
    }

    const managerMap = new Map(
      managers.map((manager) => [
        manager.id,
        manager,
      ])
    );

    const applicationByContact =
      new Map(
        applications.map(
          (application) => [
            application.mailing_contact_id,
            application,
          ]
        )
      );

    const preparedContacts = (
      contacts || []
    ).map((contact) => {
      const application =
        applicationByContact.get(
          contact.id
        );

      const managerId =
        application?.assigned_manager_id ||
        contact.manager_id;

      const manager =
        managerMap.get(managerId);

      const lastAction = getLastAction(
        contact,
        application
      );

      return {
        ...contact,

        username:
          contact.telegram_username
            ? `@${String(
                contact.telegram_username
              ).replace(/^@/, "")}`
            : contact.full_name ||
              "Без имени",

        status: getContactStatus(
          contact,
          application
        ),

        product:
          application?.product ||
          "Не выбран",

        manager:
          getManagerName(manager),

        application:
          application || null,

        lastAction:
          lastAction.title,

        lastActionDate:
          lastAction.date,

        lastActionType:
          lastAction.type,
      };
    });

    const metrics = calculateMetrics(
      mailing,
      contacts || [],
      applications
    );

   const managerStats = createManagerStats(
  contacts || [],
  applications,
  managerMap
);

    return {
  data: {
    mailing,
    contacts: preparedContacts,
    applications,
    activity,
    metrics,
    managerStats,
  },
  error: null,
};
  },
};