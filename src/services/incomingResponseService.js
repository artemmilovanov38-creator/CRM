import { supabase } from "../lib/supabase";

const CONTACT_FIELDS = `
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
    created_at,
    started_at
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

  if (!cleaned) {
    return "";
  }

  return `@${cleaned}`;
}

function normalizePhone(value) {
  let digits = String(value || "").replace(
    /\D/g,
    ""
  );

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

function normalizeStoredTelegram(value) {
  return normalizeTelegramUsername(value);
}

function normalizeStoredPhone(value) {
  return normalizePhone(value);
}

/**
 * Разбирает текст, вставленный менеджером.
 *
 * Можно вставлять:
 * @username
 * @username2
 * +79991234567
 *
 * Поддерживаются переносы строк, пробелы,
 * запятые и точки с запятой.
 */
function parseIdentifiers(value) {
  const source = String(value || "").trim();

  if (!source) {
    return [];
  }

  const rawItems = source
    .split(/[\n,;]+/)
    .flatMap((item) => {
      const trimmed = item.trim();

      if (!trimmed) {
        return [];
      }

      /*
       * Телефон с пробелами не разбиваем.
       * Обычные ники, разделённые пробелами,
       * можно обработать отдельно.
       */
      if (
        trimmed.includes("@") &&
        /\s+/.test(trimmed)
      ) {
        return trimmed.split(/\s+/);
      }

      return [trimmed];
    })
    .map((item) => item.trim())
    .filter(Boolean);

  const prepared = [];
  const usedKeys = new Set();

  for (const rawValue of rawItems) {
    const looksLikeTelegram =
      rawValue.startsWith("@") ||
      /t\.me\//i.test(rawValue) ||
      /^[a-zA-Z][a-zA-Z0-9_]{3,}$/.test(
        rawValue
      );

    const telegram = looksLikeTelegram
      ? normalizeTelegramUsername(rawValue)
      : "";

    const phone = telegram
      ? ""
      : normalizePhone(rawValue);

    if (!telegram && !phone) {
      continue;
    }

    const type = telegram
      ? "telegram"
      : "phone";

    const normalizedValue =
      telegram || phone;

    const key = `${type}:${normalizedValue}`;

    if (usedKeys.has(key)) {
      continue;
    }

    usedKeys.add(key);

    prepared.push({
      rawValue,
      type,
      value: normalizedValue,
    });
  }

  return prepared;
}

function getStartOfTodayISOString() {
  const date = new Date();

  date.setHours(0, 0, 0, 0);

  return date.toISOString();
}

function sortContactsNewestFirst(
  firstContact,
  secondContact
) {
  const firstDate = new Date(
    firstContact?.created_at || 0
  ).getTime();

  const secondDate = new Date(
    secondContact?.created_at || 0
  ).getTime();

  return secondDate - firstDate;
}

/**
 * Загружаем базу, в которой ищем написавших.
 *
 * Если передан mailingId — ищем только
 * в выбранной рассылке.
 *
 * Если mailingId не передан — сначала
 * пытаемся искать среди контактов,
 * загруженных сегодня.
 */
async function getSearchableContacts({
  mailingId = null,
} = {}) {
  let query = supabase
    .from("mailing_contacts")
    .select(CONTACT_FIELDS);

  if (mailingId) {
    query = query.eq(
      "mailing_id",
      mailingId
    );
  } else {
    query = query.gte(
      "created_at",
      getStartOfTodayISOString()
    );
  }

  const { data, error } = await query.order(
    "created_at",
    {
      ascending: false,
    }
  );

  return {
    data: data || [],
    error,
  };
}

function findMatchingContact(
  contacts,
  identifier
) {
  const matchingContacts = contacts.filter(
    (contact) => {
      if (identifier.type === "telegram") {
        return (
          normalizeStoredTelegram(
            contact.telegram_username
          ) === identifier.value
        );
      }

      return (
        normalizeStoredPhone(
          contact.phone
        ) === identifier.value
      );
    }
  );

  return (
    matchingContacts.sort(
      sortContactsNewestFirst
    )[0] || null
  );
}

async function updateMatchedContact({
  contact,
  managerId,
}) {
  const now = new Date().toISOString();

  const payload = {
    manager_id: managerId,
    responded_at:
      contact.responded_at || now,
    status:
      contact.status === "application"
        ? "application"
        : "responded",
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("mailing_contacts")
    .update(payload)
    .eq("id", contact.id)
    .select(CONTACT_FIELDS)
    .single();

  return {
    data,
    error,
  };
}

export const incomingResponseService = {
  normalizeTelegramUsername,
  normalizePhone,
  parseIdentifiers,

  /**
   * Получить отклики.
   *
   * Менеджеру возвращаются только его
   * контакты. Администратор и head могут
   * получить все отклики.
   */
  async getResponses({
    managerId = null,
    onlyToday = false,
  } = {}) {
    let query = supabase
      .from("mailing_contacts")
      .select(CONTACT_FIELDS)
      .not("responded_at", "is", null);

    if (managerId) {
      query = query.eq(
        "manager_id",
        managerId
      );
    }

    if (onlyToday) {
      query = query.gte(
        "responded_at",
        getStartOfTodayISOString()
      );
    }

    const { data, error } =
      await query.order(
        "responded_at",
        {
          ascending: false,
        }
      );

    return {
      data: data || [],
      error,
    };
  },

  /**
   * Добавить одного ответившего.
   *
   * Оставлено для совместимости
   * с текущим Incoming.jsx.
   */
  async registerResponse({
    telegram = "",
    phone = "",
    managerId = null,
    mailingId = null,
  } = {}) {
    if (!managerId) {
      return {
        data: null,
        error: createServiceError(
          "Не удалось определить менеджера"
        ),
      };
    }

    const identifierValue =
      telegram || phone;

    const result =
      await this.registerResponses({
        value: identifierValue,
        managerId,
        mailingId,
      });

    if (result.error) {
      return {
        data: null,
        error: result.error,
      };
    }

    const firstFound =
      result.data.found[0];

    const firstAlreadyResponded =
      result.data.alreadyResponded[0];

    const firstConflict =
      result.data.conflicts[0];

    const firstNotFound =
      result.data.notFound[0];

    if (firstConflict) {
      return {
        data: {
          matched: true,
          conflict: true,
          contact:
            firstConflict.contact,
          identifier:
            firstConflict.identifier,
          manager:
            firstConflict.manager,
        },
        error: null,
      };
    }

    if (firstAlreadyResponded) {
      return {
        data: {
          matched: true,
          alreadyResponded: true,
          contact:
            firstAlreadyResponded.contact,
          identifier:
            firstAlreadyResponded.identifier,
        },
        error: null,
      };
    }

    if (firstFound) {
      return {
        data: {
          matched: true,
          alreadyResponded: false,
          contact:
            firstFound.contact,
          identifier:
            firstFound.identifier,
        },
        error: null,
      };
    }

    return {
      data: {
        matched: false,
        identifier:
          firstNotFound?.identifier ||
          identifierValue,
      },
      error: null,
    };
  },

  /**
   * Массовое внесение написавших.
   *
   * value:
   * @user1
   * @user2
   * +79991234567
   */
  async registerResponses({
    value = "",
    managerId = null,
    mailingId = null,
  } = {}) {
    if (!managerId) {
      return {
        data: null,
        error: createServiceError(
          "Не удалось определить менеджера"
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

    const {
      data: searchableContacts,
      error: contactsError,
    } = await getSearchableContacts({
      mailingId,
    });

    if (contactsError) {
      return {
        data: null,
        error: contactsError,
      };
    }

    const result = {
      total: identifiers.length,
      found: [],
      alreadyResponded: [],
      conflicts: [],
      notFound: [],
      failed: [],
    };

    for (const identifier of identifiers) {
      const contact =
        findMatchingContact(
          searchableContacts,
          identifier
        );

      if (!contact) {
        result.notFound.push({
          identifier:
            identifier.value,
          type: identifier.type,
          rawValue:
            identifier.rawValue,
        });

        continue;
      }

      /*
       * Пользователь уже был внесён
       * другим менеджером.
       */
      if (
        contact.responded_at &&
        contact.manager_id &&
        contact.manager_id !== managerId
      ) {
        result.conflicts.push({
          identifier:
            identifier.value,
          contact,
          manager:
            contact.manager || null,
        });

        continue;
      }

      /*
       * Этот же менеджер уже внёс пользователя.
       */
      if (
        contact.responded_at &&
        contact.manager_id === managerId
      ) {
        result.alreadyResponded.push({
          identifier:
            identifier.value,
          contact,
        });

        continue;
      }

      const {
        data: updatedContact,
        error: updateError,
      } = await updateMatchedContact({
        contact,
        managerId,
      });

      if (updateError) {
        result.failed.push({
          identifier:
            identifier.value,
          contactId: contact.id,
          error:
            updateError.message ||
            "Не удалось обновить контакт",
        });

        continue;
      }

      result.found.push({
        identifier:
          identifier.value,
        contact: updatedContact,
      });
    }

    return {
      data: {
        ...result,

        summary: {
          total: result.total,
          found: result.found.length,

          alreadyResponded:
            result.alreadyResponded.length,

          conflicts:
            result.conflicts.length,

          notFound:
            result.notFound.length,

          failed:
            result.failed.length,
        },
      },

      error: null,
    };
  },
};

export default incomingResponseService;