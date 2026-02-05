import { Badge } from "@/components/ui/badge"
import { Clock } from "lucide-react"

export function SessionIndicator() {
  const getCurrentSession = () => {
    const now = new Date()
    const utcHour = now.getUTCHours()

    if (utcHour >= 0 && utcHour < 9) {
      return { name: "Asian", active: false, color: "secondary" }
    } else if (utcHour >= 8 && utcHour < 16) {
      return { name: "London", active: true, color: "default" }
    } else if (utcHour >= 13 && utcHour < 21) {
      return { name: "New York", active: true, color: "default" }
    }
    return { name: "Off-Hours", active: false, color: "secondary" }
  }

  const session = getCurrentSession()

  return (
    <Badge variant={session.color as any} className="flex items-center gap-1">
      <Clock className="h-3 w-3" />
      {session.name} Session
      {session.active && <span className="ml-1 h-2 w-2 rounded-full bg-green-500 animate-pulse" />}
    </Badge>
  )
}
