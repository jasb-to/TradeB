"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { GitBranch, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export function GitHubPushButton() {
  const [isPushing, setIsPushing] = useState(false)
  const { toast } = useToast()

  const handlePush = async () => {
    setIsPushing(true)
    try {
      const response = await fetch("/api/github/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Pushed to GitHub",
          description: "Changes committed and pushed successfully",
          variant: "default",
        })
      } else {
        toast({
          title: "Push Failed",
          description: data.error || "Could not push to GitHub",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("[v0] GitHub push error:", error)
      toast({
        title: "Error",
        description: "Failed to push changes",
        variant: "destructive",
      })
    } finally {
      setIsPushing(false)
    }
  }

  return (
    <Button
      onClick={handlePush}
      disabled={isPushing}
      variant="outline"
      size="sm"
      className="gap-2 bg-transparent"
    >
      <GitBranch className={`w-4 h-4 ${isPushing ? "animate-spin" : ""}`} />
      {isPushing ? "Pushing..." : "Push to GitHub"}
    </Button>
  )
}
