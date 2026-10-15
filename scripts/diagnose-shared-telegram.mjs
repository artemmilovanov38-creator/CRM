import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnvLocal() {
  const text = readFileSync(".env.local", "utf8");
  const env = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const index = trimmed.indexOf("=");

    if (index === -1) {
      continue;
    }

    env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }

  return env;
}

const env = loadEnvLocal();
const key =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!env.VITE_SUPABASE_URL || !key) {
  console.log(
    JSON.stringify({
      access: false,
      reason: "В .env.local нет ключа Supabase",
    })
  );
  process.exit(0);
}

const supabase = createClient(env.VITE_SUPABASE_URL, key, {
  auth: { persistSession: false },
});

const usernames = [
  "qqwweeeeeeeee",
  "timoshenkoarina",
  "titovaes",
];

const orFilter = usernames
  .flatMap((username) => [
    `telegram_username.ilike.%${username}%`,
    `full_name.ilike.%${username}%`,
    `comment.ilike.%${username}%`,
  ])
  .join(",");

const { data: contacts, error: contactError } = await supabase
  .from("mailing_contacts")
  .select(
    "id, full_name, telegram_username, phone, manager_id, mailing_id, source, is_external, status, responded_at, created_at, comment"
  )
  .or(orFilter);

if (contactError) {
  console.log(
    JSON.stringify({
      access: false,
      reason: contactError.message,
      code: contactError.code,
    })
  );
  process.exit(0);
}

const matched = (contacts || []).filter((contact) => {
  const haystack = `${contact.telegram_username || ""} ${
    contact.full_name || ""
  }`.toLowerCase();

  return usernames.some((username) =>
    haystack.includes(username)
  );
});

const managerIds = [
  ...new Set(matched.map((contact) => contact.manager_id).filter(Boolean)),
];
const contactIds = matched.map((contact) => contact.id);
const mailingIds = [
  ...new Set(matched.map((contact) => contact.mailing_id).filter(Boolean)),
];

const [{ data: managers }, { data: mailings }, { data: applications }] =
  await Promise.all([
    managerIds.length
      ? supabase
          .from("profiles")
          .select("id, full_name, role")
          .in("id", managerIds)
      : Promise.resolve({ data: [] }),
    mailingIds.length
      ? supabase
          .from("mailings")
          .select("id, name")
          .in("id", mailingIds)
      : Promise.resolve({ data: [] }),
    contactIds.length
      ? supabase
          .from("applications")
          .select(
            "id, mailing_contact_id, product, product_id, status, amount, opening_price_snapshot, opened_at, approved_at, created_at, assigned_manager_id"
          )
          .in("mailing_contact_id", contactIds)
      : Promise.resolve({ data: [] }),
  ]);

const managerName = new Map(
  (managers || []).map((manager) => [manager.id, manager.full_name])
);
const mailingName = new Map(
  (mailings || []).map((mailing) => [mailing.id, mailing.name])
);

const report = usernames.map((username) => {
  const rows = matched.filter((contact) =>
    `${contact.telegram_username || ""} ${contact.full_name || ""}`
      .toLowerCase()
      .includes(username)
  );

  return {
    username,
    contacts: rows.map((contact) => ({
      id: contact.id,
      full_name: contact.full_name,
      telegram_username: contact.telegram_username,
      manager: managerName.get(contact.manager_id) || null,
      mailing: mailingName.get(contact.mailing_id) || null,
      source: contact.source,
      is_external: contact.is_external,
      status: contact.status,
      responded_at: contact.responded_at,
      applications: (applications || [])
        .filter((application) => application.mailing_contact_id === contact.id)
        .map((application) => ({
          id: application.id,
          product: application.product,
          status: application.status,
          amount: application.amount,
          opened_at: application.opened_at || application.approved_at,
          manager:
            managerName.get(application.assigned_manager_id) || null,
        })),
    })),
  };
});

console.log(
  JSON.stringify(
    {
      access: true,
      usedServiceRole: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      scannedContacts: (contacts || []).length,
      report,
    },
    null,
    2
  )
);
