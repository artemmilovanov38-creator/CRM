import { supabase } from "../lib/supabase";

const MAILING_FIELDS = `
  id,
  title,
  channel,
  source,
  manager_id,
  status,
  message,
  uploaded,
  delivered,
  replied,
  applications,
  openings,
  scheduled_at,
  created_by,
  created_at,
  updated_at,
  manager:profiles!mailings_manager_id_fkey (
    id,
    full_name,
    email,
    avatar
  )
`;

export const mailingService = {
  async getMailings() {
    const { data, error } = await supabase
      .from("mailings")
      .select(MAILING_FIELDS)
      .order("created_at", {
        ascending: false,
      });

    return {
      data: data || [],
      error,
    };
  },

  async getMailingById(mailingId) {
    if (!mailingId) {
      return {
        data: null,
        error: new Error("Не передан ID рассылки"),
      };
    }

    const { data, error } = await supabase
      .from("mailings")
      .select(MAILING_FIELDS)
      .eq("id", mailingId)
      .maybeSingle();

    return {
      data,
      error,
    };
  },

  async createMailing(values) {
    const payload = {
      title: values.title.trim(),
      channel: values.channel,
      source: values.source?.trim() || null,
      manager_id: values.manager_id || null,
      status: values.status || "draft",
      message: values.message?.trim() || null,

      uploaded: Number(values.uploaded || 0),
      delivered: Number(values.delivered || 0),
      replied: Number(values.replied || 0),
      applications: Number(values.applications || 0),
      openings: Number(values.openings || 0),

      scheduled_at:
        values.scheduled_at || null,
    };

    const { data, error } = await supabase
      .from("mailings")
      .insert(payload)
      .select(MAILING_FIELDS)
      .single();

    return {
      data,
      error,
    };
  },

  async updateMailing(mailingId, values) {
    if (!mailingId) {
      return {
        data: null,
        error: new Error("Не передан ID рассылки"),
      };
    }

    const allowedFields = [
      "title",
      "channel",
      "source",
      "manager_id",
      "status",
      "message",
      "uploaded",
      "delivered",
      "replied",
      "applications",
      "openings",
      "scheduled_at",
    ];

    const payload = Object.fromEntries(
      Object.entries(values).filter(([key]) =>
        allowedFields.includes(key)
      )
    );

    if ("title" in payload) {
      payload.title =
        payload.title?.trim() || "";
    }

    if ("source" in payload) {
      payload.source =
        payload.source?.trim() || null;
    }

    if ("message" in payload) {
      payload.message =
        payload.message?.trim() || null;
    }

    if ("manager_id" in payload) {
      payload.manager_id =
        payload.manager_id || null;
    }

    [
      "uploaded",
      "delivered",
      "replied",
      "applications",
      "openings",
    ].forEach((field) => {
      if (field in payload) {
        payload[field] = Number(
          payload[field] || 0
        );
      }
    });

    if ("scheduled_at" in payload) {
      payload.scheduled_at =
        payload.scheduled_at || null;
    }

    const { data, error } = await supabase
      .from("mailings")
      .update(payload)
      .eq("id", mailingId)
      .select(MAILING_FIELDS)
      .single();

    return {
      data,
      error,
    };
  },

  async updateStatus(mailingId, status) {
    return this.updateMailing(mailingId, {
      status,
    });
  },

  async deleteMailing(mailingId) {
    if (!mailingId) {
      return {
        success: false,
        error: new Error("Не передан ID рассылки"),
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
};