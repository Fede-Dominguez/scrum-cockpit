import { avatarColor, initials, shortType, typeColor } from "../lib/format";

export function Avatar({ name, size = 28 }: { name?: string; size?: number }) {
  return (
    <div
      className={`rounded-full flex items-center justify-center font-semibold shrink-0 ${avatarColor(name)}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      title={name ?? "Sin asignar"}
    >
      {initials(name)}
    </div>
  );
}

export function TypeBadge({ type }: { type: string }) {
  const c = typeColor(type);
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide border ${c.bg} ${c.text} ${c.border}`}
    >
      {shortType(type)}
    </span>
  );
}
