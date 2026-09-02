import "./ManagerAnalytics.css";

export default function ManagerAnalytics({
  title,
  rows = [],
  loading = false,
  error = "",
  onRetry,
  variant = "crm",
}) {
  const isApplications =
    variant === "applications";

  if (loading) {
    return (
      <section className="manager-analytics">
        <h2>{title}</h2>
        <p className="manager-analytics__hint">
          Считаем показатели менеджеров...
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="manager-analytics">
        <h2>{title}</h2>
        <p className="manager-analytics__error">
          {error}
        </p>
        {onRetry ? (
          <button
            className="manager-analytics__retry"
            type="button"
            onClick={onRetry}
          >
            Повторить
          </button>
        ) : null}
      </section>
    );
  }

  if (!rows.length) {
    return null;
  }

  return (
    <section className="manager-analytics">
      <h2>{title}</h2>

      <div className="manager-analytics__table-wrap">
        <table
          className={
            isApplications
              ? "manager-analytics__table manager-analytics__table--applications"
              : "manager-analytics__table"
          }
        >
          <thead>
            <tr>
              <th>Менеджер</th>
              {isApplications ? (
                <>
                  <th>Заявок</th>
                  <th>В работе</th>
                  <th>Успешно</th>
                  <th>Отказов</th>
                  <th>Сумма успешных</th>
                </>
              ) : (
                <>
                  <th>Написали</th>
                  <th>Заявок</th>
                  <th>В работе</th>
                  <th>Успешно</th>
                  <th>Отказов</th>
                </>
              )}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>
                    {row.name}
                  </strong>
                </td>
                {isApplications ? (
                  <>
                    <td>{row.applications}</td>
                    <td>{row.inProgress}</td>
                    <td>{row.opened}</td>
                    <td>{row.rejected}</td>
                    <td>
                      {formatMoney(
                        row.totalAmount
                      )}
                    </td>
                  </>
                ) : (
                  <>
                    <td>{row.responded}</td>
                    <td>
                      {row.applications}
                    </td>
                    <td>
                      {row.inProgress || 0}
                    </td>
                    <td>{row.opened}</td>
                    <td>{row.rejected}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="manager-analytics__cards">
        {rows.map((row) => (
          <article
            className="manager-analytics__card"
            key={`${row.id}-card`}
          >
            <strong>{row.name}</strong>
            {isApplications ? (
              <>
                <span>
                  заявок {row.applications}
                </span>
                <span>
                  в работе {row.inProgress}
                </span>
                <span>
                  успешно {row.opened}
                </span>
                <span>
                  отказов {row.rejected}
                </span>
                <span>
                  сумма{" "}
                  {formatMoney(
                    row.totalAmount
                  )}
                </span>
              </>
            ) : (
              <>
                <span>
                  написали {row.responded}
                </span>
                <span>
                  заявок {row.applications}
                </span>
                <span>
                  в работе {row.inProgress || 0}
                </span>
                <span>
                  успешно {row.opened}
                </span>
                <span>
                  отказов {row.rejected}
                </span>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function formatMoney(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}
