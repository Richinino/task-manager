import { cn } from "@/lib/utils";

/**
 * Farebná bodka kalendára alebo kategórie z Google.
 *
 * Farba je používateľské dáto z Google (hex), nie dizajnový token — preto
 * ide cez `style`, rovnako ako farby oblastí. Bez farby sa kreslí
 * neutrálny obrys, aby riadky pod sebou držali stĺpec.
 */
export function CalendarDot({
  color,
  className,
}: {
  color: string | null;
  className?: string;
}) {
  const safe = color !== null && /^#[0-9a-f]{3,8}$/i.test(color) ? color : null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        safe === null && "border border-border-strong",
        className,
      )}
      style={safe === null ? undefined : { backgroundColor: safe }}
    />
  );
}
