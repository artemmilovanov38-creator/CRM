import { supabase } from "../lib/supabase";

const INCOMING_LEAD_FIELDS = `
  id,
  full_name,
  phone,
  telegram,
  source,
  product,
  status,
  assigned_manager_id,
  created_by,
  converted_application_id,
  comment,
  created_at,
  updated_at,
  taken_at,
  converted_at,
  assigned_manager:profiles!incoming_leads_assigned_manager_id_fkey (
    id,
    full_name,
    email,
    role,
    status
  ),
  converted_application:applications!incoming_leads_converted_application_id_fkey (
    id,
    full_name,
    status,
    created_at
  )
`;

export const incomingLeadService = {
  async getIncomingLeads() {
    const { data, error } = await supabase
      .from("incoming_leads")
      .select(INCOMING_LEAD_FIELDS)
      .order("created_at", {
        ascending: false,
      });

    return {
      data: data || [],
      error,
    };
  },

  async getIncomingLeadById(leadId) {
    if (!leadId) {
      return {
        data: null,
        error: new Error("Не передан ID лида"),
      };
    }

    const { data, error } = await supabase
      .from("incoming_leads")
      .select(INCOMING_LEAD_FIELDS)
      .eq("id", leadId)
      .maybeSingle();

    return {
      data,
      error,
    };
  },

  async createIncomingLead(values) {
    const payload = {
      full_name: values.full_name?.trim() || null,
      phone: values.phone?.trim() || null,
      telegram: values.telegram?.trim() || null,
      source: values.source || "manual",
      product: values.product?.trim() || null,
      status: values.status || "new",
      assigned_manager_id:
        values.assigned_manager_id || null,
      comment: values.comment?.trim() || null,
    };

    const { data, error } = await supabase
      .from("incoming_leads")
      .insert(payload)
      .select(INCOMING_LEAD_FIELDS)
      .single();

    return {
      data,
      error,
    };
  },

  async updateIncomingLead(leadId, values) {
    if (!leadId) {
      return {
        data: null,
        error: new Error("Не передан ID лида"),
      };
    }

    const allowedFields = [
      "full_name",
      "phone",
      "telegram",
      "source",
      "product",
      "status",
      "assigned_manager_id",
      "converted_application_id",
      "comment",
      "taken_at",
      "converted_at",
    ];

    const payload = Object.fromEntries(
      Object.entries(values).filter(([key]) =>
        allowedFields.includes(key)
      )
    );

    if ("full_name" in payload) {
      payload.full_name =
        payload.full_name?.trim() || null;
    }

    if ("phone" in payload) {
      payload.phone =
        payload.phone?.trim() || null;
    }

    if ("telegram" in payload) {
      payload.telegram =
        payload.telegram?.trim() || null;
    }

    if ("product" in payload) {
      payload.product =
        payload.product?.trim() || null;
    }

    if ("comment" in payload) {
      payload.comment =
        payload.comment?.trim() || null;
    }

    if ("assigned_manager_id" in payload) {
      payload.assigned_manager_id =
        payload.assigned_manager_id || null;
    }

    if ("converted_application_id" in payload) {
      payload.converted_application_id =
        payload.converted_application_id || null;
    }

    const { data, error } = await supabase
      .from("incoming_leads")
      .update(payload)
      .eq("id", leadId)
      .select(INCOMING_LEAD_FIELDS)
      .single();

    return {
      data,
      error,
    };
  },

  async takeLead(leadId, managerId) {
    if (!managerId) {
      return {
        data: null,
        error: new Error(
          "Не передан ID менеджера"
        ),
      };
    }

    return this.updateIncomingLead(leadId, {
      assigned_manager_id: managerId,
      status: "in_progress",
      taken_at: new Date().toISOString(),
    });
  },

  async rejectLead(leadId) {
    return this.updateIncomingLead(leadId, {
      status: "rejected",
    });
  },

  async convertToApplication(lead) {
    if (!lead?.id) {
      return {
        data: null,
        error: new Error(
          "Не переданы данные лида"
        ),
      };
    }

    const {
      data: application,
      error: applicationError,
    } = await supabase
      .from("applications")
      .insert({
        full_name:
          lead.full_name?.trim() ||
          "Клиент без имени",

        phone: lead.phone?.trim() || null,

        telegram:
          lead.telegram?.trim() || null,

        source: lead.source || "manual",

        product: lead.product?.trim() || null,

        status: "new",

        assigned_manager_id:
          lead.assigned_manager_id || null,

        comment: lead.comment?.trim() || null,
      })
      .select("id")
      .single();

    if (applicationError) {
      return {
        data: null,
        error: applicationError,
      };
    }

    const {
      data: updatedLead,
      error: leadError,
    } = await supabase
      .from("incoming_leads")
      .update({
        status: "converted",
        converted_application_id:
          application.id,
        converted_at:
          new Date().toISOString(),
      })
      .eq("id", lead.id)
      .select(INCOMING_LEAD_FIELDS)
      .single();

    if (leadError) {
      return {
        data: null,
        error: leadError,
      };
    }

    return {
      data: {
        lead: updatedLead,
        applicationId: application.id,
      },
      error: null,
    };
  },

  async deleteIncomingLead(leadId) {
    if (!leadId) {
      return {
        success: false,
        error: new Error("Не передан ID лида"),
      };
    }

    const { error } = await supabase
      .from("incoming_leads")
      .delete()
      .eq("id", leadId);

    return {
      success: !error,
      error,
    };
  },
};