import { supabase } from "../lib/supabase";
import { profileService } from "./profileService";
import {
  escapeIlike,
  stripTelegramPrefix,
} from "../utils/searchMatch";

const MY_CONTACTS_PAGE_SIZE = 200;

const normalizePhone = (value) => {
  if (!value) return null;

  
  

  const digits = String(value).replace(/\D/g, "");

  if (!digits) return null;

  if (digits.length === 11 && digits.startsWith("8")) {
    return `7${digits.slice(1)}`;
  }

  if (digits.length === 10) {
    return `7${digits}`;
  }

  return digits;
};

const normalizeTelegram = (value) => {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const username = String(value)
    .trim()
    .replace(
      /^https?:\/\/t\.me\//i,
      ""
    )
    .replace(
      /^t\.me\//i,
      ""
    )
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .trim();

  if (!username) {
    return null;
  }

  /*
   * Telegram username:
   * 5–32 символа,
   * буквы, цифры, underscore.
   */
  if (
    !/^[a-zA-Z0-9_]{5,32}$/.test(
      username
    )
  ) {
    return null;
  }

  return `@${username.toLowerCase()}`;
};
const getActiveManagers = async () => {
  const { data, error } = await supabase
    .from("profiles")
    .select(`
      id,
      full_name,
      email,
      role,
      status,
      avatar
    `)
    .eq("role", "manager")
    .eq("status", "active")
    .order("full_name", {
      ascending: true,
    });

  return {
    data: data || [],
    error,
  };
};
const normalizeContact = (
  contact,
  index
) => {
  const safeContact =
    contact &&
    typeof contact === "object"
      ? contact
      : {};

  /*
   * Поддерживаем как обычные объекты:
   *
   * {
   *   Телефон: "...",
   *   Telegram: "..."
   * }
   *
   * так и строки/ячейки без
   * нормальных заголовков.
   */
  const values = Array.isArray(
    safeContact
  )
    ? safeContact
    : Object.values(
        safeContact
      );

  const cleanedValues =
    values
      .map((value) =>
        String(
          value ?? ""
        ).trim()
      )
      .filter(Boolean);

  let fullName =
    safeContact.full_name ||
    safeContact.name ||
    safeContact.fullName ||
    safeContact["ФИО"] ||
    safeContact["Имя"] ||
    safeContact["Фамилия Имя"] ||
    null;

  let phone = normalizePhone(
    safeContact.phone ||
      safeContact.phone_number ||
      safeContact.mobile ||
      safeContact["Телефон"] ||
      safeContact[
        "Номер телефона"
      ] ||
      safeContact["Номер"] ||
      null
  );

  let telegram =
    normalizeTelegram(
      safeContact.telegram ||
        safeContact
          .telegram_username ||
        safeContact.username ||
        safeContact["Telegram"] ||
        safeContact[
          "Telegram username"
        ] ||
        safeContact["Ник"] ||
        safeContact[
          "Телеграм"
        ] ||
        null
    );

  let email =
    safeContact.email ||
    safeContact["Email"] ||
    safeContact["E-mail"] ||
    safeContact["Почта"] ||
    null;

  /*
   * Если колонок нет или они
   * называются неизвестным образом,
   * анализируем каждую ячейку.
   */
  for (
    const rawValue
    of cleanedValues
  ) {
    /*
     * EMAIL
     */
    if (
      !email &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        rawValue
      )
    ) {
      email =
        rawValue.trim();

      continue;
    }

    /*
     * TELEGRAM
     *
     * Сначала явно Telegram:
     * @user / t.me/user
     */
    if (
      !telegram &&
      (
        rawValue.startsWith(
          "@"
        ) ||
        /^https?:\/\/t\.me\//i.test(
          rawValue
        ) ||
        /^t\.me\//i.test(
          rawValue
        )
      )
    ) {
      const candidate =
        normalizeTelegram(
          rawValue
        );

      if (candidate) {
        telegram =
          candidate;

        continue;
      }
    }

    /*
     * PHONE
     */
    if (!phone) {
      const digits =
        rawValue.replace(
          /\D/g,
          ""
        );

      if (
        digits.length >= 10 &&
        digits.length <= 15
      ) {
        const candidatePhone =
          normalizePhone(
            rawValue
          );

        if (
          candidatePhone
        ) {
          phone =
            candidatePhone;

          continue;
        }
      }
    }

    /*
     * TELEGRAM БЕЗ @
     *
     * Например:
     * Sinus_max
     */
    if (!telegram) {
      const candidate =
        normalizeTelegram(
          rawValue
        );

      if (candidate) {
        telegram =
          candidate;

        continue;
      }
    }
  }

  /*
   * Для строки, содержащей только
   * Telegram-ник, не записываем
   * этот ник ещё и как ФИО.
   */
  if (
    fullName &&
    telegram
  ) {
    const normalizedNameAsTelegram =
      normalizeTelegram(
        fullName
      );

    if (
      normalizedNameAsTelegram ===
      telegram
    ) {
      fullName = null;
    }
  }

  return {
    full_name:
      fullName
        ? String(
            fullName
          ).trim()
        : null,

    phone:
      phone || null,

    telegram_username:
      telegram || null,

    email:
      email
        ? String(
            email
          ).trim()
          .toLowerCase()
        : null,

    source_row_number:
      index + 1,

    raw_data:
      safeContact,

    status: "new",

    /*
     * Ник уже известен из файла,
     * поэтому Telegram найден.
     */
    telegram_found:
      Boolean(telegram),
  };
};

