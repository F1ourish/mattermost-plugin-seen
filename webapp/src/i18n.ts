const en = {
  showAll: "Show all",
  clientScope:
    "Only views from Web/Desktop are counted. Mobile app views are not tracked due to Mattermost mobile architecture.",
  today: "Today",
  yesterday: "Yesterday",
  empty: "Not viewed yet",
  viewers: "Viewed by",
  expired: "View history expired",
  disabled: "View tracking disabled",
  unknown: "View status unavailable",
  close: "Close viewer list",
  retry: "Retry",
  loading: "Loading viewers…",
  refreshing: "Updating viewers…",
  error: "Unable to load viewers. Please try again.",
  stale: "Unable to refresh. Showing previously loaded viewers.",
  order: "Viewers ordered by first view",
  limit: "Viewer limit reached; this list may be incomplete.",
  menu: "Who viewed this",
  first: "First view registered: ",
  invalidTime: "First view time unavailable",
};
const ru: typeof en = {
  showAll: "Показать всех",
  clientScope:
    "Учитываются только просмотры в Web/Desktop. Просмотры из мобильных приложений не учитываются из-за ограничений архитектуры Mattermost.",
  today: "Сегодня",
  yesterday: "Вчера",
  empty: "Пока не просмотрено",
  viewers: "Просмотрели",
  expired: "Срок хранения просмотров истёк",
  disabled: "Учёт просмотров отключён",
  unknown: "Статус просмотров недоступен",
  close: "Закрыть список просмотров",
  retry: "Повторить",
  loading: "Загрузка просмотров…",
  refreshing: "Обновление просмотров…",
  error: "Не удалось загрузить просмотры. Повторите попытку.",
  stale: "Не удалось обновить. Показаны ранее загруженные просмотры.",
  order: "Пользователи по времени первого просмотра",
  limit: "Достигнут лимит просмотров; список может быть неполным.",
  menu: "Кто просмотрел",
  first: "Первая регистрация просмотра: ",
  invalidTime: "Время первого просмотра недоступно",
};
export type TextKey = keyof typeof en;
export function translate(locale: string | undefined, key: TextKey): string {
  return (locale?.toLowerCase().startsWith("ru") ? ru : en)[key];
}
export function viewedLabel(locale: string | undefined, count: number): string {
  return locale?.toLowerCase().startsWith("ru")
    ? `Просмотрели: ${count}`
    : `Viewed by ${count}`;
}
