import { supabase } from "../lib/supabase";
import { profileService } from "./profileService";

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
const normalizeContact = (contact, index) => {
  const fullName =
    contact.full_name ||
    contact.name ||
    contact.fullName ||
    contact["ФИО"] ||
    contact["Имя"] ||
    null;

  const phone = normalizePhone(
    contact.phone ||
      contact.phone_number ||
      contact.mobile ||
      contact["Телефон"] ||
      contact["Номер телефона"]
  );

  const email =
    contact.email ||
    contact["Email"] ||
    contact["Почта"] ||
    null;

  return {
    full_name: fullName
      ? String(fullName).trim()
      : null,

    phone,

    email: email
      ? String(email).trim()
      : null,

    source_row_number: index + 2,

    raw_data: contact,

    status: "new",
    telegram_found: false,
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

const importContacts = async (
  mailingId,
  contacts
) => {
  if (!mailingId) {
    return {
      data: [],
      error: new Error("Не указан ID партии."),
    };
  }

  if (!Array.isArray(contacts)) {
    return {
      data: [],
      error: new Error(
        "Контакты должны быть массивом."
      ),
    };
  }

  const preparedContacts = contacts
    .map((contact, index) => ({
      ...normalizeContact(contact, index),
      mailing_id: mailingId,
    }))
    .filter((contact) => {
      return (
        contact.phone ||
        contact.email ||
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

  const uniqueContacts = [];
  const usedPhones = new Set();

  for (const contact of preparedContacts) {
    if (contact.phone) {
      const key = contact.phone;

      if (usedPhones.has(key)) {
        continue;
      }

      usedPhones.add(key);
    }

    uniqueContacts.push(contact);
  }

  const phones = uniqueContacts
    .map((contact) => contact.phone)
    .filter(Boolean);

  let existingPhones = new Set();

  if (phones.length > 0) {
    const { data: existingContacts, error: existingError } =
      await supabase
        .from("mailing_contacts")
        .select("phone")
        .eq("mailing_id", mailingId)
        .in("phone", phones);

    if (existingError) {
      return {
        data: [],
        error: existingError,
      };
    }

    existingPhones = new Set(
      (existingContacts || [])
        .map((contact) => contact.phone)
        .filter(Boolean)
    );
  }

  const contactsToInsert = uniqueContacts.filter(
    (contact) =>
      !contact.phone ||
      !existingPhones.has(contact.phone)
  );

  if (contactsToInsert.length === 0) {
    return {
      data: [],
      error: new Error(
        "Все контакты из файла уже есть в этой партии."
      ),
    };
  }

  const { data, error } = await supabase
    .from("mailing_contacts")
    .insert(contactsToInsert)
    .select();

  return {
    data: data || [],
    error,
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

  const { data, error } = await supabase
    .from("mailing_contacts")
    .select(`
      *,
      manager:profiles (
        id,
        full_name,
        email
      ),
      mailing:mailings (
        id,
        name,
        title,
        supplier,
        status,
        mailing_method,
        created_at
      )
    `)
    .eq("manager_id", currentUser.id)
    .order("created_at", {
      ascending: false,
    });

  return {
    data: data || [],
    error,
  };
};
export const mailingContactService = {
  getMyContacts,
  autoAssignManagers,
  normalizePhone,
  normalizeContact,
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