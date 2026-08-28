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

  const username = String(value)
    .trim()
    .replace(/^https?:\/\/(www\.)?/i, "")
    .replace(/^t\.me\//i, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .trim();

  if (!username) {
    return null;
  }

  if (
    strict &&
    !/^[a-zA-Z0-9_]{5,32}$/.test(username)
  ) {
    return null;
  }

  return username;
}

export function telegramKey(value) {
  const username = parseTelegramUsername(value, {
    strict: false,
  });

  return username
    ? username.toLowerCase()
    : null;
}

export function formatTelegramDisplay(
  value,
  withAt = true,
  options = {}
) {
  const username = parseTelegramUsername(
    value,
    options
  );

  if (!username) {
    return null;
  }

  return withAt ? `@${username}` : username;
}

export function getTelegramHref(value) {
  const username = parseTelegramUsername(
    value,
    { strict: false }
  );

  return username
    ? `https://t.me/${username}`
    : null;
}
