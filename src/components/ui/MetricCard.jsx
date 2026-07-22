export default function MetricCard({
  label,
  value,
  description,
  color = "blue",
}) {
  return (
    <article className={`metric-card metric-card--${color}`}>
      <div className="metric-card__label">{label}</div>
      <p className="metric-card__value">{value}</p>

      {description && (
        <div className="metric-card__description">{description}</div>
      )}
    </article>
  );
}