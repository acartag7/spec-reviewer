import { Monitor, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme, type ThemeMode } from "@/lib/use-theme"

const LABEL: Record<ThemeMode, string> = {
  system: "System theme",
  light: "Light theme",
  dark: "Dark theme",
}
const ICON: Record<ThemeMode, typeof Sun> = { system: Monitor, light: Sun, dark: Moon }
const NEXT: Record<ThemeMode, ThemeMode> = { system: "light", light: "dark", dark: "system" }

export function ThemeToggle() {
  const { mode, setMode } = useTheme()
  const Icon = ICON[mode] ?? Monitor
  const label = LABEL[mode] ?? "Theme"
  const next = NEXT[mode] ?? "system"
  const nextLabel = (LABEL[next] ?? "system").replace(" theme", "")
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={`${label} — click for ${nextLabel}`}
      onClick={() => setMode(next)}
    >
      <Icon />
    </Button>
  )
}
