import { supabase } from "../lib/supabase";

const CONTACT_FIELDS = `
  id,
  mailing_id,
  full_name,
  phone,
  email,
  telegram_username,
  manager_id,
  status,
  source,
  is_external,
  sent_at,
  responded_at,
  application_created_at,
  comment,
  created_at,
  updated_at,

  mailing:mailings (
    id,
    name,
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
`;

function createServiceError(message) {
  return new Error(message);
}

function normalizeTelegramUsername(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/^https?:\/\/t\.me\//i, "")
    .replace(/^t\.me\//i, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .trim()
    .toLowerCase();

  return cleaned ? `@${cleaned}` : "";
}

function normalizePhone(value) {
  let digits = String(value || "")
    .replace(/\D/g, "");

  if (!digits) {
    return "";
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

function normalizeIdentifier(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return null;
  }

  if (
    raw.startsWith("@") ||
    /^https?:\/\/t\.me\//i.test(raw) ||
    /^t\.me\//i.test(raw) ||
    /[a-zа-яё]/i.test(raw)
  ) {
    const telegram =
      normalizeTelegramUsername(raw);

    if (!telegram) {
      return null;
    }

    return {
      type: "telegram",
      value: telegram,
      telegram,
      phone: "",
    };
  }

  const phone = normalizePhone(raw);

  if (!phone) {
    return null;
  }

  return {
    type: "phone",
    value: phone,
    telegram: "",
    phone,
  };
}

function escapeLikeValue(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

function parseIdentifiers(value) {
  const rawItems = String(value || "")
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const result = [];
  const used = new Set();

  for (const rawItem of rawItems) {
    const normalized =
      normalizeIdentifier(rawItem);

    if (!normalized) {
      continue;
    }

    const key =
      `${normalized.type}:${normalized.value}`;

    if (used.has(key)) {
      continue;
    }

    used.add(key);

    result.push({
      ...normalized,
      raw: rawItem,
      identifier:
        normalized.type === "telegram"
          ? normalized.telegram
          : normalized.phone,
    });
  }

  return result;
}

async function findMailingContactsByTelegram(
  normalizedTelegram
) {
  const withoutAt =
    normalizedTelegram.replace(/^@/, "");

  const values = [
    normalizedTelegram,
    withoutAt,
  ];

  const contactsMap = new Map();

  for (const value of values) {
    const { data, error } = await supabase
      .from("mailing_contacts")
      .select(CONTACT_FIELDS)
      .ilike(
        "telegram_username",
        escapeLikeValue(value)
      )
      .not("mailing_id", "is", null)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      return {
        data: [],
        error,
      };
    }

    for (const contact of data || []) {
      contactsMap.set(
        contact.id,
        contact
      );
    }
  }

  return {
    data: Array.from(
      contactsMap.values()
    ),
    error: null,
  };
}

async function findMailingContactsByPhone(
  normalizedPhone
) {
  const { data, error } = await supabase
    .from("mailing_contacts")
    .select(CONTACT_FIELDS)
    .not("phone", "is", null)
    .not("mailing_id", "is", null)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    return {
      data: [],
      error,
    };
  }

  return {
    data: (data || []).filter(
      (contact) =>
        normalizePhone(contact.phone) ===
        normalizedPhone
    ),
    error: null,
  };
}

async function findExternalContact({
  normalizedTelegram = "",
  normalizedPhone = "",
}) {
  const { data, error } = await supabase
    .from("mailing_contacts")
    .select(CONTACT_FIELDS)
    .is("mailing_id", null)
    .eq("is_external", true)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    return {
      data: null,
      error,
    };
  }

  const contacts = data || [];

  if (normalizedTelegram) {
    return {
      data:
        contacts.find(
          (contact) =>
            normalizeTelegramUsername(
              contact.telegram_username
            ) === normalizedTelegram
        ) || null,

      error: null,
    };
  }

  if (normalizedPhone) {
    return {
      data:
        contacts.find(
          (contact) =>
            normalizePhone(contact.phone) ===
            normalizedPhone
        ) || null,

      error: null,
    };
  }

  return {
    data: null,
    error: null,
  };
}

