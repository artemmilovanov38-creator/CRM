export function formatServiceError(
  error,
  fallback = "Не удалось загрузить данные"
) {
  if (!error) {
    return fallback;
  }

  if (typeof error === "string") {
    return error || fallback;
  }

  const code = String(
    error.code ||
      error.status ||
      error.statusCode ||
      ""
  );
  const status = Number(
    error.status ||
      error.statusCode ||
      0
  );
  const message = String(
    error.message || ""
  );
  const details = String(
    error.details ||
      error.hint ||
      ""
  );
  const combined =
    `${code} ${status} ${message} ${details}`.toLowerCase();

  if (
    code === "57014" ||
    code === "TIMEOUT" ||
    combined.includes("statement timeout") ||
    combined.includes("превышено время ожидания")
  ) {
    return "Запрос к базе превысил лимит времени. Сузьте период и нажмите «Обновить».";
  }

  if (
    status === 500 ||
    code === "500" ||
    combined.includes("internal server error")
  ) {
    return "Сервер базы данных вернул ошибку. Попробуйте загрузить ещё раз.";
  }

  if (
    status === 400 ||
    code === "400" ||
    combined.includes("bad request")
  ) {
    return (
      message ||
      "Ошибка запроса (400). Обновите страницу или сузьте фильтры."
    );
  }

  if (
    code === "42501" ||
    combined.includes("row-level security") ||
    combined.includes("permission denied")
  ) {
    return "Недостаточно прав для загрузки этих данных.";
  }

  return message || fallback;
}
