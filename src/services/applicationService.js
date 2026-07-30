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
mailing_contact:mailing_contacts (
  id,
  sent_at,
  responded_at,
  application_created_at,
  telegram_username
),
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
      status: values.status || "in_progress",
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
  async createApplicationFromContact(
  contact,
  managerId = null
) {
  if (!contact) {
    return {
      data: null,
      error: new Error(
        "Не передан контакт для создания заявки"
      ),
    };
  }

  const telegramUsername = String(
  contact.telegram_username || ""
).trim();

const phone = String(
  contact.phone || ""
).trim();

if (!telegramUsername && !phone) {
  return {
    data: null,
    error: new Error(
      "У контакта не указан Telegram или номер телефона"
    ),
  };
}

  /*
   * Сначала проверяем, не была ли заявка
   * уже создана из этого контакта.
   */
  let duplicateQuery = supabase
    .from("applications")
    .select(APPLICATION_FIELDS)
    .limit(1);

 if (contact.id) {
  duplicateQuery = duplicateQuery.eq(
    "mailing_contact_id",
    contact.id
  );
} else if (telegramUsername) {
  duplicateQuery = duplicateQuery
    .eq("mailing_id", contact.mailing_id)
    .ilike("telegram", telegramUsername);
} else {
  duplicateQuery = duplicateQuery
    .eq("mailing_id", contact.mailing_id)
    .eq("phone", phone);
}

  const {
    data: existingApplications,
    error: duplicateError,
  } = await duplicateQuery;

  if (duplicateError) {
    return {
      data: null,
      error: duplicateError,
    };
  }

  if (existingApplications?.length) {
    return {
      data: existingApplications[0],
      error: null,
      alreadyExists: true,
    };
  }

  const applicationPayload = {
    mailing_id: contact.mailing_id || null,

    mailing_contact_id:
      contact.id || null,

   full_name:
  contact.full_name?.trim() ||
  telegramUsername ||
  phone,

phone: phone || null,

telegram:
  telegramUsername || null,

source: telegramUsername
  ? "Telegram"
  : "Телефон",

status: "in_progress",

    assigned_manager_id:
      managerId ||
      contact.manager_id ||
      null,

    amount: null,

    comment:
      "Заявка создана из входящего отклика",
  };

  const {
    data: application,
    error: createError,
  } = await this.createApplication(
    applicationPayload
  );

  if (createError) {
    return {
      data: null,
      error: createError,
    };
  }

  const applicationCreatedAt =
    new Date().toISOString();

  let contactUpdateQuery = supabase
    .from("mailing_contacts")
    .update({
      application_created_at:
        applicationCreatedAt,

      status: "application",

      manager_id:
        managerId ||
        contact.manager_id ||
        null,
    });

  if (contact.id) {
    contactUpdateQuery =
      contactUpdateQuery.eq(
        "id",
        contact.id
      );
  } else if (telegramUsername) {
  contactUpdateQuery =
    contactUpdateQuery
      .eq(
        "mailing_id",
        contact.mailing_id
      )
      .ilike(
        "telegram_username",
        telegramUsername
      );
} else {
  contactUpdateQuery =
    contactUpdateQuery
      .eq(
        "mailing_id",
        contact.mailing_id
      )
      .eq("phone", phone);
}
  const {
    data: updatedContacts,
    error: contactUpdateError,
  } = await contactUpdateQuery.select(`
    id,
    mailing_id,
    full_name,
    phone,
    telegram_username,
    manager_id,
    status,
    sent_at,
    responded_at,
    application_created_at
  `);

  if (contactUpdateError) {
    /*
     * Если контакт не обновился,
     * удаляем только что созданную заявку,
     * чтобы данные не разошлись.
     */
    await supabase
      .from("applications")
      .delete()
      .eq("id", application.id);

    return {
      data: null,
      error: contactUpdateError,
    };
  }

  return {
    data: application,
    contact:
      updatedContacts?.[0] || null,
    error: null,
    alreadyExists: false,
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

  // Сначала получаем заявку, чтобы узнать,
  // из какого контакта она была создана.
  const {
    data: application,
    error: applicationError,
  } = await supabase
    .from("applications")
    .select(`
      id,
      mailing_contact_id
    `)
    .eq("id", applicationId)
    .maybeSingle();

  if (applicationError) {
    return {
      success: false,
      error: applicationError,
    };
  }

  if (!application) {
    return {
      success: false,
      error: new Error("Заявка не найдена"),
    };
  }

  // Удаляем заявку.
  const { error: deleteError } = await supabase
    .from("applications")
    .delete()
    .eq("id", applicationId);

  if (deleteError) {
    return {
      success: false,
      error: deleteError,
    };
  }

  // Если заявка была создана из контакта рассылки,
  // возвращаем контакт в состояние "Ответил".
  if (application.mailing_contact_id) {
    const { error: contactError } = await supabase
      .from("mailing_contacts")
      .update({
        application_created_at: null,
        status: "responded",
        updated_at: new Date().toISOString(),
      })
      .eq(
        "id",
        application.mailing_contact_id
      );

    if (contactError) {
      return {
        success: false,
        error: contactError,
      };
    }
  }

  return {
    success: true,
    error: null,
  };
},
};