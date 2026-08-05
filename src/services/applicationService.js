import { supabase } from "../lib/supabase";

const APPLICATION_FIELDS = `
  id,
  full_name,
  phone,
  telegram,
  source,
  product,
  product_id,
  status,
  assigned_manager_id,
  created_by,
  mailing_id,
  mailing_contact_id,
  amount,
  comment,
  opening_price_snapshot,
  approved_at,
  created_at,
  updated_at,

  product_data:products (
    id,
    name,
    opening_price,
    is_active
  ),

  mailing_contact:mailing_contacts (
    id,
    mailing_id,
    full_name,
    phone,
    email,
    telegram_username,
    manager_id,
    status,
    sent_at,
    responded_at,
    application_created_at
  ),

  assigned_manager:profiles!applications_assigned_manager_id_fkey (
    id,
    full_name,
    email,
    role,
    status,
    avatar
  )
`;

const ALLOWED_APPLICATION_STATUSES = [
  "new",
  "in_progress",
  "approved",
  "rejected",
];

function createServiceError(message) {
  return new Error(message);
}

function normalizeText(value) {
  const normalizedValue = String(
    value ?? ""
  ).trim();

  return normalizedValue || null;
}

function normalizeTelegram(value) {
  const normalizedValue =
    normalizeText(value);

  if (!normalizedValue) {
    return null;
  }

  return normalizedValue
    .replace(
      /^https?:\/\/t\.me\//i,
      ""
    )
    .replace(/^t\.me\//i, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .trim()
    .toLowerCase();
}

function normalizePhone(value) {
  let digits = String(
    value ?? ""
  ).replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if (
    digits.length === 11 &&
    digits.startsWith("8")
  ) {
    digits = `7${digits.slice(1)}`;
  }

  if (digits.length === 10) {
    digits = `7${digits}`;
  }

  return digits;
}

function normalizeAmount(value) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const amount = Number(value);

  return Number.isFinite(amount)
    ? amount
    : null;
}

function normalizeStatus(
  value,
  fallback = "new"
) {
  const normalizedValue =
    normalizeText(value);

  if (!normalizedValue) {
    return fallback;
  }

  if (
    !ALLOWED_APPLICATION_STATUSES.includes(
      normalizedValue
    )
  ) {
    return fallback;
  }

  return normalizedValue;
}

function normalizePrice(value) {
  const price = Number(value);

  return Number.isFinite(price)
    ? price
    : 0;
}

async function getProduct(productId) {
  if (!productId) {
    return {
      data: null,
      error: null,
    };
  }

  const { data, error } = await supabase
    .from("products")
    .select(`
      id,
      name,
      opening_price,
      is_active
    `)
    .eq("id", productId)
    .maybeSingle();

  return {
    data,
    error,
  };
}

async function validateProduct({
  productId,
  requireActive = true,
}) {
  if (!productId) {
    return {
      data: null,
      error: createServiceError(
        "Выберите продукт"
      ),
    };
  }

  const {
    data: product,
    error,
  } = await getProduct(productId);

  if (error) {
    return {
      data: null,
      error,
    };
  }

  if (!product) {
    return {
      data: null,
      error: createServiceError(
        "Выбранный продукт не найден"
      ),
    };
  }

  if (
    requireActive &&
    !product.is_active
  ) {
    return {
      data: null,
      error: createServiceError(
        "Выбранный продукт отключён"
      ),
    };
  }

  return {
    data: product,
    error: null,
  };
}

async function findExistingApplication({
  contact,
  productId,
  telegram,
  phone,
  excludeApplicationId = null,
}) {
  let query = supabase
    .from("applications")
    .select(APPLICATION_FIELDS)
    .eq("product_id", productId)
    .limit(1);

  if (contact?.id) {
    query = query.eq(
      "mailing_contact_id",
      contact.id
    );
  } else {
    if (contact?.mailing_id) {
      query = query.eq(
        "mailing_id",
        contact.mailing_id
      );
    }

    if (telegram) {
      query = query.ilike(
        "telegram",
        telegram
      );
    } else if (phone) {
      query = query.eq(
        "phone",
        phone
      );
    } else {
      return {
        data: null,
        error: createServiceError(
          "Не удалось определить контакт для проверки дубля"
        ),
      };
    }
  }

  if (excludeApplicationId) {
    query = query.neq(
      "id",
      excludeApplicationId
    );
  }

  const { data, error } = await query;

  return {
    data: data?.[0] || null,
    error,
  };
}

