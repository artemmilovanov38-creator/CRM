import { supabase } from "../lib/supabase";
import { applicationService } from "./applicationService";
import { matchPayoutRows } from "../utils/payoutImport";

const PAGE_SIZE = 1000;

function createServiceError(message) {
  return new Error(message);
}

function explainError(error) {
  const message = String(
    error?.message || error || ""
  );

  if (
    message.includes("apply_payout_import") ||
    message.includes("payout_imports") ||
    message.includes("payout_rows") ||
    message.includes("payment_status")
  ) {
    return createServiceError(
      "В базе ещё нет оплат. Примените миграцию 024_payout_imports.sql"
    );
  }

  return error instanceof Error
    ? error
    : createServiceError(
        message || "Не удалось обработать выплату"
      );
}

async function fetchAll(buildQuery) {
  const rows = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(
      from,
      from + PAGE_SIZE - 1
    );

    if (error) {
      return {
        data: [],
        error,
      };
    }

    rows.push(...(data || []));

    if (!data || data.length < PAGE_SIZE) {
      break;
    }
  }

  return {
    data: rows,
    error: null,
  };
}

export const payoutService = {
  async listImports() {
    const { data, error } = await supabase
      .from("payout_imports")
      .select(
        `
        id,
        partner_name,
        payout_month,
        file_name,
        format_key,
        row_count,
        matched_count,
        unmatched_count,
        ambiguous_count,
        paid_count,
        created_at
      `
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return {
        data: [],
        error: explainError(error),
      };
    }

    return {
      data: data || [],
      error: null,
    };
  },

  async listOpenRows() {
    const result = await fetchAll(() =>
      supabase
        .from("payout_rows")
        .select(
          `
          id,
          partner_name,
          external_conversion_id,
          offer_name,
          sub1,
          phone,
          client_name,
          partner_status,
          payment_status,
          amount,
          conversion_at,
          confirmed_at,
          match_status,
          match_note,
          updated_at
        `
        )
        .neq("match_status", "matched")
        .order("updated_at", { ascending: false })
    );

    if (result.error) {
      return {
        data: [],
        error: explainError(result.error),
      };
    }

    return result;
  },

  async importPayout({
    partnerName,
    payoutMonth = null,
    fileName = "",
    formatKey,
    rows,
  }) {
    const partner = String(partnerName || "").trim();

    if (!partner) {
      return {
        data: null,
        error: createServiceError(
          "Укажите название партнёрки"
        ),
      };
    }

    if (!rows?.length) {
      return {
        data: null,
        error: createServiceError(
          "В файле нет строк"
        ),
      };
    }

    const {
      data: applications,
      error: applicationsError,
    } = await applicationService.getApplications();

    if (applicationsError) {
      return {
        data: null,
        error: applicationsError,
      };
    }

    const previous = await fetchAll(() =>
      supabase
        .from("payout_rows")
        .select(
          "external_conversion_id, application_id, match_status"
        )
        .eq("partner_name", partner)
        .eq("match_status", "matched")
    );

    if (
      previous.error &&
      !String(previous.error.message || "").includes(
        "payout_rows"
      )
    ) {
      return {
        data: null,
        error: explainError(previous.error),
      };
    }

    const matched = matchPayoutRows(
      rows,
      applications || [],
      previous.data || []
    );

    const payload = matched.map((row) => ({
      external_conversion_id:
        row.external_conversion_id,
      click_id: row.click_id,
      offer_id: row.offer_id,
      offer_name: row.offer_name,
      sub1: row.sub1,
      phone: row.phone,
      client_name: row.client_name,
      partner_status: row.partner_status,
      payment_status: row.payment_status,
      amount:
        row.amount === null || row.amount === undefined
          ? null
          : String(row.amount),
      conversion_at: row.conversion_at,
      confirmed_at: row.confirmed_at,
      application_id: row.application_id,
      match_status: row.match_status,
      match_note: row.match_note,
    }));

    const { data, error } = await supabase.rpc(
      "apply_payout_import",
      {
        p_partner_name: partner,
        p_payout_month: payoutMonth || null,
        p_file_name: fileName || null,
        p_format_key: formatKey || "unknown",
        p_rows: payload,
      }
    );

    if (error) {
      return {
        data: null,
        error: explainError(error),
      };
    }

    return {
      data,
      error: null,
    };
  },
};
