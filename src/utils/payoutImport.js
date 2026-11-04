import { telegramKey } from "./telegram.js";

// Новая партнёрка — новый объект в FORMATS с теми же полями.
const FORMATS = [
  {
    key: "offer_stats",
    label: "Статистика офферов",
    required: [
      "Id конверсии",
      "КВ агента",
      "Sub1",
      "Статус",
    ],
    columns: {
      conversionId: "Id конверсии",
      clickId: "Id клика",
      offerId: "Id оффера",
      offerName: "Название продукта",
      status: "Статус",
      conversionAt: "Дата и время конверсии",
      confirmedAt: "Дата подтверждения",
      sub1: "Sub1",
      phone: "Номер телефона клиента",
      clientName: "ФИО",
      amount: "КВ агента",
    },
  },
];

const PAYMENT_RANK = {
  paid: 3,
  unpaid: 2,
  cancelled: 1,
};

const MIN_SCORE = 55;
const MATCH_GAP = 15;

const PRODUCT_STOP_WORDS = new Set([
  "банк",
  "банка",
  "активация",
  "открытие",
  "открытия",
  "счета",
  "счет",
  "счёта",
  "vip",
  "cpa",
  "дебет",
  "карта",
  "карты",
  "карт",
  "мир",
  "для",
  "при",
]);

export const PAYMENT_STATUS_LABELS = {
  paid: "Оплачено",
  unpaid: "Не оплачено",
  cancelled: "Отменено",
};

export const MATCH_STATUS_LABELS = {
  matched: "Склеено",
  unmatched: "Не склеилось",
  ambiguous: "Несколько заявок",
};

export function getPaymentLabel(status) {
  if (!status) {
    return "Нет в выплатах";
  }

  return PAYMENT_STATUS_LABELS[status] || status;
}

export function getMatchLabel(status) {
  return MATCH_STATUS_LABELS[status] || status || "—";
}

