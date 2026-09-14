import {
  collectContactTelegramKeys,
  contactMatchesTelegram,
  extractTelegramUsername,
  formatTelegramDisplay,
  getContactTelegram,
  telegramKey,
} from "../src/utils/telegram.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const variants = [
  "thesmailfr",
  "@thesmailfr",
  "TheSmailFR",
  "@TheSmailFR",
  "t.me/thesmailfr",
  "https://t.me/thesmailfr",
  "https://t.me/thesmailfr?start=1",
  "https://www.t.me/thesmailfr",
  "https://telegram.me/thesmailfr",
];

for (const variant of variants) {
  assert(
    telegramKey(variant) === "thesmailfr",
    `Нормализация не свела вариант к одному ключу: ${variant}`
  );
}

assert(
  formatTelegramDisplay("@TheSmailFR") === "@TheSmailFR",
  "Отображение сохраняет исходный регистр"
);

assert(
  extractTelegramUsername("Клиент @thesmailfr написал") ===
    "thesmailfr",
  "Ник извлекается из ФИО/текста"
);

const contactInFullName = {
  telegram_username: null,
  full_name: "@thesmailfr",
  raw_data: {},
};

assert(
  contactMatchesTelegram(contactInFullName, "@thesmailfr"),
  "Контакт с ником в full_name находится"
);

assert(
  getContactTelegram(contactInFullName) === "@thesmailfr",
  "Для заявки берётся ник из full_name"
);

const contactInRaw = {
  telegram_username: "",
  full_name: "Иван",
  raw_data: {
    Telegram: "https://t.me/thesmailfr",
  },
};

assert(
  contactMatchesTelegram(contactInRaw, "USERNAME".replace("USERNAME", "thesmailfr")),
  "Контакт с ником в raw_data находится"
);

assert(
  collectContactTelegramKeys(contactInRaw).has("thesmailfr"),
  "Ключ raw_data совпадает с поиском"
);

const mailingContact = {
  telegram_username: "@TheSmailFR",
  full_name: "thesmailfr",
};

assert(
  contactMatchesTelegram(mailingContact, "https://t.me/thesmailfr"),
  "Поиск регистронезависимый и совпадает с записью в telegram_username"
);

console.log("Нормализация и поиск Telegram @thesmailfr прошли");