const getContactsByMailingId = async (mailingId) => {
  if (!mailingId) {
    return {
      data: [],
      error: new Error("Не указан ID партии."),
    };
  }

  const {
    data: userData,
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      data: [],
      error: userError,
    };
  }

  const currentUser = userData?.user;

  if (!currentUser?.id) {
    return {
      data: [],
      error: new Error(
        "Пользователь не авторизован."
      ),
    };
  }

  const {
    data: currentProfile,
    error: profileError,
  } = await profileService.getProfileById(
    currentUser.id
  );

  if (profileError) {
    return {
      data: [],
      error: profileError,
    };
  }

  if (!currentProfile) {
    return {
      data: [],
      error: new Error(
        "Профиль пользователя не найден."
      ),
    };
  }

  let query = supabase
    .from("mailing_contacts")
    .select(`
      *,
      manager:profiles (
        id,
        full_name,
        email
      )
    `)
    .eq("mailing_id", mailingId);

  if (currentProfile.role === "manager") {
    query = query.eq(
      "manager_id",
      currentUser.id
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
};

const getContactById = async (contactId) => {
  const { data, error } = await supabase
    .from("mailing_contacts")
    .select(`
      *,
      manager:profiles (
        id,
        full_name,
        email
      )
    `)
    .eq("id", contactId)
    .single();

  return {
    data,
    error,
  };
};

const createContact = async (
  mailingId,
  contact
) => {
  if (!mailingId) {
    return {
      data: null,
      error: new Error("Не указан ID партии."),
    };
  }

  const preparedContact = normalizeContact(
    contact,
    0
  );

  const { data, error } = await supabase
    .from("mailing_contacts")
    .insert({
      ...preparedContact,
      mailing_id: mailingId,
    })
    .select()
    .single();

  return {
    data,
    error,
  };
};

const importContacts = async (mailingId, contacts) => {
  if (!mailingId) {
    return {
      data: [],
      error: new Error("Не указан ID партии."),
    };
  }

  if (!Array.isArray(contacts)) {
    return {
      data: [],
      error: new Error("Контакты должны быть массивом."),
    };
  }

  /*
   * =====================================================
   * 1. НОРМАЛИЗУЕМ КОНТАКТЫ
   * =====================================================
   */

  const preparedContacts = contacts
    .map((contact, index) => ({
      ...normalizeContact(contact, index),

      mailing_id: mailingId,

      source: "mailing",

      is_external: false,
    }))
    .filter((contact) => {
      return Boolean(
        contact.phone ||
          contact.email ||
          contact.telegram_username ||
          contact.full_name
      );
    });

  if (preparedContacts.length === 0) {
    return {
      data: [],
      error: new Error(
        "В файле не найдено подходящих контактов."
      ),
    };
  }

  /*
   * =====================================================
   * 2. УБИРАЕМ ДУБЛИ ВНУТРИ САМОГО ФАЙЛА
   * =====================================================
   */

  const uniqueContacts = [];

  const usedPhones = new Set();
  const usedTelegrams = new Set();

  for (const contact of preparedContacts) {
    const phoneKey = contact.phone
      ? String(contact.phone).trim()
      : null;

    const telegramKey =
      contact.telegram_username
        ? String(contact.telegram_username)
            .trim()
            .toLowerCase()
        : null;

    /*
     * Если совпал телефон —
     * это дубль.
     */
    if (
      phoneKey &&
      usedPhones.has(phoneKey)
    ) {
      continue;
    }

    /*
     * Если совпал Telegram —
     * это дубль.
     */
    if (
      telegramKey &&
      usedTelegrams.has(telegramKey)
    ) {
      continue;
    }

    if (phoneKey) {
      usedPhones.add(phoneKey);
    }

    if (telegramKey) {
      usedTelegrams.add(telegramKey);
    }

    uniqueContacts.push(contact);
  }

  /*
   * =====================================================
   * 3. ПРОВЕРЯЕМ СУЩЕСТВУЮЩИЕ КОНТАКТЫ
   * =====================================================
   *
   * ВАЖНО:
   *
   * Больше НЕ делаем один большой запрос:
   *
   * select все контакты mailing_id
   *
   * Вместо этого проверяем данные небольшими пачками.
   */

  const existingPhones = new Set();
  const existingTelegrams = new Set();

  /*
   * Размер одной пачки.
   *
   * 100 достаточно мало, чтобы запросы
   * не становились тяжёлыми.
   */
  const CHECK_CHUNK_SIZE = 100;

  /*
   * =====================================================
   * 4. ПРОВЕРЯЕМ TELEGRAM
   * =====================================================
   */

  const telegramsToCheck = [
    ...new Set(
      uniqueContacts
        .map((contact) =>
          contact.telegram_username
            ? String(
                contact.telegram_username
              )
                .trim()
                .toLowerCase()
            : null
        )
        .filter(Boolean)
    ),
  ];

  for (
    let index = 0;
    index < telegramsToCheck.length;
    index += CHECK_CHUNK_SIZE
  ) {
    const chunk = telegramsToCheck.slice(
      index,
      index + CHECK_CHUNK_SIZE
    );

    const {
      data,
      error,
    } = await supabase
      .from("mailing_contacts")
      .select("telegram_username")
      .eq("mailing_id", mailingId)
      .in("telegram_username", chunk);

    if (error) {
      console.error(
        "Ошибка проверки Telegram:",
        error
      );

      return {
        data: [],
        error: new Error(
          `Не удалось проверить существующие Telegram-контакты: ${
            error.message ||
            "ошибка базы данных"
          }`
        ),
      };
    }

    for (const row of data || []) {
      if (!row.telegram_username) {
        continue;
      }

      existingTelegrams.add(
        String(row.telegram_username)
          .trim()
          .toLowerCase()
      );
    }
  }

  /*
   * =====================================================
   * 5. ПРОВЕРЯЕМ ТЕЛЕФОНЫ
   * =====================================================
   */

  const phonesToCheck = [
    ...new Set(
      uniqueContacts
        .map((contact) =>
          contact.phone
            ? String(contact.phone).trim()
            : null
        )
        .filter(Boolean)
    ),
  ];

  for (
    let index = 0;
    index < phonesToCheck.length;
    index += CHECK_CHUNK_SIZE
  ) {
    const chunk = phonesToCheck.slice(
      index,
      index + CHECK_CHUNK_SIZE
    );

    const {
      data,
      error,
    } = await supabase
      .from("mailing_contacts")
      .select("phone")
      .eq("mailing_id", mailingId)
      .in("phone", chunk);

    if (error) {
      console.error(
        "Ошибка проверки телефонов:",
        error
      );

      return {
        data: [],
        error: new Error(
          `Не удалось проверить существующие телефоны: ${
            error.message ||
            "ошибка базы данных"
          }`
        ),
      };
    }

    for (const row of data || []) {
      if (!row.phone) {
        continue;
      }

      existingPhones.add(
        String(row.phone).trim()
      );
    }
  }

  /*
   * =====================================================
   * 6. ОСТАВЛЯЕМ ТОЛЬКО НОВЫЕ КОНТАКТЫ
   * =====================================================
   */

  const contactsToInsert =
    uniqueContacts.filter((contact) => {
      const phoneKey = contact.phone
        ? String(contact.phone).trim()
        : null;

      const telegramKey =
        contact.telegram_username
          ? String(contact.telegram_username)
              .trim()
              .toLowerCase()
          : null;

      if (
        phoneKey &&
        existingPhones.has(phoneKey)
      ) {
        return false;
      }

      if (
        telegramKey &&
        existingTelegrams.has(
          telegramKey
        )
      ) {
        return false;
      }

      return true;
    });

  /*
   * =====================================================
   * 7. ЕСЛИ ВСЁ УЖЕ ЕСТЬ
   * =====================================================
   *
   * Это НЕ ошибка.
   *
   * Например:
   *
   * файл = 1877
   * в базе = 1877
   *
   * Просто возвращаем статистику.
   */

  if (contactsToInsert.length === 0) {
    return {
      data: [],
      error: null,

      stats: {
        received: contacts.length,

        valid: preparedContacts.length,

        unique: uniqueContacts.length,

        inserted: 0,

        skippedExisting:
          uniqueContacts.length,

        duplicatesInFile:
          preparedContacts.length -
          uniqueContacts.length,
      },

      message:
        `Новых контактов нет. ` +
        `${uniqueContacts.length} уже существуют в этой партии.`,
    };
  }

  /*
   * =====================================================
   * 8. ВСТАВЛЯЕМ НОВЫЕ КОНТАКТЫ ПОРЦИЯМИ
   * =====================================================
   */

  const INSERT_CHUNK_SIZE = 100;

  const insertedContacts = [];

  for (
    let index = 0;
    index < contactsToInsert.length;
    index += INSERT_CHUNK_SIZE
  ) {
    const chunk = contactsToInsert.slice(
      index,
      index + INSERT_CHUNK_SIZE
    );

    const {
      data,
      error,
    } = await supabase
      .from("mailing_contacts")
      .insert(chunk)
      .select();

    if (error) {
      console.error(
        "Ошибка импорта контактов:",
        {
          chunkStart: index,
          chunkSize: chunk.length,
          insertedBeforeError:
            insertedContacts.length,
          error,
        }
      );

      return {
        data: insertedContacts,

        error: new Error(
          `Импорт остановлен. ` +
          `Успешно добавлено: ${insertedContacts.length}. ` +
          `Ошибка: ${
            error.message ||
            "ошибка базы данных"
          }`
        ),

        stats: {
          received: contacts.length,

          valid: preparedContacts.length,

          unique: uniqueContacts.length,

          inserted:
            insertedContacts.length,

          skippedExisting:
            uniqueContacts.length -
            contactsToInsert.length,

          duplicatesInFile:
            preparedContacts.length -
            uniqueContacts.length,
        },
      };
    }

    insertedContacts.push(
      ...(data || [])
    );
  }

  /*
   * =====================================================
   * 9. РЕЗУЛЬТАТ
   * =====================================================
   */

  return {
    data: insertedContacts,

    error: null,

    stats: {
      received: contacts.length,

      valid: preparedContacts.length,

      unique: uniqueContacts.length,

      inserted:
        insertedContacts.length,

      skippedExisting:
        uniqueContacts.length -
        contactsToInsert.length,

      duplicatesInFile:
        preparedContacts.length -
        uniqueContacts.length,
    },

    message:
      `Импорт завершён. ` +
      `Добавлено: ${insertedContacts.length}. ` +
      `Уже существовали: ${
        uniqueContacts.length -
        contactsToInsert.length
      }.`,
  };
};
const updateContact = async (
  contactId,
  updates
) => {
  const { data, error } = await supabase
    .from("mailing_contacts")
    .update(updates)
    .eq("id", contactId)
    .select()
    .single();

  return {
    data,
    error,
  };
};
const updateComment = async (
  contactId,
  comment
) => {
  if (!contactId) {
    return {
      data: null,
      error: new Error(
        "Не указан ID контакта."
      ),
    };
  }

  const { data, error } = await supabase
    .from("mailing_contacts")
    .update({
      comment: comment?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId)
    .select()
    .single();

  return {
    data,
    error,
  };
};

const deleteContact = async (contactId) => {
  const { error } = await supabase
    .from("mailing_contacts")
    .delete()
    .eq("id", contactId);

  return {
    error,
  };
};

const deleteContactsByMailingId = async (
  mailingId
) => {
  const { error } = await supabase
    .from("mailing_contacts")
    .delete()
    .eq("mailing_id", mailingId);

  return {
    error,
  };
};

const assignManager = async (
  contactId,
  managerId
) => {
  return updateContact(contactId, {
    manager_id: managerId || null,

    assigned_at: managerId
      ? new Date().toISOString()
      : null,

    status: managerId
      ? "assigned"
      : "new",
  });
};

const markAsSent = async (contactId) => {
  return updateContact(contactId, {
    status: "sent",
    sent_at: new Date().toISOString(),
  });
};

const markAsResponded = async (contactId) => {
  return updateContact(contactId, {
    status: "responded",
    responded_at: new Date().toISOString(),
  });
};

const markAsApplication = async (
  contactId
) => {
  return updateContact(contactId, {
    status: "application",
    application_created_at:
      new Date().toISOString(),
  });
};

const markAsOpened = async (contactId) => {
  return updateContact(contactId, {
    status: "opened",
    opened_at: new Date().toISOString(),
  });
};

const markTelegramFound = async (
  contactId,
  telegramData
) => {
  return updateContact(contactId, {
    telegram_found: true,

    telegram_username:
      telegramData?.telegram_username ||
      telegramData?.username ||
      null,

    telegram_user_id:
      telegramData?.telegram_user_id ||
      telegramData?.user_id ||
      null,

    status: "telegram_found",
  });
};

const markTelegramNotFound = async (
  contactId
) => {
  return updateContact(contactId, {
    telegram_found: false,
    telegram_username: null,
    telegram_user_id: null,
    status: "telegram_not_found",
  });
};
const autoAssignManagers = async (mailingId) => {
  if (!mailingId) {
    return {
      error: new Error("Не указан ID партии."),
    };
  }

  const managersResult = await getActiveManagers();

  if (managersResult.error) {
    return {
      error: managersResult.error,
    };
  }

  const managers = managersResult.data;

  if (managers.length === 0) {
    return {
      error: new Error("Нет активных менеджеров."),
    };
  }

  const contactsResult =
    await getContactsByMailingId(mailingId);

  if (contactsResult.error) {
    return {
      error: contactsResult.error,
    };
  }

  const contacts = contactsResult.data.filter(
    (contact) => !contact.manager_id
  );

  let managerIndex = 0;

  for (const contact of contacts) {
    await assignManager(
      contact.id,
      managers[managerIndex].id
    );

    managerIndex++;

    if (managerIndex >= managers.length) {
      managerIndex = 0;
    }
  }

  return {
    data: true,
    error: null,
  };
};

const hydrateContactMailings = async (
  contacts
) => {
  const mailingIds = [
    ...new Set(
      (contacts || [])
        .map((contact) => contact.mailing_id)
        .filter(Boolean)
    ),
  ];

  if (mailingIds.length === 0) {
    return contacts;
  }

  const { data, error } = await supabase
    .from("mailings")
    .select(
      "id, name, title, supplier, status, mailing_method, created_at"
    )
    .in("id", mailingIds);

  if (error || !data) {
    return contacts;
  }

  const mailingsById = Object.fromEntries(
    data.map((mailing) => [mailing.id, mailing])
  );

  return contacts.map((contact) => ({
    ...contact,
    mailing:
      (contact.mailing_id &&
        mailingsById[contact.mailing_id]) ||
      contact.mailing ||
      null,
  }));
};

const getMyContacts = async () => {
  const {
    data: userData,
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      data: [],
      error: userError,
    };
  }

  const currentUser = userData?.user;

  if (!currentUser?.id) {
    return {
      data: [],
      error: new Error(
        "Пользователь не авторизован."
      ),
    };
  }

  const rows = [];
  let from = 0;

  while (from < 100000) {
    const { data, error } = await supabase
      .from("mailing_contacts")
      .select("*")
      .eq("manager_id", currentUser.id)
      .order("created_at", {
        ascending: false,
      })
      .range(
        from,
        from + MY_CONTACTS_PAGE_SIZE - 1
      );

    if (error) {
      return {
        data: await hydrateContactMailings(rows),
        error,
      };
    }

    const chunk = data || [];
    rows.push(...chunk);

    if (chunk.length < MY_CONTACTS_PAGE_SIZE) {
      break;
    }

    from += MY_CONTACTS_PAGE_SIZE;
  }

  return {
    data: await hydrateContactMailings(rows),
    error: null,
  };
};

const searchMyContacts = async (query) => {
  const {
    data: userData,
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      data: [],
      error: userError,
    };
  }

  const currentUser = userData?.user;

  if (!currentUser?.id) {
    return {
      data: [],
      error: new Error(
        "Пользователь не авторизован."
      ),
    };
  }

  const needle = stripTelegramPrefix(query);
  const escaped = escapeIlike(needle);

  if (!escaped) {
    return {
      data: [],
      error: null,
    };
  }

  const { data, error } = await supabase
    .from("mailing_contacts")
    .select("*")
    .eq("manager_id", currentUser.id)
    .or(
      [
        `telegram_username.ilike.%${escaped}%`,
        `telegram_username.ilike.%@${escaped}%`,
        `full_name.ilike.%${escaped}%`,
        `phone.ilike.%${escaped}%`,
      ].join(",")
    )
    .order("created_at", {
      ascending: false,
    })
    .limit(100);

  if (error) {
    return {
      data: [],
      error,
    };
  }

  return {
    data: await hydrateContactMailings(
      data || []
    ),
    error: null,
  };
};

export const mailingContactService = {
  getMyContacts,
  searchMyContacts,
  autoAssignManagers,
  normalizePhone,
  normalizeContact,
  normalizeTelegram,
  getContactsByMailingId,
  getContactById,
  updateComment,
  createContact,
  getActiveManagers,
  importContacts,
  updateContact,
  deleteContact,
  deleteContactsByMailingId,
  assignManager,
  markAsSent,
  markAsResponded,
  markAsApplication,
  markAsOpened,
  markTelegramFound,
  markTelegramNotFound,
};

export default mailingContactService;