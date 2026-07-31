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

function normalizeText(value) {
  const normalizedValue = String(
    value ?? ""
  ).trim();

  return normalizedValue || null;
}

function normalizeTelegram(value) {
  const normalizedValue = normalizeText(
    value
  );

  if (!normalizedValue) {
    return null;
  }

  return normalizedValue.replace(/^@/, "");
}

function normalizePhone(value) {
  const digits = String(
    value ?? ""
  ).replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if (
    digits.length === 11 &&
    digits.startsWith("8")
  ) {
    return `7${digits.slice(1)}`;
  }

  if (digits.length === 10) {
    return `7${digits}`;
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

function createServiceError(message) {
  return new Error(message);
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

async function findExistingApplication({
  contact,
  productId,
  telegram,
  phone,
}) {
  let query = supabase
    .from("applications")
    .select(APPLICATION_FIELDS)
    .limit(1);

  /*
   * Главная проверка:
   * один контакт + один продукт.
   *
   * Заявки этого же контакта по другим
   * продуктам не блокируются.
   */
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
          "Не удалось определить контакт для проверки заявки"
        ),
      };
    }
  }

  if (productId) {
    query = query.eq(
      "product_id",
      productId
    );
  } else {
    query = query.is(
      "product_id",
      null
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
  let query = supabase
    .from("mailing_contacts")
    .update({
      status: "application",

      application_created_at:
        applicationCreatedAt,

      manager_id:
        managerId ||
        contact?.manager_id ||
        null,

      updated_at:
        new Date().toISOString(),
    });

  if (contact?.id) {
    query = query.eq(
      "id",
      contact.id
    );
  } else {
    const telegram =
      normalizeTelegram(
        contact?.telegram_username
      );

    const phone = normalizePhone(
      contact?.phone
    );

    if (contact?.mailing_id) {
      query = query.eq(
        "mailing_id",
        contact.mailing_id
      );
    }

    if (telegram) {
      query = query.ilike(
        "telegram_username",
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
          "Не удалось определить контакт рассылки"
        ),
      };
    }
  }

  const { data, error } =
    await query
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
      .maybeSingle();

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

export const applicationService = {
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

    let productName = normalizeText(
      values?.product
    );

    /*
     * Если передан product_id, получаем
     * актуальное название продукта из базы.
     */
    if (productId) {
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
            "Выбранный продукт не найден"
          ),
        };
      }

      if (!product.is_active) {
        return {
          data: null,
          error: createServiceError(
            "Выбранный продукт отключён"
          ),
        };
      }

      productName = product.name;
    }

    const payload = {
      mailing_id:
        values?.mailing_id || null,

      mailing_contact_id:
        values?.mailing_contact_id ||
        null,

      product_id: productId,

      product: productName,

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

      status:
        values?.status || "new",

      assigned_manager_id:
        values?.assigned_manager_id ||
        null,

      amount: normalizeAmount(
        values?.amount
      ),

      comment: normalizeText(
        values?.comment
      ),
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

  /*
   * Поддерживаем несколько заявок одного
   * контакта по разным продуктам.
   *
   * Параметры:
   * contact — контакт рассылки;
   * managerId — назначенный менеджер;
   * productId — выбранный продукт.
   *
   * productId пока необязательный, чтобы
   * старые места вызова не упали. После
   * добавления выбора продукта в интерфейс
   * сюда будет передаваться его ID.
   */
  async createApplicationFromContact(
    contact,
    managerId = null,
    productId = null
  ) {
    if (!contact) {
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

    const phone = normalizePhone(
      contact.phone
    );

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

    let selectedProduct = null;

    if (selectedProductId) {
      const {
        data,
        error: productError,
      } = await getProduct(
        selectedProductId
      );

      if (productError) {
        return {
          data: null,
          error: productError,
        };
      }

      if (!data) {
        return {
          data: null,
          error: createServiceError(
            "Выбранный продукт не найден"
          ),
        };
      }

      if (!data.is_active) {
        return {
          data: null,
          error: createServiceError(
            "Выбранный продукт отключён"
          ),
        };
      }

      selectedProduct = data;
    }

    const {
      data: existingApplication,
      error: duplicateError,
    } = await findExistingApplication({
      contact,
      productId: selectedProductId,
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

    const applicationPayload = {
      mailing_id:
        contact.mailing_id || null,

      mailing_contact_id:
        contact.id || null,

      product_id:
        selectedProductId,

      product:
        selectedProduct?.name ||
        normalizeText(
          contact.product
        ),

      full_name:
        normalizeText(
          contact.full_name
        ) ||
        telegram ||
        phone,

      phone,

      telegram,

      source: "mailing",

      status: "new",

      assigned_manager_id:
        assignedManagerId,

      amount: null,

      comment:
        normalizeText(
          contact.comment
        ) ||
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
      application.created_at ||
      new Date().toISOString();

    const {
      data: updatedContact,
      error: contactUpdateError,
    } =
      await updateMailingContactAfterCreation({
        contact,
        applicationCreatedAt,
        managerId:
          assignedManagerId,
      });

    if (contactUpdateError) {
      /*
       * Если контакт не обновился,
       * удаляем только что созданную заявку.
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
        updatedContact || contact,
      error: null,
      alreadyExists: false,
    };
  },

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

    if ("product" in payload) {
      payload.product =
        normalizeText(
          payload.product
        );
    }

    if ("product_id" in payload) {
      payload.product_id =
        payload.product_id || null;

      if (payload.product_id) {
        const {
          data: product,
          error: productError,
        } = await getProduct(
          payload.product_id
        );

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
              "Выбранный продукт не найден"
            ),
          };
        }

        payload.product =
          product.name;
      }
    }

    if (
      "assigned_manager_id" in payload
    ) {
      payload.assigned_manager_id =
        payload.assigned_manager_id ||
        null;
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

  async updateStatus(
    applicationId,
    status
  ) {
    return this.updateApplication(
      applicationId,
      {
        status,
      }
    );
  },

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

    /*
     * Получаем заявку до удаления, чтобы
     * узнать связанный контакт.
     */
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

    if (
      !application.mailing_contact_id
    ) {
      return {
        success: true,
        error: null,
      };
    }

    /*
     * Проверяем, остались ли у контакта
     * другие заявки.
     */
    const {
      data: remainingApplications,
      error: remainingError,
    } = await supabase
      .from("applications")
      .select(`
        id,
        created_at
      `)
      .eq(
        "mailing_contact_id",
        application.mailing_contact_id
      )
      .order("created_at", {
        ascending: false,
      });

    if (remainingError) {
      return {
        success: true,
        warning:
          "Заявка удалена, но не удалось проверить остальные заявки контакта",
        error: remainingError,
      };
    }

    if (
      remainingApplications?.length
    ) {
      /*
       * Другие заявки остались:
       * контакт сохраняет статус application.
       */
      const latestApplication =
        remainingApplications[0];

      const { error: contactError } =
        await supabase
          .from("mailing_contacts")
          .update({
            status: "application",

            application_created_at:
              latestApplication.created_at,

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            application.mailing_contact_id
          );

      return {
        success: true,
        warning: contactError
          ? "Заявка удалена, но не удалось обновить контакт"
          : null,
        error: contactError,
      };
    }

    /*
     * Других заявок нет. Получаем контакт,
     * чтобы восстановить правильный статус.
     */
    const {
      data: contact,
      error: contactLoadError,
    } = await supabase
      .from("mailing_contacts")
      .select(`
        id,
        manager_id,
        telegram_found,
        sent_at,
        responded_at
      `)
      .eq(
        "id",
        application.mailing_contact_id
      )
      .maybeSingle();

    if (contactLoadError) {
      return {
        success: true,
        warning:
          "Заявка удалена, но не удалось получить связанный контакт",
        error: contactLoadError,
      };
    }

    if (!contact) {
      return {
        success: true,
        warning:
          "Заявка удалена, связанный контакт не найден",
        error: null,
      };
    }

    const restoredStatus =
      getContactStatusWithoutApplications(
        contact
      );

    const { error: contactError } =
      await supabase
        .from("mailing_contacts")
        .update({
          status: restoredStatus,

          application_created_at: null,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          application.mailing_contact_id
        );

    return {
      success: true,
      warning: contactError
        ? "Заявка удалена, но не удалось восстановить статус контакта"
        : null,
      error: contactError,
    };
  },
};

export default applicationService;