async function createExternalContact({
  normalizedTelegram = "",
  normalizedPhone = "",
  managerId,
}) {
  if (!managerId) {
    return {
      data: null,
      error: createServiceError(
        "Не удалось определить менеджера"
      ),
    };
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("mailing_contacts")
    .insert({
      mailing_id: null,

      full_name:
        normalizedTelegram ||
        normalizedPhone ||
        "Новый входящий",

      phone:
        normalizedPhone || null,

      telegram_username:
        normalizedTelegram || null,

      manager_id: managerId,

      status: "responded",

      source: "external",

      is_external: true,

      responded_at: now,

      sent_at: null,

      application_created_at: null,

      comment:
        "Входящий контакт вне рассылки",

      updated_at: now,
    })
    .select(CONTACT_FIELDS)
    .single();

  return {
    data,
    error,
  };
}

async function registerSingleResponse({
  telegram = "",
  phone = "",
  managerId,
}) {
  const normalizedTelegram =
    normalizeTelegramUsername(telegram);

  const normalizedPhone =
    normalizePhone(phone);

  if (
    !normalizedTelegram &&
    !normalizedPhone
  ) {
    return {
      data: null,
      error: createServiceError(
        "Введите Telegram-ник или номер телефона"
      ),
    };
  }

  if (!managerId) {
    return {
      data: null,
      error: createServiceError(
        "Не удалось определить текущего менеджера"
      ),
    };
  }

  const identifier =
    normalizedTelegram ||
    normalizedPhone;

  let mailingSearchResult;

  if (normalizedTelegram) {
    mailingSearchResult =
      await findMailingContactsByTelegram(
        normalizedTelegram
      );
  } else {
    mailingSearchResult =
      await findMailingContactsByPhone(
        normalizedPhone
      );
  }

  if (mailingSearchResult.error) {
    return {
      data: null,
      error:
        mailingSearchResult.error,
    };
  }

  const matchedContacts =
    mailingSearchResult.data || [];

  if (matchedContacts.length > 0) {
    const contact =
      matchedContacts[0];

    if (
      contact.responded_at &&
      contact.manager_id &&
      contact.manager_id !== managerId
    ) {
      return {
        data: {
          identifier,
          matched: true,
          foundInMailing: true,
          createdExternal: false,
          alreadyResponded: true,
          conflict: true,
          contact,
        },
        error: null,
      };
    }

    if (
      contact.responded_at &&
      contact.manager_id === managerId
    ) {
      return {
        data: {
          identifier,
          matched: true,
          foundInMailing: true,
          createdExternal: false,
          alreadyResponded: true,
          conflict: false,
          contact,
        },
        error: null,
      };
    }

    const now =
      new Date().toISOString();

    const {
      data: updatedContact,
      error: updateError,
    } = await supabase
      .from("mailing_contacts")
      .update({
        responded_at:
          contact.responded_at || now,

        manager_id: managerId,

        status: "responded",

        source:
          contact.source || "mailing",

        is_external: false,

        updated_at: now,
      })
      .eq("id", contact.id)
      .select(CONTACT_FIELDS)
      .single();

    if (updateError) {
      return {
        data: null,
        error: updateError,
      };
    }

    return {
      data: {
        identifier,
        matched: true,
        foundInMailing: true,
        createdExternal: false,
        alreadyResponded:
          Boolean(contact.responded_at),
        conflict: false,
        contact: updatedContact,
      },
      error: null,
    };
  }

  const {
    data: existingExternal,
    error: externalError,
  } = await findExternalContact({
    normalizedTelegram,
    normalizedPhone,
  });

  if (externalError) {
    return {
      data: null,
      error: externalError,
    };
  }

  if (existingExternal) {
    if (
      existingExternal.manager_id &&
      existingExternal.manager_id !==
        managerId
    ) {
      return {
        data: {
          identifier,
          matched: false,
          foundInMailing: false,
          external: true,
          createdExternal: false,
          alreadyResponded: true,
          conflict: true,
          contact:
            existingExternal,
        },
        error: null,
      };
    }

    return {
      data: {
        identifier,
        matched: false,
        foundInMailing: false,
        external: true,
        createdExternal: false,
        alreadyResponded: true,
        conflict: false,
        contact: existingExternal,
      },
      error: null,
    };
  }

  const {
    data: newContact,
    error: createError,
  } = await createExternalContact({
    normalizedTelegram,
    normalizedPhone,
    managerId,
  });

  if (createError) {
    return {
      data: null,
      error: createError,
    };
  }

  return {
    data: {
      identifier,
      matched: false,
      foundInMailing: false,
      external: true,
      createdExternal: true,
      alreadyResponded: false,
      conflict: false,
      contact: newContact,
    },

    error: null,
  };
}

async function getContactApplications(
  contactId
) {
  const { data, error } = await supabase
    .from("applications")
    .select(`
      id,
      status
    `)
    .eq(
      "mailing_contact_id",
      contactId
    );

  return {
    data: data || [],
    error,
  };
}

export const incomingResponseService = {
  normalizeTelegramUsername,
  normalizePhone,
  parseIdentifiers,

  async getResponses({
    managerId = null,
  } = {}) {
    let query = supabase
      .from("mailing_contacts")
      .select(CONTACT_FIELDS)
      .not("responded_at", "is", null)
      .order("responded_at", {
        ascending: false,
      });

    if (managerId) {
      query = query.eq(
        "manager_id",
        managerId
      );
    }

    const { data, error } =
      await query;

    return {
      data: data || [],
      error,
    };
  },

  async registerResponse({
    telegram = "",
    phone = "",
    managerId = null,
  } = {}) {
    return registerSingleResponse({
      telegram,
      phone,
      managerId,
    });
  },

  async registerResponses({
    value = "",
    managerId = null,
  } = {}) {
    if (!managerId) {
      return {
        data: null,
        error: createServiceError(
          "Не удалось определить текущего менеджера"
        ),
      };
    }

    const identifiers =
      parseIdentifiers(value);

    if (identifiers.length === 0) {
      return {
        data: null,
        error: createServiceError(
          "Введите хотя бы один Telegram-ник или номер телефона"
        ),
      };
    }

    const found = [];
    const createdExternal = [];
    const alreadyResponded = [];
    const conflicts = [];
    const failed = [];

    for (const identifier of identifiers) {
      try {
        const {
          data,
          error,
        } = await registerSingleResponse({
          telegram:
            identifier.type ===
            "telegram"
              ? identifier.telegram
              : "",

          phone:
            identifier.type ===
            "phone"
              ? identifier.phone
              : "",

          managerId,
        });

        if (error) {
          failed.push({
            identifier:
              identifier.identifier,
            error:
              error.message ||
              "Неизвестная ошибка",
          });

          continue;
        }

        if (data?.conflict) {
          conflicts.push({
            identifier:
              data.identifier,
            contact:
              data.contact,
          });

          continue;
        }

        if (data?.alreadyResponded) {
          alreadyResponded.push({
            identifier:
              data.identifier,
            contact:
              data.contact,
          });

          continue;
        }

        if (data?.foundInMailing) {
          found.push({
            identifier:
              data.identifier,
            contact:
              data.contact,
          });

          continue;
        }

        if (data?.createdExternal) {
          createdExternal.push({
            identifier:
              data.identifier,
            contact:
              data.contact,
          });

          continue;
        }
      } catch (error) {
        failed.push({
          identifier:
            identifier.identifier,

          error:
            error?.message ||
            "Не удалось обработать контакт",
        });
      }
    }

    return {
      data: {
        summary: {
          total:
            identifiers.length,

          found:
            found.length,

          createdExternal:
            createdExternal.length,

          externalCreated:
            createdExternal.length,

          alreadyResponded:
            alreadyResponded.length,

          conflicts:
            conflicts.length,

          failed:
            failed.length,

          notFound: 0,

          successful:
            found.length +
            createdExternal.length +
            alreadyResponded.length,
        },

        found,
        createdExternal,
        externalCreated:
          createdExternal,
        alreadyResponded,
        conflicts,
        failed,
        notFound: [],
      },

      error: null,
    };
  },

  /*
   * =====================================================
   * УДАЛИТЬ ВНЕШНИЙ КОНТАКТ
   * =====================================================
   */

  async deleteExternalResponse({
    contactId,
    managerId,
  }) {
    if (!contactId) {
      return {
        success: false,
        error: createServiceError(
          "Не передан ID контакта"
        ),
      };
    }

    const {
      data: contact,
      error: contactError,
    } = await supabase
      .from("mailing_contacts")
      .select(`
        id,
        mailing_id,
        manager_id,
        is_external,
        application_created_at
      `)
      .eq("id", contactId)
      .maybeSingle();

    if (contactError) {
      return {
        success: false,
        error: contactError,
      };
    }

    if (!contact) {
      return {
        success: false,
        error: createServiceError(
          "Контакт не найден"
        ),
      };
    }

    if (
      contact.manager_id !==
      managerId
    ) {
      return {
        success: false,
        error: createServiceError(
          "Нельзя удалить чужой контакт"
        ),
      };
    }

    if (
      contact.mailing_id ||
      !contact.is_external
    ) {
      return {
        success: false,
        error: createServiceError(
          "Контакт из рассылки нельзя удалить. Используйте отмену отметки ответа."
        ),
      };
    }

    const applicationsResult =
      await getContactApplications(
        contactId
      );

    if (applicationsResult.error) {
      return {
        success: false,
        error:
          applicationsResult.error,
      };
    }

    if (
      applicationsResult.data.length >
      0
    ) {
      return {
        success: false,
        error: createServiceError(
          "По контакту уже есть заявка. Сначала удалите заявку."
        ),
      };
    }

    const { error: deleteError } =
      await supabase
        .from("mailing_contacts")
        .delete()
        .eq("id", contactId)
        .eq(
          "manager_id",
          managerId
        );

    if (deleteError) {
      return {
        success: false,
        error: deleteError,
      };
    }

    return {
      success: true,
      error: null,
    };
  },

  /*
   * =====================================================
   * ОТМЕНИТЬ ОТВЕТ У КОНТАКТА ИЗ РАССЫЛКИ
   * =====================================================
   */

  async undoMailingResponse({
    contactId,
    managerId,
  }) {
    if (!contactId) {
      return {
        data: null,
        error: createServiceError(
          "Не передан ID контакта"
        ),
      };
    }

    const {
      data: contact,
      error: contactError,
    } = await supabase
      .from("mailing_contacts")
      .select(`
        id,
        mailing_id,
        manager_id,
        is_external,
        sent_at,
        application_created_at
      `)
      .eq("id", contactId)
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
        error: createServiceError(
          "Контакт не найден"
        ),
      };
    }

    if (
      contact.manager_id !==
      managerId
    ) {
      return {
        data: null,
        error: createServiceError(
          "Нельзя изменить чужой контакт"
        ),
      };
    }

    if (
      !contact.mailing_id ||
      contact.is_external
    ) {
      return {
        data: null,
        error: createServiceError(
          "Для контакта вне рассылки используйте удаление."
        ),
      };
    }

    const applicationsResult =
      await getContactApplications(
        contactId
      );

    if (applicationsResult.error) {
      return {
        data: null,
        error:
          applicationsResult.error,
      };
    }

    if (
      applicationsResult.data.length >
      0
    ) {
      return {
        data: null,
        error: createServiceError(
          "По контакту уже создана заявка. Сначала удалите заявку."
        ),
      };
    }

    const nextStatus =
      contact.sent_at
        ? "sent"
        : "new";

    const {
      data: updatedContact,
      error: updateError,
    } = await supabase
      .from("mailing_contacts")
      .update({
        responded_at: null,
        manager_id: null,
        status: nextStatus,
        application_created_at:
          null,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", contactId)
      .select(CONTACT_FIELDS)
      .single();

    return {
      data: updatedContact,
      error: updateError,
    };
  },
};

export default incomingResponseService;