export function formatPayoutMoney(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "—";
  }

  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPayoutDate(value) {
  if (!value) {
    return "—";
  }

  const text = String(value);
  const dateOnly = text.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (dateOnly) {
    return `${dateOnly[3]}.${dateOnly[2]}.${dateOnly[1]}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function monthKey(value) {
  if (!value) {
    return null;
  }

  const text = String(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text.slice(0, 7);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const month = String(date.getMonth() + 1).padStart(
    2,
    "0"
  );

  return `${date.getFullYear()}-${month}`;
}

export function formatMonthLabel(value) {
  const key = monthKey(value);

  if (!key) {
    return "—";
  }

  const [year, month] = key.split("-");
  const date = new Date(
    Number(year),
    Number(month) - 1,
    1
  );

  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function getConversionAt(application) {
  return (
    application?.partner_conversion_at ||
    application?.opened_at ||
    application?.approved_at ||
    null
  );
}

export function isConversionRecord(application) {
  if (application?.partner_conversion_at) {
    return true;
  }

  return (
    application?.status === "approved" &&
    Boolean(getConversionAt(application))
  );
}

export function mapPartnerPaymentStatus(status) {
  const key = String(status || "")
    .trim()
    .toLowerCase()
    .replaceAll("ё", "е");

  if (
    [
      "начислено",
      "оплачено",
      "подтверждено",
      "paid",
      "approved",
    ].includes(key)
  ) {
    return "paid";
  }

  if (
    [
      "отменено",
      "отклонено",
      "cancelled",
      "canceled",
      "rejected",
    ].includes(key)
  ) {
    return "cancelled";
  }

  return "unpaid";
}

export function parsePayoutDate(value) {
  const text = String(value || "").trim();
  const match = text.match(
    /^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (!match) {
    return null;
  }

  const date = new Date(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1]),
    Number(match[4] || 0),
    Number(match[5] || 0),
    Number(match[6] || 0)
  );

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function parsePayoutAmount(value) {
  const text = String(value || "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");

  if (!text) {
    return null;
  }

  const amount = Number(text);

  return Number.isFinite(amount) ? amount : null;
}

export function parsePayoutCsv(text) {
  const matrix = parseDelimited(
    String(text || "").replace(/^\uFEFF/, ""),
    detectDelimiter(text)
  );

  return parsePayoutMatrix(matrix);
}

export function parsePayoutMatrix(matrix) {
  const rows = Array.isArray(matrix) ? matrix : [];
  const headers = (rows[0] || []).map((cell) =>
    String(cell || "").trim()
  );
  const format = detectFormat(headers);

  if (!format) {
    const shown = headers
      .filter(Boolean)
      .slice(0, 12)
      .join(", ");

    return {
      format: null,
      rows: [],
      skipped: 0,
      duplicates: 0,
      error: shown
        ? `Формат файла не узнан. Нужны колонки «Id конверсии», «КВ агента», «Sub1» и «Статус». В файле: ${shown}`
        : "В файле нет заголовков",
    };
  }

  const records = [];
  let skipped = 0;

  for (const rawRow of rows.slice(1)) {
    if (
      !rawRow.some((cell) =>
        String(cell || "").trim()
      )
    ) {
      continue;
    }

    const record = {};

    headers.forEach((header, index) => {
      if (!header) {
        return;
      }

      record[header] = rawRow[index] ?? "";
    });

    const mapped = mapFormatRow(format, record);

    if (!mapped) {
      skipped += 1;
      continue;
    }

    records.push(mapped);
  }

  const unique = new Map();

  for (const row of records) {
    const existing = unique.get(
      row.external_conversion_id
    );

    if (
      !existing ||
      PAYMENT_RANK[row.payment_status] >=
        PAYMENT_RANK[existing.payment_status]
    ) {
      unique.set(row.external_conversion_id, row);
    }
  }

  return {
    format,
    rows: [...unique.values()],
    skipped,
    duplicates: records.length - unique.size,
    error: unique.size
      ? null
      : "В файле нет строк с id конверсии",
  };
}

export function matchPayoutRows(
  rows,
  applications,
  previousLinks = []
) {
  const apps = (applications || []).map(
    (application) => ({
      application,
      telegrams: uniqueKeys([
        identityKey(application?.telegram),
        identityKey(
          application?.mailing_contact
            ?.telegram_username
        ),
      ]),
      phone: phoneKey(application?.phone),
      ppId: digits(application?.pp_id),
    })
  );

  const byTelegram = new Map();
  const byPhone = new Map();
  const byPp = new Map();

  apps.forEach((entry, index) => {
    for (const key of entry.telegrams) {
      pushIndex(byTelegram, key, index);
    }

    if (entry.phone) {
      pushIndex(byPhone, entry.phone, index);
    }

    if (entry.ppId) {
      pushIndex(byPp, entry.ppId, index);
    }
  });

  const previous = new Map();

  for (const link of previousLinks || []) {
    if (
      link?.external_conversion_id &&
      link?.application_id
    ) {
      previous.set(
        link.external_conversion_id,
        link.application_id
      );
    }
  }

  const decisions = (rows || []).map((row) =>
    decideRow(
      row,
      apps,
      byTelegram,
      byPhone,
      byPp,
      previous
    )
  );

  resolveCollisions(decisions);

  return decisions;
}

function detectFormat(headers) {
  const names = new Set(
    (headers || []).map((header) =>
      String(header || "").trim()
    )
  );

  return (
    FORMATS.find((format) =>
      format.required.every((name) =>
        names.has(name)
      )
    ) || null
  );
}

function mapFormatRow(format, record) {
  const columns = format.columns;
  const conversionId = cell(
    record,
    columns.conversionId
  );

  if (!conversionId) {
    return null;
  }

  const partnerStatus = cell(
    record,
    columns.status
  );

  return {
    external_conversion_id: conversionId,
    click_id: cell(record, columns.clickId),
    offer_id: cell(record, columns.offerId),
    offer_name: cell(record, columns.offerName),
    sub1: cell(record, columns.sub1),
    phone: cell(record, columns.phone),
    client_name: cell(record, columns.clientName),
    partner_status: partnerStatus,
    payment_status:
      mapPartnerPaymentStatus(partnerStatus),
    amount: parsePayoutAmount(
      record[columns.amount]
    ),
    conversion_at: parsePayoutDate(
      record[columns.conversionAt]
    ),
    confirmed_at: parsePayoutDate(
      record[columns.confirmedAt]
    ),
  };
}

function decideRow(
  row,
  apps,
  byTelegram,
  byPhone,
  byPp,
  previous
) {
  const telegram = identityKey(row.sub1);
  const phone = phoneKey(row.phone);
  const conversionDigits = digits(
    row.external_conversion_id
  );
  const indexes = new Set();

  if (telegram) {
    for (const index of byTelegram.get(telegram) ||
      []) {
      indexes.add(index);
    }
  }

  if (phone) {
    for (const index of byPhone.get(phone) || []) {
      indexes.add(index);
    }
  }

  const ppHits = conversionDigits
    ? byPp.get(conversionDigits) || []
    : [];

  if (ppHits.length === 1) {
    indexes.add(ppHits[0]);
  }

  const scored = [...indexes]
    .map((index) =>
      scoreCandidate(
        apps[index],
        row,
        telegram,
        phone,
        conversionDigits
      )
    )
    .sort((left, right) => right.score - left.score);

  const eligible = scored.filter(
    (item) => item.score >= MIN_SCORE && item.identity
  );
  const best = eligible[0];
  const second = eligible[1];
  const previousId = previous.get(
    row.external_conversion_id
  );

  if (
    best &&
    (!second || best.score - second.score >= MATCH_GAP)
  ) {
    return decision(row, {
      application_id: best.entry.application.id,
      match_status: "matched",
      match_note: null,
      score: best.score,
    });
  }

  if (previousId) {
    const kept = eligible.find(
      (item) => item.entry.application.id === previousId
    );

    if (kept) {
      return decision(row, {
        application_id: previousId,
        match_status: "matched",
        match_note: "Оставлена прошлая привязка",
        score: kept.score,
      });
    }
  }

  if (eligible.length > 1) {
    return decision(row, {
      application_id: null,
      match_status: "ambiguous",
      match_note: "Несколько заявок похожи одинаково",
      score: best.score,
    });
  }

  const top = scored[0];
  let matchNote =
    "В CRM нет заявки с таким Telegram или телефоном";

  if (top?.identity && top.product < 0) {
    matchNote =
      "Telegram совпал, продукт в CRM другой";
  } else if (indexes.size) {
    matchNote =
      "Похожие заявки есть, но совпадение слабое";
  }

  return decision(row, {
    application_id: null,
    match_status: "unmatched",
    match_note: matchNote,
    score: top?.score || 0,
  });
}

function scoreCandidate(
  entry,
  row,
  telegram,
  phone,
  conversionDigits
) {
  let score = 0;
  let identity = false;

  if (
    telegram &&
    entry.telegrams.includes(telegram)
  ) {
    score += 60;
    identity = true;
  }

  if (phone && entry.phone && entry.phone === phone) {
    score += 55;
    identity = true;
  }

  if (
    conversionDigits &&
    entry.ppId &&
    entry.ppId === conversionDigits
  ) {
    score += 40;
    identity = true;
  }

  const offerDigits = digits(row.offer_id);

  if (
    entry.ppId &&
    offerDigits &&
    entry.ppId === offerDigits
  ) {
    score += 16;
  }

  const product = productScore(
    entry.application,
    row.offer_name
  );

  score += product;
  score += dateScore(
    entry.application,
    row.conversion_at
  );

  return {
    entry,
    score,
    identity,
    product,
  };
}

function resolveCollisions(decisions) {
  const ranked = decisions
    .filter(
      (row) =>
        row.match_status === "matched" &&
        row.application_id
    )
    .sort(
      (left, right) =>
        (right.score || 0) - (left.score || 0)
    );
  const taken = new Map();

  for (const row of ranked) {
    const owner = taken.get(row.application_id);

    if (!owner) {
      taken.set(row.application_id, row);
      continue;
    }

    if ((owner.score || 0) - (row.score || 0) >= 10) {
      row.application_id = null;
      row.match_status = "ambiguous";
      row.match_note =
        "Заявка ближе к другой конверсии этого файла";
      continue;
    }

    const sharedId = row.application_id;
    const sharedNote =
      "Несколько конверсий одинаково похожи на одну заявку";

    owner.application_id = null;
    owner.match_status = "ambiguous";
    owner.match_note = sharedNote;
    row.application_id = null;
    row.match_status = "ambiguous";
    row.match_note = sharedNote;
    taken.delete(sharedId);
  }
}

function decision(row, result) {
  return {
    ...row,
    ...result,
  };
}

function productScore(application, offerName) {
  const left = productTokens(
    application?.product_data?.name ||
      application?.product
  );
  const right = productTokens(offerName);

  if (!left.length || !right.length) {
    return 0;
  }

  const rightSet = new Set(right);
  const hits = left.filter((token) =>
    rightSet.has(token)
  ).length;

  if (hits === 0) {
    return -30;
  }

  if (hits >= 2 || hits / left.length >= 0.5) {
    return 20;
  }

  return 8;
}

function dateScore(application, conversionAt) {
  const anchors = [
    application?.opened_at,
    application?.approved_at,
    application?.created_at,
    application?.in_progress_at,
  ].filter(Boolean);
  let closest = null;

  for (const anchor of anchors) {
    const days = daysBetween(anchor, conversionAt);

    if (days === null) {
      continue;
    }

    if (closest === null || days < closest) {
      closest = days;
    }
  }

  if (closest === null) {
    return 0;
  }

  if (closest <= 3) {
    return 20;
  }

  if (closest <= 14) {
    return 12;
  }

  if (closest <= 45) {
    return 6;
  }

  if (closest > 120) {
    return -15;
  }

  return 0;
}

function daysBetween(left, right) {
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();

  if (
    !Number.isFinite(leftTime) ||
    !Number.isFinite(rightTime)
  ) {
    return null;
  }

  return (
    Math.abs(leftTime - rightTime) / 86400000
  );
}

function productTokens(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .split(/[^a-zа-я0-9]+/i)
    .filter(
      (token) =>
        token.length >= 3 &&
        !PRODUCT_STOP_WORDS.has(token)
    );
}

function identityKey(value) {
  const strict = telegramKey(value);

  if (strict) {
    return strict;
  }

  const text = String(value || "")
    .trim()
    .replace(/^@+/, "");
  const latin = text.match(
    /[a-zA-Z][a-zA-Z0-9_]{3,31}/
  );

  return latin ? latin[0].toLowerCase() : null;
}

function phoneKey(value) {
  const digitsOnly = digits(value);

  if (!digitsOnly || digitsOnly.length < 10) {
    return null;
  }

  return digitsOnly.slice(-10);
}

function digits(value) {
  const text = String(value || "").replace(/\D/g, "");

  return text || null;
}

function uniqueKeys(values) {
  return [...new Set(values.filter(Boolean))];
}

function pushIndex(map, key, index) {
  const current = map.get(key);

  if (current) {
    current.push(index);
    return;
  }

  map.set(key, [index]);
}

function cell(record, key) {
  if (!key) {
    return null;
  }

  const value = String(record?.[key] ?? "").trim();

  return value || null;
}

function detectDelimiter(text) {
  const line =
    String(text || "")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/, 1)[0] || "";
  const semicolons = line.split(";").length;
  const commas = line.split(",").length;

  return semicolons > commas ? ";" : ",";
}

function parseDelimited(text, delimiter) {
  const source = String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let cellValue = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cellValue += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cellValue += char;
      }

      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      row.push(cellValue);
      cellValue = "";
      continue;
    }

    if (char === "\n") {
      row.push(cellValue);
      cellValue = "";

      if (row.some((value) => value.trim())) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    cellValue += char;
  }

  row.push(cellValue);

  if (row.some((value) => value.trim())) {
    rows.push(row);
  }

  return rows;
}
