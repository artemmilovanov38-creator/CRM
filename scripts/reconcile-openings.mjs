import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dateOnlyToExclusiveIsoRange } from "../src/utils/periodRange.js";
import {
  applicationIsSuccessfulOpeningInPeriod,
  applicationMatchesProductId,
} from "../src/utils/applicationEvents.js";
import { buildSalaryData } from "../src/utils/salaryCalculation.js";

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
const url = env.VITE_SUPABASE_URL;
const key =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

const dateFrom = process.argv[2] || "2026-08-16";
const dateTo = process.argv[3] || "2026-08-31";
const managerQuery = process.argv[4] || "анют";
const productQuery = process.argv[5] || "альфа";
const bounds = dateOnlyToExclusiveIsoRange(dateFrom, dateTo);

const { data: managers, error: managersError } = await supabase
  .from("profiles")
  .select("id, full_name, email, role, status")
  .ilike("full_name", `%${managerQuery}%`);

if (managersError) {
  console.error("Не удалось прочитать профили:", managersError.message);
  console.log("Границы периода:", bounds);
  process.exit(1);
}

const { data: products, error: productsError } = await supabase
  .from("products")
  .select("id, name, opening_price, is_active")
  .ilike("name", `%${productQuery}%`);

if (productsError) {
  console.error("Не удалось прочитать продукты:", productsError.message);
  process.exit(1);
}

const manager = managers?.[0];
const product = products?.[0];

console.log("Период", dateFrom, dateTo, bounds);
console.log(
  "Менеджер",
  manager?.full_name || "не найден",
  manager?.id || ""
);
console.log(
  "Продукт",
  product?.name || "не найден",
  product?.id || "",
  "ставка",
  product?.opening_price
);

if (!manager || !product) {
  process.exit(1);
}

const { data: rows, error: rowsError } = await supabase
  .from("applications")
  .select(
    "id, full_name, status, product, product_id, assigned_manager_id, amount, opening_price_snapshot, opened_at, approved_at, created_at"
  )
  .eq("assigned_manager_id", manager.id)
  .eq("status", "approved");

if (rowsError) {
  console.error("Не удалось прочитать заявки:", rowsError.message);
  process.exit(1);
}

const byProduct = (rows || []).filter((row) =>
  applicationMatchesProductId(row, product.id, product)
);

const inPeriod = byProduct.filter((row) =>
  applicationIsSuccessfulOpeningInPeriod(
    row,
    bounds.from,
    bounds.to
  )
);

const oldSql = byProduct.filter((row) => {
  if (!row.opened_at) {
    return false;
  }

  const time = Date.parse(row.opened_at);
  const from = Date.parse(`${dateFrom}T00:00:00Z`);
  const to = Date.parse(`${dateTo}T23:59:59.999Z`);

  return time >= from && time <= to;
});

const salary = buildSalaryData({
  managers: [manager],
  products,
  applications: inPeriod,
});

console.log("Всего успешных у менеджера:", (rows || []).length);
console.log("Успешных этого продукта:", byProduct.length);
console.log("В периоде по новой логике:", inPeriod.length);
console.log("По старому SQL opened_at UTC:", oldSql.length);
console.log(
  "В зарплате по продукту:",
  salary.rows[0]?.products[String(product.id)]?.openings || 0
);
console.log(
  "Сумма зарплаты по продукту:",
  salary.rows[0]?.products[String(product.id)]?.salary || 0
);

console.log("Все успешные Альфа этого менеджера:");
for (const row of byProduct) {
  const inNew = inPeriod.some((item) => item.id === row.id);
  const inOld = oldSql.some((item) => item.id === row.id);
  console.log({
    id: row.id,
    name: row.full_name,
    created_at: row.created_at,
    opened_at: row.opened_at,
    approved_at: row.approved_at,
    amount: row.amount,
    product_id: row.product_id,
    inNewPeriod: inNew,
    inOldSql: inOld,
  });
}

const { data: allManagers, error: allManagersError } =
  await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .in("role", ["manager", "head"]);

if (allManagersError) {
  console.error(
    "Не удалось прочитать менеджеров:",
    allManagersError.message
  );
  process.exit(0);
}

const { data: allApproved, error: allApprovedError } =
  await supabase
    .from("applications")
    .select(
      "id, assigned_manager_id, product_id, status, opened_at, approved_at, amount"
    )
    .eq("status", "approved")
    .eq("product_id", product.id);

if (allApprovedError) {
  console.error(
    "Не удалось прочитать успешные Альфа:",
    allApprovedError.message
  );
  process.exit(0);
}

console.log("Сверка других менеджеров по Альфа за период:");

for (const item of allManagers || []) {
  const managerApps = (allApproved || []).filter(
    (row) =>
      String(row.assigned_manager_id) ===
        String(item.id) &&
      applicationIsSuccessfulOpeningInPeriod(
        row,
        bounds.from,
        bounds.to
      )
  );

  if (managerApps.length === 0) {
    continue;
  }

  const salaryRow = buildSalaryData({
    managers: [item],
    products,
    applications: managerApps,
  }).rows[0];

  const salaryCount =
    salaryRow?.products[String(product.id)]
      ?.openings || 0;

  console.log({
    name: item.full_name,
    applications: managerApps.length,
    salary: salaryCount,
    amount:
      salaryRow?.products[String(product.id)]
        ?.salary || 0,
    match: managerApps.length === salaryCount,
  });
}
