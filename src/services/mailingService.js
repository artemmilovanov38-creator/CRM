import { supabase } from "../lib/supabase";

const MAILING_FIELDS = `
  id,
  name,
  supplier,
  purchase_cost,
  total_leads,
  telegram_found_count,
  telegram_not_found_count,
  distributed_count,
  sent_count,
  responded_count,
  applications_count,
  openings_count,
  mailing_method,
  status,
  comment,
  created_by,
  created_at,
  updated_at,
  started_at,
  completed_at
`;

/**
 * Преобразуем новый формат базы данных
 * в формат, который сейчас использует Mailings.jsx.
 */
function mapMailingFromDatabase(row) {
  if (!row) {
    return null;
  }

  const uiStatus =
    row.status === "running"
      ? "active"
      : row.status;

  return {
    ...row,

    // Старые названия для существующего интерфейса.
    title: row.name || "Без названия",
    channel: row.mailing_method || "Telegram",
    source: row.supplier || "Источник не указан",

    uploaded: Number(row.total_leads || 0),
    delivered: Number(row.sent_count || 0),
    replied: Number(row.responded_count || 0),
    applications: Number(
      row.applications_count || 0
    ),
    openings: Number(row.openings_count || 0),

    status: uiStatus,

    // Пока менеджер не хранится непосредственно в партии.
    manager: null,
    manager_id: "",

    message: row.comment || "",
    scheduled_at: row.started_at || "",
  };
}

function getContactStatistics(contacts = []) {
  return contacts.reduce(
    (statistics, contact) => {
      statistics.uploaded += 1;

      if (
        contact.telegram_found === true ||
        contact.telegram_username
      ) {
        statistics.telegramFound += 1;
      }

      if (
        contact.telegram_found === false &&
        !contact.telegram_username
      ) {
        statistics.telegramNotFound += 1;
      }

      if (
        contact.sent_at ||
        [
          "sent",
          "responded",
          "application",
          "opened",
        ].includes(contact.status)
      ) {
        statistics.sent += 1;
      }

      if (
        contact.responded_at ||
        [
          "responded",
          "application",
          "opened",
        ].includes(contact.status)
      ) {
        statistics.responded += 1;
      }

      if (
        contact.application_created_at ||
        ["application", "opened"].includes(
          contact.status
        )
      ) {
        statistics.applications += 1;
      }

    if (contact.status === "opened") {
        statistics.openings += 1;
      }

      if (contact.status === "rejected") {
        statistics.rejected += 1;
      }

      return statistics;
    },
    {
      uploaded: 0,
      telegramFound: 0,
      telegramNotFound: 0,
      sent: 0,
      responded: 0,
      applications: 0,
      openings: 0,
      rejected: 0,
    }
  );
}

/**
 * Преобразуем данные формы Mailings.jsx
 * в настоящий формат таблицы Supabase.
 */
function mapMailingToDatabase(values = {}) {
  const databaseStatus =
    values.status === "active"
      ? "running"
      : values.status || "draft";

  return {
    name:
      values.name?.trim() ||
      values.title?.trim() ||
      null,

    supplier:
      values.supplier?.trim() ||
      values.source?.trim() ||
      null,

    purchase_cost: Number(
      values.purchase_cost || 0
    ),

    total_leads: Number(
      values.total_leads ??
        values.uploaded ??
        0
    ),

    telegram_found_count: Number(
      values.telegram_found_count || 0
    ),

    telegram_not_found_count: Number(
      values.telegram_not_found_count || 0
    ),

    distributed_count: Number(
      values.distributed_count || 0
    ),

    sent_count: Number(
      values.sent_count ??
        values.delivered ??
        0
    ),

    responded_count: Number(
      values.responded_count ??
        values.replied ??
        0
    ),

    applications_count: Number(
      values.applications_count ??
        values.applications ??
        0
    ),

    openings_count: Number(
      values.openings_count ??
        values.openings ??
        0
    ),

    mailing_method:
      values.mailing_method?.trim() ||
      values.channel?.trim() ||
      "Telegram",

    status: databaseStatus,

    comment:
      values.comment?.trim() ||
      values.message?.trim() ||
      null,

    started_at:
      values.started_at ||
      values.scheduled_at ||
      null,

    completed_at:
      values.completed_at || null,
  };
}
const deleteMailing = async (mailingId) => {
  if (!mailingId) {
    return {
      success: false,
      error: new Error(
        "Не передан ID рассылки"
      ),
    };
  }

  /*
   * Сначала проверяем, есть ли заявки,
   * связанные с этой рассылкой.
   */
  const {
    count: applicationsCount,
    error: applicationsError,
  } = await supabase
    .from("applications")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("mailing_id", mailingId);

  if (applicationsError) {
    return {
      success: false,
      error: applicationsError,
    };
  }

  /*
   * Если по рассылке уже есть заявки,
   * полностью удалять её опасно.
   */
  if ((applicationsCount || 0) > 0) {
    return {
      success: false,
      error: new Error(
        `Нельзя удалить рассылку: с ней связано заявок — ${
          applicationsCount || 0
        }. Сначала архивируйте её.`
      ),
    };
  }

  const {
    error: contactsDeleteError,
  } = await supabase
    .from("mailing_contacts")
    .delete()
    .eq("mailing_id", mailingId);

  if (contactsDeleteError) {
    return {
      success: false,
      error: contactsDeleteError,
    };
  }

  const {
    error: mailingDeleteError,
  } = await supabase
    .from("mailings")
    .delete()
    .eq("id", mailingId);

  if (mailingDeleteError) {
    return {
      success: false,
      error: mailingDeleteError,
    };
  }

  return {
    success: true,
    error: null,
  };
};


