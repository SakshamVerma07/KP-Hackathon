const sameDay = (a, b) => a.toDateString() === b.toDateString();

export const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function formatDay(iso) {
  const d = new Date(iso), now = new Date(), y = new Date();
  y.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return "Today";
  if (sameDay(d, y)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

export function formatListTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return sameDay(d, new Date()) ? formatTime(iso) : d.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function formatLastSeen(iso) {
  if (!iso) return "Offline";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Last seen just now";
  if (mins < 60) return `Last seen ${mins} min ago`;
  if (mins < 1440) return `Last seen ${Math.round(mins / 60)} h ago`;
  return `Last seen ${formatListTime(iso)}`;
}

export const initials = (name = "?") =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

export const sameDayIso = (a, b) => sameDay(new Date(a), new Date(b));
