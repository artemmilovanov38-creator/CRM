import "./ManagerAnalytics.css";

export default function ManagerAnalytics({
  title,
  rows = [],
  loading = false,
  error = "",
  onRetry,
}) {
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
        <table className="manager-analytics__table">
          <thead>
            <tr>
              <th>Менеджер</th>
              <th>Написали</th>
              <th>Заявок</th>
              <th>Успешно</th>
              <th>Отказов</th>
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
                <td>{row.responded}</td>
                <td>
                  {row.applications}
                </td>
                <td>{row.opened}</td>
                <td>{row.rejected}</td>
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
            <span>
              написали {row.responded}
            </span>
            <span>
              заявок {row.applications}
            </span>
            <span>
              успешно {row.opened}
            </span>
            <span>
              отказов {row.rejected}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