export const mailingService = {
  /**
   * Получить все партии.
   */
  async getMailings() {
  /*
   * ============================================
   * 1. ПОЛУЧАЕМ САМИ РАССЫЛКИ
   * ============================================
   */

  const {
    data: mailings,
    error: mailingsError,
  } = await supabase
    .from("mailings")
    .select(MAILING_FIELDS)
    .order("created_at", {
      ascending: false,
    });

  if (mailingsError) {
    return {
      data: [],
      error: mailingsError,
    };
  }

  if (!mailings?.length) {
    return {
      data: [],
      error: null,
    };
  }

  /*
   * ============================================
   * 2. СЧИТАЕМ СТАТИСТИКУ КАЖДОЙ РАССЫЛКИ
   * ============================================
   *
   * ВАЖНО:
   *
   * Больше НЕ загружаем все mailing_contacts
   * одним большим запросом.
   *
   * Вместо этого PostgreSQL считает количество
   * на сервере через count: "exact".
   *
   * Поэтому 1000 / 5000 / 50000 контактов
   * будут считаться корректно.
   */

  const preparedMailings =
    await Promise.all(
      mailings.map(async (mailing) => {
        /*
         * ----------------------------------------
         * ВСЕ ЗАГРУЖЕННЫЕ
         * ----------------------------------------
         */

        const {
          count: uploadedCount,
          error: uploadedError,
        } = await supabase
          .from("mailing_contacts")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq(
            "mailing_id",
            mailing.id
          );

        if (uploadedError) {
          throw uploadedError;
        }

        /*
         * ----------------------------------------
         * TELEGRAM НАЙДЕН
         * ----------------------------------------
         *
         * Считаем контакт найденным, если:
         *
         * telegram_found = true
         *
         * ИЛИ
         *
         * telegram_username заполнен.
         */

        const {
          count: telegramFoundByFlag,
          error:
            telegramFoundByFlagError,
        } = await supabase
          .from("mailing_contacts")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq(
            "mailing_id",
            mailing.id
          )
          .eq(
            "telegram_found",
            true
          );

        if (
          telegramFoundByFlagError
        ) {
          throw telegramFoundByFlagError;
        }

        /*
         * В большинстве импортированных нами
         * Telegram-контактов telegram_found уже
         * выставляется true.
         *
         * Поэтому основной показатель берём
         * именно по флагу.
         */

        /*
         * ----------------------------------------
         * TELEGRAM НЕ НАЙДЕН
         * ----------------------------------------
         */

        const {
          count:
            telegramNotFoundCount,
          error:
            telegramNotFoundError,
        } = await supabase
          .from("mailing_contacts")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq(
            "mailing_id",
            mailing.id
          )
          .eq(
            "telegram_found",
            false
          )
          .is(
            "telegram_username",
            null
          );

        if (
          telegramNotFoundError
        ) {
          throw telegramNotFoundError;
        }

        /*
         * ----------------------------------------
         * ОТПРАВЛЕНО
         * ----------------------------------------
         *
         * Раньше считалось:
         *
         * sent_at существует
         * ИЛИ статус:
         *
         * sent
         * responded
         * application
         * opened
         *
         * Чтобы не потерять старые записи,
         * считаем по статусам.
         */

        const {
          count: sentCount,
          error: sentError,
        } = await supabase
          .from("mailing_contacts")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq(
            "mailing_id",
            mailing.id
          )
          .in("status", [
            "sent",
            "responded",
            "application",
            "opened",
          ]);

        if (sentError) {
          throw sentError;
        }

        /*
         * ----------------------------------------
         * ОТВЕТИЛИ
         * ----------------------------------------
         */

        const {
          count: respondedCount,
          error: respondedError,
        } = await supabase
          .from("mailing_contacts")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq(
            "mailing_id",
            mailing.id
          )
          .in("status", [
            "responded",
            "application",
            "opened",
          ]);

        if (respondedError) {
          throw respondedError;
        }

        /*
         * ----------------------------------------
         * ЗАЯВКИ
         * ----------------------------------------
         */

        const {
          count: applicationsCount,
          error: applicationsError,
        } = await supabase
          .from("mailing_contacts")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq(
            "mailing_id",
            mailing.id
          )
          .in("status", [
            "application",
            "opened",
          ]);

        if (applicationsError) {
          throw applicationsError;
        }

        /*
         * ----------------------------------------
         * ОТКРЫТИЯ
         * ----------------------------------------
         */

        const {
          count: openingsCount,
          error: openingsError,
        } = await supabase
          .from("mailing_contacts")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq(
            "mailing_id",
            mailing.id
          )
          .eq(
            "status",
            "opened"
          );

        if (openingsError) {
          throw openingsError;
        }

        /*
         * ----------------------------------------
         * ОТКАЗЫ
         * ----------------------------------------
         */

        const {
          count: rejectedCount,
          error: rejectedError,
        } = await supabase
          .from("mailing_contacts")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq(
            "mailing_id",
            mailing.id
          )
          .eq(
            "status",
            "rejected"
          );

        if (rejectedError) {
          throw rejectedError;
        }

        /*
         * ----------------------------------------
         * ПРЕОБРАЗОВЫВАЕМ РАССЫЛКУ
         * ----------------------------------------
         */

        const mappedMailing =
          mapMailingFromDatabase(
            mailing
          );

        return {
          ...mappedMailing,

          uploaded:
            uploadedCount || 0,

          delivered:
            sentCount || 0,

          replied:
            respondedCount || 0,

          applications:
            applicationsCount || 0,

          openings:
            openingsCount || 0,

          telegram_found:
            telegramFoundByFlag ||
            0,

          telegram_not_found:
            telegramNotFoundCount ||
            0,

          rejected:
            rejectedCount || 0,
        };
      })
    );

  /*
   * ============================================
   * 3. ВОЗВРАЩАЕМ РЕЗУЛЬТАТ
   * ============================================
   */

  return {
    data: preparedMailings,
    error: null,
  };
},

  /**
   * Получить одну партию.
   */
  async getMailingById(mailingId) {
    if (!mailingId) {
      return {
        data: null,
        error: new Error(
          "Не передан ID партии"
        ),
      };
    }

    const { data, error } = await supabase
      .from("mailings")
      .select(MAILING_FIELDS)
      .eq("id", mailingId)
      .maybeSingle();

    return {
      data: mapMailingFromDatabase(data),
      error,
    };
  },

  /**
   * Получить партии по статусу.
   */
  async getMailingsByStatus(status) {
    const databaseStatus =
      status === "active"
        ? "running"
        : status;

    const { data, error } = await supabase
      .from("mailings")
      .select(MAILING_FIELDS)
      .eq("status", databaseStatus)
      .order("created_at", {
        ascending: false,
      });

    return {
      data: (data || []).map(
        mapMailingFromDatabase
      ),
      error,
    };
  },

  /**
   * Создать новую партию.
   */
  async createMailing(values) {
    const payload =
      mapMailingToDatabase(values);

    if (!payload.name) {
      return {
        data: null,
        error: new Error(
          "Введите название рассылки"
        ),
      };
    }

    const {
      data: authData,
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return {
        data: null,
        error: authError,
      };
    }

    payload.created_by =
      authData?.user?.id || null;

    const { data, error } = await supabase
      .from("mailings")
      .insert(payload)
      .select(MAILING_FIELDS)
      .single();

    return {
      data: mapMailingFromDatabase(data),
      error,
    };
  },

  /**
   * Изменить партию.
   */
  async updateMailing(mailingId, values) {
    if (!mailingId) {
      return {
        data: null,
        error: new Error(
          "Не передан ID партии"
        ),
      };
    }

    const payload =
      mapMailingToDatabase(values);

    const { data, error } = await supabase
      .from("mailings")
      .update(payload)
      .eq("id", mailingId)
      .select(MAILING_FIELDS)
      .single();

    return {
      data: mapMailingFromDatabase(data),
      error,
    };
  },

  /**
   * Запустить партию.
   */
  async startMailing(mailingId) {
    return this.updateMailing(mailingId, {
      status: "running",
      started_at: new Date().toISOString(),
      completed_at: null,
    });
  },

  /**
   * Поставить партию на паузу.
   */
  async pauseMailing(mailingId) {
    return this.updateMailing(mailingId, {
      status: "paused",
    });
  },

  /**
   * Завершить партию.
   */
  async completeMailing(mailingId) {
    return this.updateMailing(mailingId, {
      status: "completed",
      completed_at: new Date().toISOString(),
    });
  },

  /**
   * Отменить партию.
   */
  async cancelMailing(mailingId) {
    return this.updateMailing(mailingId, {
      status: "cancelled",
      completed_at: new Date().toISOString(),
    });
  },

deleteMailing,

  /**
   * Получить финансовые показатели.
   */
  async getFinancialMetrics() {
    const { data, error } = await supabase
      .from("mailing_financial_metrics")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

    return {
      data: data || [],
      error,
    };
  },

  /**
   * Подписаться на изменения.
   */
  subscribeToMailings(callback) {
    const channel = supabase
      .channel("mailings-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mailings",
        },
        (payload) => {
          callback?.(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};