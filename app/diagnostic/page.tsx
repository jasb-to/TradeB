"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface DiagnosticReport {
  timestamp: string
  systemVersion: string
  sections: Record<string, any>
  summary: { passed: number; warnings: number; failures: number }
  overallStatus: string
  executionTime: string
}

export default function DiagnosticDashboard() {
  const [report, setReport] = useState<DiagnosticReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    strategyEvaluation: true,
    entryDecision: false,
    activeTrades: false,
    marketStatus: false,
    telegramAlerts: false,
    dataPipeline: false,
    infrastructure: false,
  })

  useEffect(() => {
    const fetchDiagnostic = async () => {
      try {
        const response = await fetch("/api/diagnostic/full-system")
        if (!response.ok) throw new Error("Failed to fetch diagnostic")
        const data = await response.json()
        setReport(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setLoading(false)
      }
    }

    fetchDiagnostic()
    const interval = setInterval(fetchDiagnostic, 30000)
    return () => clearInterval(interval)
  }, [])

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  const getStatusBadgeColor = (status: string) => {
    if (status.includes("✅")) return "bg-green-600"
    if (status.includes("⚠️")) return "bg-yellow-600"
    return "bg-red-600"
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>System Diagnostic</CardTitle>
            <CardDescription>Loading diagnostic data...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">Diagnostic Error</CardTitle>
            <CardDescription className="text-red-800">{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>No Data</CardTitle>
            <CardDescription>Unable to retrieve diagnostic data</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-slate-900">System Diagnostic Dashboard</h1>
          <p className="text-slate-600">v11.0.0-ARCHITECTURAL-RESET | Real-time monitoring and health status</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Overall Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{report.overallStatus}</div>
              <Badge className={`mt-2 ${getStatusBadgeColor(report.overallStatus)}`}>
                {report.overallStatus}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Passed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{report.summary.passed}</div>
              <p className="text-xs text-slate-500 mt-2">diagnostic checks</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Warnings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{report.summary.warnings}</div>
              <p className="text-xs text-slate-500 mt-2">items flagged</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Execution Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{report.executionTime}</div>
              <p className="text-xs text-slate-500 mt-2">total duration</p>
            </CardContent>
          </Card>
        </div>

        {/* Expandable Sections */}
        <div className="space-y-4">
          {[
            { key: "strategyEvaluation", label: "Strategy Evaluation", icon: "⚙️" },
            { key: "entryDecision", label: "Entry Decision", icon: "✓" },
            { key: "activeTrades", label: "Active Trades", icon: "📊" },
            { key: "marketStatus", label: "Market Status", icon: "📈" },
            { key: "telegramAlerts", label: "Telegram Alerts", icon: "🔔" },
            { key: "dataPipeline", label: "Data Pipeline", icon: "📡" },
            { key: "infrastructure", label: "Infrastructure", icon: "🔧" },
          ].map((section) => (
            <Card key={section.key}>
              <CardHeader
                className="cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => toggleSection(section.key)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{section.icon}</span>
                    <CardTitle>{section.label}</CardTitle>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    {expandedSections[section.key] ? "−" : "+"}
                  </Button>
                </div>
              </CardHeader>

              {expandedSections[section.key] && (
                <CardContent className="space-y-3 border-t pt-4">
                  <div className="text-sm text-slate-600">
                    {report.sections[section.key] ? (
                      <div className="space-y-2">
                        <pre className="bg-slate-100 p-3 rounded text-xs overflow-auto">
                          {JSON.stringify(report.sections[section.key], null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <p className="text-slate-500">No data available</p>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>

        {/* Footer */}
        <Card className="bg-slate-900 text-slate-100">
          <CardHeader>
            <CardTitle className="text-sm">System Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <p>System Version: <span className="font-mono text-slate-300">{report.systemVersion}</span></p>
            <p>Last Run: <span className="font-mono text-slate-300">{report.timestamp}</span></p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
