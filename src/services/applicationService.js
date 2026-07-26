import { supabase } from "../lib/supabase";

const APPLICATION_FIELDS = `
  id,
  full_name,
  phone,
  telegram,
  source,
  product,
  status,
  assigned_manager_id,
  created_by,
  mailing_id,
mailing_contact_id,
  amount,
  comment,
  created_at,
  updated_at,
  assigned_manager:profiles!applications_assigned_manager_id_fkey (
    id,
    full_name,
    email,
    role,
    status,
    avatar
  )
`;

export const applicationService = {
  async getApplications() 
  {
    const { data, error } = await supabase
      .from("applications")
      .select(APPLICATION_FIELDS)
      .order("created_at", {
        ascending: false,
      });

    return {
      data: data || [],
      error,
    };
  },
  async getApplicationsByPeriod(dateFrom, dateTo) {
  let query = supabase
    .from("applications")
    .select(APPLICATION_FIELDS)
    .order("created_at", {
      ascending: false,
    });

  if (dateFrom) {
    query = query.gte(
      "created_at",
      `${dateFrom}T00:00:00`
    );
  }

  if (dateTo) {
    query = query.lte(
      "created_at",
      `${dateTo}T23:59:59.999`
    );
  }

  const { data, error } = await query;

  return {
    data: data || [],
    error,
  };
},

  async getApplicationById(applicationId) {
    if (!applicationId) {
      return {
        data: null,
        error: new Error("Не передан ID заявки"),
      };
    }

    const { data, error } = await supabase
      .from("applications")
      .select(APPLICATION_FIELDS)
      .eq("id", applicationId)
      .maybeSingle();

    return {
      data,
      error,
    };
  },

  async createApplication(values) {
    const payload = {
      mailing_id: values.mailing_id || null,

mailing_contact_id:
  values.mailing_contact_id || null,
      full_name: values.full_name.trim(),
      phone: values.phone?.trim() || null,
      telegram: values.telegram?.trim() || null,
      source: values.source || "manual",
      product: values.product?.trim() || null,
      status: values.status || "new",
      assigned_manager_id:
        values.assigned_manager_id || null,
      amount:
        values.amount === "" ||
        values.amount === null ||
        values.amount === undefined
          ? null
          : Number(values.amount),
      comment: values.comment?.trim() || null,
    };

    const { data, error } = await supabase
      .from("applications")
      .insert(payload)
      .select(APPLICATION_FIELDS)
      .single();

    return {
      data,
      error,
    };
  },

  async updateApplication(applicationId, values) {
    if (!applicationId) {
      return {
        data: null,
        error: new Error("Не передан ID заявки"),
      };
    }

    const allowedFields = [
      "full_name",
      "phone",
      "mailing_id",
"mailing_contact_id",
      "telegram",
      "source",
      "product",
      "status",
      "assigned_manager_id",
      "amount",
      "comment",
    ];

    const payload = Object.fromEntries(
      Object.entries(values).filter(([key]) =>
        allowedFields.includes(key)
      )
    );

    if ("full_name" in payload) {
      payload.full_name =
        payload.full_name?.trim() || "";
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

    if ("amount" in payload) {
      payload.amount =
        payload.amount === "" ||
        payload.amount === null ||
        payload.amount === undefined
          ? null
          : Number(payload.amount);
    }

    const { data, error } = await supabase
      .from("applications")
      .update(payload)
      .eq("id", applicationId)
      .select(APPLICATION_FIELDS)
      .single();

    return {
      data,
      error,
    };
  },

  async updateStatus(applicationId, status) {
    return this.updateApplication(applicationId, {
      status,
    });
  },

  async assignManager(
    applicationId,
    managerId
  ) {
    return this.updateApplication(applicationId, {
      assigned_manager_id: managerId || null,
    });
  },

  async deleteApplication(applicationId) {
    if (!applicationId) {
      return {
        success: false,
        error: new Error("Не передан ID заявки"),
      };
    }

    const { error } = await supabase
      .from("applications")
      .delete()
      .eq("id", applicationId);

    return {
      success: !error,
      error,
    };
  },
};