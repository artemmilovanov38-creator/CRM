import {
  CheckCircle2,
  Clock3,
  FilePlus2,
  MessageCircle,
  XCircle,
} from "lucide-react";

import {
  buildApplicationTimeline,
  formatTimelineDate,
} from "../../utils/applicationEvents";

import "./ApplicationTimeline.css";

const ICONS = {
  incoming: MessageCircle,
  created: FilePlus2,
  in_progress: Clock3,
  approved: CheckCircle2,
  rejected: XCircle,
  status: Clock3,
};

export default function ApplicationTimeline({
  application,
  contact = null,
  history = [],
  compact = false,
}) {
  const events = buildApplicationTimeline({
    application,
    contact,
    history,
  });

  if (events.length === 0) {
    return (
      <div className="app-timeline app-timeline--empty">
        Пока нет достоверных дат этапов.
      </div>
    );
  }

  return (
    <ol
      className={
        compact
          ? "app-timeline app-timeline--compact"
          : "app-timeline"
      }
    >
      {events.map((event, index) => {
        const Icon =
          ICONS[event.status] ||
          ICONS[event.type] ||
          Clock3;

        return (
          <li
            className={`app-timeline__item app-timeline__item--${event.status || event.type}`}
            key={event.key}
          >
            <div className="app-timeline__marker">
              <span className="app-timeline__dot">
                <Icon size={compact ? 13 : 15} />
              </span>
              {index < events.length - 1 ? (
                <span className="app-timeline__line" />
              ) : null}
            </div>
            <div className="app-timeline__body">
              <strong>{event.title}</strong>
              <time>
                {formatTimelineDate(event.at, !compact)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