async function updateMailingContactAfterCreation({
  contact,
  applicationCreatedAt,
  managerId,
}) {
  if (!contact?.id) {
    return {
      data: null,
      error: createServiceError(
        "Не удалось определить контакт рассылки"
      ),
    };
  }

  const { data, error } = await supabase
    .from("mailing_contacts")
    .update({
      status: "application",

      application_created_at:
        applicationCreatedAt,

      manager_id:
        managerId ||
        contact.manager_id ||
        null,

      updated_at:
        new Date().toISOString(),
    })
    .eq("id", contact.id)
    .select(`
      id,
      mailing_id,
      full_name,
      phone,
      email,
      telegram_username,
      telegram_user_id,
      telegram_found,
      manager_id,
      status,
      sent_at,
      responded_at,
      application_created_at,
      comment,
      created_at,
      updated_at,

      mailing:mailings (
        id,
        name,
        supplier,
        mailing_method,
        status,
        created_at
      ),

      manager:profiles (
        id,
        full_name,
        email,
        role,
        status
      )
    `)
    .single();

  return {
    data,
    error,
  };
}

function getContactStatusWithoutApplications(
  contact
) {
  if (contact?.responded_at) {
    return "responded";
  }

  if (contact?.sent_at) {
    return "sent";
  }

  if (contact?.manager_id) {
    return "assigned";
  }

  if (contact?.telegram_found) {
    return "telegram_found";
  }

  return "new";
}

