import {
  contactMatchesTelegram,
  telegramKey,
} from "./telegram.js";

export function stripTelegramPrefix(value) {
  return (
    telegramKey(value) ||
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/t\.me\//i, "")
      .replace(/^t\.me\//i, "")
      .replace(/^@+/, "")
  );
}

export function escapeIlike(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

export function matchesSearch(fields, rawQuery) {
  const query = String(rawQuery || "")
    .trim()
    .toLowerCase();

  if (!query) {
    return true;
  }

  const haystack = fields
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(" ");

  if (haystack.includes(query)) {
    return true;
  }

  const withoutAt = stripTelegramPrefix(query);

  if (withoutAt && haystack.includes(withoutAt)) {
    return true;
  }

  if (
    withoutAt &&
    haystack.includes(`@${withoutAt}`)
  ) {
    return true;
  }

  return haystack.replaceAll("@", "").includes(
    query.replaceAll("@", "")
  );
}

export function contactMatchesQuery(
  contact,
  rawQuery,
  extraFields = []
) {
  const query = String(rawQuery || "").trim();

  if (!query) {
    return true;
  }

  if (contactMatchesTelegram(contact, query)) {
    return true;
  }

  return matchesSearch(
    [
      contact?.full_name,
      contact?.phone,
      contact?.email,
      contact?.telegram_username,
      contact?.telegram,
      contact?.comment,
      ...extraFields,
    ],
    query
  );
}
