import {
  isoToDateInput,
  todayDateInput,
} from "./periodRange";

export function getApplicationDateForm(application) {
  return {
    wrote_on:
      isoToDateInput(
        application?.mailing_contact?.responded_at
      ) || "",
    submitted_on:
      isoToDateInput(application?.created_at) || "",
    opened_on:
      isoToDateInput(
        application?.opened_at || application?.approved_at
      ) ||
      (application?.status === "approved"
        ? todayDateInput()
        : ""),
  };
}