async function refreshMailingContactApplicationState(
  mailingContactId
) {
  if (!mailingContactId) {
    return {
      data: null,
      error: null,
    };
  }

  const {
    data: remainingApplications,
    error: applicationsError,
  } = await supabase
    .from("applications")
    .select(`
      id,
      created_at
    `)
    .eq(
      "mailing_contact_id",
      mailingContactId
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

  if (remainingApplications?.length) {
    const latestApplication =
      remainingApplications[0];

    const { data, error } = await supabase
      .from("mailing_contacts")
      .update({
        status: "application",

        application_created_at:
          latestApplication.created_at,

        updated_at:
          new Date().toISOString(),
      })
      .eq("id", mailingContactId)
      .select(`
        id,
        mailing_id,
        full_name,
        phone,
        email,
        telegram_username,
        telegram_user_id,
        telegram_found,
        manager_id,
        status,
        sent_at,
        responded_at,
        application_created_at,
        comment,
        created_at,
        updated_at
      `)
      .single();

    return {
      data,
      error,
    };
  }

  const {
    data: contact,
    error: contactError,
  } = await supabase
    .from("mailing_contacts")
    .select(`
      id,
      manager_id,
      telegram_found,
      sent_at,
      responded_at
    `)
    .eq("id", mailingContactId)
    .maybeSingle();

  if (contactError) {
    return {
      data: null,
      error: contactError,
    };
  }

  if (!contact) {
    return {
      data: null,
      error: null,
    };
  }

  const { data, error } = await supabase
    .from("mailing_contacts")
    .update({
      status:
        getContactStatusWithoutApplications(
          contact
        ),

      application_created_at: null,

      updated_at:
        new Date().toISOString(),
    })
    .eq("id", mailingContactId)
    .select(`
      id,
      mailing_id,
      full_name,
      phone,
      email,
      telegram_username,
      telegram_user_id,
      telegram_found,
      manager_id,
      status,
      sent_at,
      responded_at,
      application_created_at,
      comment,
      created_at,
      updated_at
    `)
    .single();

  return {
    data,
    error,
  };
}

async function prepareApprovalFields({
  nextStatus,
  currentApplication = null,
  productId,
}) {
  if (nextStatus !== "approved") {
    return {
      data: {},
      error: null,
    };
  }

  const result = {};

  /*
   * Дата успешного открытия фиксируется
   * только при первом переходе в approved.
   */
  if (!currentApplication?.approved_at) {
    result.approved_at =
      new Date().toISOString();
  }

  /*
   * Ставка также фиксируется только один раз.
   * Последующее изменение цены продукта
   * не изменит старую зарплату.
   */
  if (
    currentApplication
      ?.opening_price_snapshot !== null &&
    currentApplication
      ?.opening_price_snapshot !== undefined
  ) {
    return {
      data: result,
      error: null,
    };
  }

  const {
    data: product,
    error: productError,
  } = await getProduct(productId);

  if (productError) {
    return {
      data: null,
      error: productError,
    };
  }

  if (!product) {
    return {
      data: null,
      error: createServiceError(
        "Не удалось определить продукт для фиксации ставки"
      ),
    };
  }

  result.opening_price_snapshot =
    normalizePrice(
      product.opening_price
    );

  return {
    data: result,
    error: null,
  };
}

export const applicationService = {
  /**
   * Получить все заявки.
   */
  async getApplications() {
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

  /**
   * Получить заявки одного контакта.
   */
  async getApplicationsByContactId(
    mailingContactId
  ) {
    if (!mailingContactId) {
      return {
        data: [],
        error: createServiceError(
          "Не передан ID контакта"
        ),
      };
    }

    const { data, error } = await supabase
      .from("applications")
      .select(APPLICATION_FIELDS)
      .eq(
        "mailing_contact_id",
        mailingContactId
      )
      .order("created_at", {
        ascending: false,
      });

    return {
      data: data || [],
      error,
    };
  },

  /**
   * Получить заявки по дате создания.
   * Используется для общих отчётов.
   */
  async getApplicationsByPeriod(
    dateFrom,
    dateTo
  ) {
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

    const { data, error } =
      await query;

    return {
      data: data || [],
      error,
    };
  },

  /**
   * Получить только успешные открытия
   * по дате перехода заявки в approved.
   *
   * Этот метод используется для зарплаты.
   */
  async getApprovedApplicationsByPeriod(
    dateFrom,
    dateTo
  ) {
    let query = supabase
      .from("applications")
      .select(APPLICATION_FIELDS)
      .eq("status", "approved")
      .not("approved_at", "is", null)
      .order("approved_at", {
        ascending: false,
      });

    if (dateFrom) {
      query = query.gte(
        "approved_at",
        `${dateFrom}T00:00:00`
      );
    }

    if (dateTo) {
      query = query.lte(
        "approved_at",
        `${dateTo}T23:59:59.999`
      );
    }

    const { data, error } =
      await query;

    return {
      data: data || [],
      error,
    };
  },

  /**
   * Получить одну заявку.
   */
  async getApplicationById(
    applicationId
  ) {
    if (!applicationId) {
      return {
        data: null,
        error: createServiceError(
          "Не передан ID заявки"
        ),
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

  /**
   * Создать заявку из произвольных данных.
   */
  async createApplication(values) {
    const fullName = normalizeText(
      values?.full_name
    );

    if (!fullName) {
      return {
        data: null,
        error: createServiceError(
          "Укажите имя клиента"
        ),
      };
    }

    const productId =
      values?.product_id || null;

    const {
      data: product,
      error: productError,
    } = await validateProduct({
      productId,
      requireActive: true,
    });

    if (productError) {
      return {
        data: null,
        error: productError,
      };
    }

    const status = normalizeStatus(
      values?.status,
      "new"
    );

    const {
      data: approvalFields,
      error: approvalError,
    } = await prepareApprovalFields({
      nextStatus: status,
      productId: product.id,
    });

    if (approvalError) {
      return {
        data: null,
        error: approvalError,
      };
    }

    const payload = {
      mailing_id:
        values?.mailing_id || null,

      mailing_contact_id:
        values?.mailing_contact_id ||
        null,

      product_id: product.id,

      product: product.name,

      full_name: fullName,

      phone: normalizePhone(
        values?.phone
      ),

      telegram: normalizeTelegram(
        values?.telegram
      ),

      source:
        normalizeText(values?.source) ||
        "manual",

      status,

      assigned_manager_id:
        values?.assigned_manager_id ||
        null,

      amount: normalizeAmount(
        values?.amount
      ),

      comment: normalizeText(
        values?.comment
      ),

      ...approvalFields,
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

  /**
   * Создать заявку из контакта рассылки.
   *
   * Один контакт может иметь заявки
   * по разным продуктам.
   *
   * По одному продукту дубль запрещён.
   */
  async createApplicationFromContact(
    contact,
    managerId = null,
    productId = null,
    options = {}
  ) {
    if (!contact?.id) {
      return {
        data: null,
        error: createServiceError(
          "Не передан контакт для создания заявки"
        ),
      };
    }

    const telegram =
      normalizeTelegram(
        contact.telegram_username ||
          contact.telegram
      );

    const phone =
      normalizePhone(contact.phone);

    if (!telegram && !phone) {
      return {
        data: null,
        error: createServiceError(
          "У контакта не указан Telegram или номер телефона"
        ),
      };
    }

    const selectedProductId =
      productId ||
      contact.product_id ||
      null;

    const {
      data: selectedProduct,
      error: productError,
    } = await validateProduct({
      productId: selectedProductId,
      requireActive: true,
    });

    if (productError) {
      return {
        data: null,
        error: productError,
      };
    }

    const {
      data: existingApplication,
      error: duplicateError,
    } = await findExistingApplication({
      contact,
      productId:
        selectedProduct.id,
      telegram,
      phone,
    });

    if (duplicateError) {
      return {
        data: null,
        error: duplicateError,
      };
    }

    if (existingApplication) {
      return {
        data: existingApplication,
        contact,
        error: null,
        alreadyExists: true,
      };
    }

    const assignedManagerId =
      managerId ||
      contact.manager_id ||
      null;

    if (!assignedManagerId) {
      return {
        data: null,
        error: createServiceError(
          "Не удалось определить менеджера заявки"
        ),
      };
    }

    const result =
      await this.createApplication({
        mailing_id:
          contact.mailing_id || null,

        mailing_contact_id:
          contact.id,

        product_id:
          selectedProduct.id,

        full_name:
          normalizeText(
            contact.full_name
          ) ||
          telegram ||
          phone,

        phone,

        telegram,

        source: "mailing",

        status:
          normalizeStatus(
            options?.status,
            "new"
          ),

        assigned_manager_id:
          assignedManagerId,

        amount: null,

        comment:
          normalizeText(
            options?.comment
          ) ||
          normalizeText(
            contact.comment
          ) ||
          "Заявка создана из входящего отклика",
      });

    if (result.error) {
      return {
        data: null,
        error: result.error,
      };
    }

    const application = result.data;

    const {
      data: updatedContact,
      error: contactUpdateError,
    } =
      await updateMailingContactAfterCreation({
        contact,

        applicationCreatedAt:
          application.created_at ||
          new Date().toISOString(),

        managerId:
          assignedManagerId,
      });

    if (contactUpdateError) {
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
        updatedContact || contact,

      error: null,

      alreadyExists: false,
    };
  },

  /**
   * Изменить заявку.
   */
  async updateApplication(
    applicationId,
    values
  ) {
    if (!applicationId) {
      return {
        data: null,
        error: createServiceError(
          "Не передан ID заявки"
        ),
      };
    }

    const {
      data: currentApplication,
      error: loadError,
    } = await supabase
      .from("applications")
      .select(`
        id,
        mailing_contact_id,
        product_id,
        telegram,
        phone,
        mailing_id,
        status,
        approved_at,
        opening_price_snapshot
      `)
      .eq("id", applicationId)
      .maybeSingle();

    if (loadError) {
      return {
        data: null,
        error: loadError,
      };
    }

    if (!currentApplication) {
      return {
        data: null,
        error: createServiceError(
          "Заявка не найдена"
        ),
      };
    }

    const allowedFields = [
      "full_name",
      "phone",
      "telegram",
      "source",
      "product",
      "product_id",
      "status",
      "assigned_manager_id",
      "amount",
      "comment",
      "mailing_id",
      "mailing_contact_id",
    ];

    const payload = Object.fromEntries(
      Object.entries(values || {}).filter(
        ([key]) =>
          allowedFields.includes(key)
      )
    );

    if ("full_name" in payload) {
      payload.full_name =
        normalizeText(
          payload.full_name
        ) || "";
    }

    if ("phone" in payload) {
      payload.phone =
        normalizePhone(
          payload.phone
        );
    }

    if ("telegram" in payload) {
      payload.telegram =
        normalizeTelegram(
          payload.telegram
        );
    }

    if ("source" in payload) {
      payload.source =
        normalizeText(
          payload.source
        );
    }

    if ("amount" in payload) {
      payload.amount =
        normalizeAmount(
          payload.amount
        );
    }

    if ("comment" in payload) {
      payload.comment =
        normalizeText(
          payload.comment
        );
    }

    if (
      "assigned_manager_id" in payload
    ) {
      payload.assigned_manager_id =
        payload.assigned_manager_id ||
        null;
    }

    if ("mailing_id" in payload) {
      payload.mailing_id =
        payload.mailing_id || null;
    }

    if (
      "mailing_contact_id" in payload
    ) {
      payload.mailing_contact_id =
        payload.mailing_contact_id ||
        null;
    }

    const nextStatus =
      "status" in payload
        ? normalizeStatus(
            payload.status,
            currentApplication.status
          )
        : currentApplication.status;

    if ("status" in payload) {
      payload.status = nextStatus;
    }

    let finalProductId =
      currentApplication.product_id;

    if ("product_id" in payload) {
      const {
        data: nextProduct,
        error: productError,
      } = await validateProduct({
        productId:
          payload.product_id,
        requireActive: false,
      });

      if (productError) {
        return {
          data: null,
          error: productError,
        };
      }

      const {
        data: duplicateApplication,
        error: duplicateError,
      } = await findExistingApplication({
        contact: {
          id:
            payload.mailing_contact_id ||
            currentApplication
              .mailing_contact_id,

          mailing_id:
            payload.mailing_id ||
            currentApplication.mailing_id,
        },

        productId:
          nextProduct.id,

        telegram:
          "telegram" in payload
            ? payload.telegram
            : currentApplication.telegram,

        phone:
          "phone" in payload
            ? payload.phone
            : currentApplication.phone,

        excludeApplicationId:
          applicationId,
      });

      if (duplicateError) {
        return {
          data: null,
          error: duplicateError,
        };
      }

      if (duplicateApplication) {
        return {
          data: null,
          error: createServiceError(
            `По продукту "${nextProduct.name}" у этого контакта уже есть заявка`
          ),
        };
      }

      finalProductId =
        nextProduct.id;

      payload.product_id =
        nextProduct.id;

      payload.product =
        nextProduct.name;
    } else if ("product" in payload) {
      payload.product =
        normalizeText(
          payload.product
        );
    }

    const {
      data: approvalFields,
      error: approvalError,
    } = await prepareApprovalFields({
      nextStatus,

      currentApplication,

      productId:
        finalProductId,
    });

    if (approvalError) {
      return {
        data: null,
        error: approvalError,
      };
    }

    Object.assign(
      payload,
      approvalFields
    );

    if (
      Object.keys(payload).length === 0
    ) {
      return {
        data: null,
        error: createServiceError(
          "Нет данных для обновления заявки"
        ),
      };
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

  /**
   * Изменить статус.
   */
  async updateStatus(
    applicationId,
    status
  ) {
    const normalizedStatus =
      normalizeStatus(status, "");

    if (!normalizedStatus) {
      return {
        data: null,
        error: createServiceError(
          "Передан некорректный статус заявки"
        ),
      };
    }

    return this.updateApplication(
      applicationId,
      {
        status:
          normalizedStatus,
      }
    );
  },

  /**
   * Изменить продукт, статус
   * и комментарий заявки.
   */
  async updateApplicationProgress(
    applicationId,
    {
      status,
      comment,
      productId,
    } = {}
  ) {
    const values = {};

    if (status) {
      values.status = status;
    }

    if (comment !== undefined) {
      values.comment = comment;
    }

    if (productId) {
      values.product_id =
        productId;
    }

    return this.updateApplication(
      applicationId,
      values
    );
  },

  /**
   * Назначить менеджера.
   */
  async assignManager(
    applicationId,
    managerId
  ) {
    return this.updateApplication(
      applicationId,
      {
        assigned_manager_id:
          managerId || null,
      }
    );
  },

  /**
   * Удалить заявку.
   */
  async deleteApplication(
    applicationId
  ) {
    if (!applicationId) {
      return {
        success: false,
        error: createServiceError(
          "Не передан ID заявки"
        ),
      };
    }

    const {
      data: application,
      error: loadError,
    } = await supabase
      .from("applications")
      .select(`
        id,
        mailing_contact_id
      `)
      .eq("id", applicationId)
      .maybeSingle();

    if (loadError) {
      return {
        success: false,
        error: loadError,
      };
    }

    if (!application) {
      return {
        success: false,
        error: createServiceError(
          "Заявка не найдена"
        ),
      };
    }

    const { error: deleteError } =
      await supabase
        .from("applications")
        .delete()
        .eq("id", applicationId);

    if (deleteError) {
      return {
        success: false,
        error: deleteError,
      };
    }

    const {
      error: contactRefreshError,
    } =
      await refreshMailingContactApplicationState(
        application.mailing_contact_id
      );

    return {
      success: true,

      warning: contactRefreshError
        ? "Заявка удалена, но не удалось обновить статус контакта"
        : null,

      error: contactRefreshError,
    };
  },
};

export default applicationService;