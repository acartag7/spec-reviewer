interface StatusToastProps {
  message: string
}

export function StatusToast({ message }: StatusToastProps) {
  return (
    <div
      role="status"
      className={[
        "fixed bottom-4 left-4 z-50 rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground shadow-sm",
        "transition-opacity duration-200",
        message === "" ? "pointer-events-none opacity-0" : "opacity-100",
      ].join(" ")}
    >
      {message}
    </div>
  )
}
