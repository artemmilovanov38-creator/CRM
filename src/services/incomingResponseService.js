import { supabase } from "../lib/supabase";

const CONTACT_FIELDS = `
  mailing_id,
  id,
  full_name,
  phone,
  telegram_username,
  manager_id,
  status,
  sent_at,
  responded_at,
  application_created_at,
  created_at,
  updated_at
`;

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

  // 8 999 123-45-67 → 7 999 123-45-67
  if (
    digits.length === 11 &&
    digits.startsWith("8")
  ) {
    digits = `7${digits.slice(1)}`;
  }

  // 999 123-45-67 → 7 999 123-45-67
  if (digits.length === 10) {
    digits = `7${digits}`;
  }

  return digits;
}

function escapeLikeValue(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

function sortBySentDateDescending(
  firstContact,
  secondContact
) {
  const firstDate = new Date(
    firstContact?.sent_at || 0
  ).getTime();

  const secondDate = new Date(
    secondContact?.sent_at || 0
  ).getTime();

  return secondDate - firstDate;
}

async function findContactsByTelegram(
  normalizedTelegram
) {
  const usernameWithoutAt =
    normalizedTelegram.slice(1);

  const searchValues = [
    normalizedTelegram,
    usernameWithoutAt,
  ];

  const contactsById = new Map();

  for (const searchValue of searchValues) {
    const { data, error } = await supabase
      .from("mailing_contacts")
      .select(CONTACT_FIELDS)
      .ilike(
        "telegram_username",
        escapeLikeValue(searchValue)
      )
      .not("sent_at", "is", null)
      .order("sent_at", {
        ascending: false,
      });

    if (error) {
      return {
        data: [],
        error,
      };
    }

    for (const contact of data || []) {
      contactsById.set(contact.id, contact);
    }
  }

  return {
    data: Array.from(
      contactsById.values()
    ).sort(sortBySentDateDescending),
    error: null,
  };
}

async function findContactsByPhone(
  normalizedPhone
) {
  /*
   * В базе номера могут храниться в разных
   * форматах: +7, 8, с пробелами и скобками.
   *
   * Поэтому получаем контакты с телефонами
   * и сравниваем номера после нормализации.
   */
  const { data, error } = await supabase
    .from("mailing_contacts")
    .select(CONTACT_FIELDS)
    .not("phone", "is", null)
    .not("sent_at", "is", null)
    .order("sent_at", {
      ascending: false,
    });

  if (error) {
    return {
      data: [],
      error,
    };
  }

  const matchingContacts = (data || [])
    .filter(
      (contact) =>
        normalizePhone(contact.phone) ===
        normalizedPhone
    )
    .sort(sortBySentDateDescending);

  return {
    data: matchingContacts,
    error: null,
  };
}

export const incomingResponseService = {
  normalizeTelegramUsername,
  normalizePhone,

  async getResponses() {
    const { data, error } = await supabase
      .from("mailing_contacts")
      .select(CONTACT_FIELDS)
      .not("responded_at", "is", null)
      .order("responded_at", {
        ascending: false,
      });

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
        error: new Error(
          "Введите Telegram-ник или номер телефона"
        ),
      };
    }

    let searchResult;

    if (normalizedTelegram) {
      searchResult =
        await findContactsByTelegram(
          normalizedTelegram
        );
    } else {
      searchResult =
        await findContactsByPhone(
          normalizedPhone
        );
    }

    if (searchResult.error) {
      return {
        data: null,
        error: searchResult.error,
      };
    }

    const matchedContacts =
      searchResult.data || [];

    if (matchedContacts.length === 0) {
      return {
        data: {
          matched: false,
          identifier:
            normalizedTelegram ||
            normalizedPhone,
          telegram: normalizedTelegram,
          phone: normalizedPhone,
        },
        error: null,
      };
    }

    /*
     * Если этот Telegram или номер уже когда-либо
     * отмечали как ответивший, повторно не добавляем.
     */
    const respondedContact =
      matchedContacts.find(
        (contact) =>
          Boolean(contact.responded_at)
      );

    if (respondedContact) {
      return {
        data: {
          matched: true,
          alreadyResponded: true,
          contact: respondedContact,
          identifier:
            normalizedTelegram ||
            normalizedPhone,
        },
        error: null,
      };
    }

    /*
     * Выбираем самый свежий контакт,
     * которому действительно отправляли рассылку.
     */
    const contact = matchedContacts[0];

    if (!contact?.id) {
      return {
        data: null,
        error: new Error(
          "Не удалось определить найденный контакт"
        ),
      };
    }

    const updatePayload = {
      responded_at: new Date().toISOString(),
      status: "responded",
    };

    if (managerId) {
      updatePayload.manager_id = managerId;
    }

    const {
      data: updatedContact,
      error: updateError,
    } = await supabase
      .from("mailing_contacts")
      .update(updatePayload)
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
        matched: true,
        alreadyResponded: false,
        contact: updatedContact,
        identifier:
          normalizedTelegram ||
          normalizedPhone,
      },
      error: null,
    };
  },
};