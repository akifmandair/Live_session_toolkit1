export function Brand({ size = "md", light = false }: { size?: "md" | "lg"; light?: boolean }) {
  const textSize = size === "lg" ? "text-2xl" : "text-lg";
  const markSize = size === "lg" ? "h-9 w-9" : "h-7 w-7";
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`relative flex items-center justify-center rounded-xl bg-gradient-to-br from-signal-light to-signal shadow-sm shadow-signal/30 ${markSize}`}
      >
        <span className="absolute inline-flex h-2 w-2 top-1.5 right-1.5 rounded-full bg-live animate-pulse-dot" />
        <span className="font-display font-bold text-white text-sm">L</span>
      </span>
      <span
        className={`font-display font-semibold tracking-tight ${textSize} ${
          light ? "text-white" : "text-ink"
        }`}
      >
        Live Session Toolkit
      </span>
    </div>
  );
}
