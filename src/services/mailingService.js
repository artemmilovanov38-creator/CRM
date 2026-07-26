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

export const mailingService = {
  /**
   * Получить все партии.
   */
  async getMailings() {
    const { data, error } = await supabase
      .from("mailings")
      .select(MAILING_FIELDS)
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

  /**
   * Удалить партию.
   */
  async deleteMailing(mailingId) {
    if (!mailingId) {
      return {
        success: false,
        error: new Error(
          "Не передан ID партии"
        ),
      };
    }

    const { error } = await supabase
      .from("mailings")
      .delete()
      .eq("id", mailingId);

    return {
      success: !error,
      error,
    };
  },

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