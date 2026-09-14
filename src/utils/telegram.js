const TELEGRAM_USERNAME_RE =
  /^[a-zA-Z0-9_]{5,32}$/;
const TELEGRAM_HANDLE_IN_TEXT_RE =
  /@([a-zA-Z0-9_]{5,32})/;
const TELEGRAM_LINK_IN_TEXT_RE =
  /(?:t(?:elegram)?\.me)\/([a-zA-Z0-9_]{5,32})/i;

function stripInvisible(value) {
  return String(value).replace(
    /[\u200B-\u200D\uFEFF\u00A0]/g,
    ""
  );
}

export function parseTelegramUsername(
  value,
  { strict = true } = {}
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const username = stripInvisible(
    String(value)
  )
    .trim()
    .replace(/^https?:\/\/(www\.)?/i, "")
    .replace(
      /^(www\.)?t(?:elegram)?\.me\//i,
      ""
    )
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .trim();

  if (!username) {
    return null;
  }

  if (
    strict &&
    !TELEGRAM_USERNAME_RE.test(username)
  ) {
    return null;
  }

  return username;
}

export function extractTelegramUsername(
  value,
  { strict = true } = {}
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text = stripInvisible(
    String(value)
  ).trim();

  if (!text) {
    return null;
  }

  const direct = parseTelegramUsername(
    text,
    { strict: false }
  );

  if (
    direct &&
    TELEGRAM_USERNAME_RE.test(direct)
  ) {
    return direct;
  }

  const atMatch = text.match(
    TELEGRAM_HANDLE_IN_TEXT_RE
  );

  if (atMatch?.[1]) {
    return atMatch[1];
  }

  const linkMatch = text.match(
    TELEGRAM_LINK_IN_TEXT_RE
  );

  if (linkMatch?.[1]) {
    return linkMatch[1];
  }

  if (strict) {
    return null;
  }

  return direct;
}

export function telegramKey(value) {
  const username = extractTelegramUsername(
    value,
    { strict: false }
  );

  if (
    !username ||
    !TELEGRAM_USERNAME_RE.test(username)
  ) {
    return null;
  }

  return username.toLowerCase();
}

export function formatTelegramDisplay(
  value,
  withAt = true,
  options = {}
) {
  const username = extractTelegramUsername(
    value,
    options
  );

  if (!username) {
    return null;
  }

  return withAt ? `@${username}` : username;
}

export function getTelegramHref(value) {
  const username = extractTelegramUsername(
    value,
    { strict: false }
  );

  return username
    ? `https://t.me/${username}`
    : null;
}

function collectRawDataValues(rawData) {
  if (!rawData) {
    return [];
  }

  if (typeof rawData === "string") {
    return [rawData];
  }

  if (Array.isArray(rawData)) {
    return rawData.flatMap((item) =>
      collectRawDataValues(item)
    );
  }

  if (typeof rawData !== "object") {
    return [String(rawData)];
  }

  return Object.values(rawData).flatMap(
    (item) => collectRawDataValues(item)
  );
}

export function collectContactTelegramValues(
  contact
) {
  return [
    contact?.telegram_username,
    contact?.telegram,
    contact?.full_name,
    contact?.comment,
    ...collectRawDataValues(contact?.raw_data),
  ].filter(
    (value) =>
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
  );
}

export function collectContactTelegramKeys(
  contact
) {
  const keys = new Set();

  for (const value of collectContactTelegramValues(
    contact
  )) {
    const key = telegramKey(value);

    if (key) {
      keys.add(key);
    }
  }

  return keys;
}

export function getContactTelegram(
  contact
) {
  for (const value of collectContactTelegramValues(
    contact
  )) {
    const display = formatTelegramDisplay(
      value
    );

    if (display) {
      return display;
    }
  }

  return null;
}

export function contactMatchesTelegram(
  contact,
  searchValue
) {
  const wanted = telegramKey(searchValue);

  if (!wanted) {
    return false;
  }

  return collectContactTelegramKeys(
    contact
  ).has(wanted);
}
