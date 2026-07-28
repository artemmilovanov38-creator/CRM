import { supabase } from "../lib/supabase";

function normalizeTelegramUsername(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/^https?:\/\/t\.me\//i, "")
    .replace(/^t\.me\//i, "")
    .replace(/^@+/, "")
    .trim()
    .toLowerCase();

  if (!cleaned) {
    return "";
  }

  return `@${cleaned}`;
}

function escapeLikeValue(value) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

export const incomingResponseService = {
  normalizeTelegramUsername,

  async getResponses() {
    const { data, error } = await supabase
      .from("mailing_contacts")
      .select(`
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
      `)
      .not("responded_at", "is", null)
      .order("responded_at", {
        ascending: false,
      });

    return {
      data: data || [],
      error,
    };
  },

  async registerResponse(username, managerId = null) {
    const normalizedUsername =
      normalizeTelegramUsername(username);

    if (!normalizedUsername) {
      return {
        data: null,
        error: new Error(
          "Введите Telegram-ник"
        ),
      };
    }

    const usernameWithoutAt =
      normalizedUsername.slice(1);

    const searchValues = [
      normalizedUsername,
      usernameWithoutAt,
    ];

    let matchedContacts = [];
    let searchError = null;

    for (const searchValue of searchValues) {
      const safeValue =
        escapeLikeValue(searchValue);

      const { data, error } = await supabase
        .from("mailing_contacts")
        .select(`
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
        `)
        .ilike(
          "telegram_username",
          safeValue
        )
        .not("sent_at", "is", null)
        .order("sent_at", {
          ascending: false,
        })
        .limit(1);

      if (error) {
        searchError = error;
        break;
      }

      if (data?.length) {
        matchedContacts = data;
        break;
      }
    }

    if (searchError) {
      return {
        data: null,
        error: searchError,
      };
    }

    const contact = matchedContacts[0];

    if (!contact) {
      return {
        data: {
          matched: false,
          username: normalizedUsername,
        },
        error: null,
      };
    }

    if (contact.responded_at) {
      return {
        data: {
          matched: true,
          alreadyResponded: true,
          contact,
        },
        error: null,
      };
    }

    const respondedAt =
      new Date().toISOString();

    const updatePayload = {
      responded_at: respondedAt,
      status: "responded",
    };

    if (managerId) {
      updatePayload.manager_id = managerId;
    }

    const { data: updatedContacts, error } =
      await supabase
        .from("mailing_contacts")
        .update(updatePayload)
        .eq("mailing_id", contact.mailing_id)
        .ilike(
          "telegram_username",
          escapeLikeValue(
            contact.telegram_username
          )
        )
        .select(`
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
        `);

    if (error) {
      return {
        data: null,
        error,
      };
    }

    const updatedContact =
      updatedContacts?.[0] || null;

    return {
      data: {
        matched: true,
        alreadyResponded: false,
        contact: updatedContact,
      },
      error: null,
    };
  },
};