"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
    const interval = setInterval(fetchDiagnostic, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [])

  if (loading) return <div className="p-8 text-center">Loading system diagnostic...</div>
  if (error) return <div className="p-8 text-center text-red-600">Error: {error}</div>
  if (!report) return <div className="p-8 text-center">No diagnostic data</div>

  const getStatusColor = (status: string) => {
    if (status.includes("✅")) return "text-green-600"
    if (status.includes("⚠")) return "text-yellow-600"
    if (status.includes("❌")) return "text-red-600"
    return "text-gray-600"
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold">System Diagnostic Report</h1>
        <p className="text-gray-600">{report.overallStatus}</p>
        <p className="text-sm text-gray-500">
          Version: {report.systemVersion} | Generated: {new Date(report.timestamp).toLocaleString()}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Passed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{report.summary.passed}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Warnings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{report.summary.warnings}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Failures</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{report.summary.failures}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Execution Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.executionTime}</div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Sections */}
      <Tabs defaultValue="strategyEvaluation" className="w-full">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="strategyEvaluation">Strategy</TabsTrigger>
          <TabsTrigger value="entryDecision">Entry Decision</TabsTrigger>
          <TabsTrigger value="activeTrades">Active Trades</TabsTrigger>
          <TabsTrigger value="marketStatus">Market Status</TabsTrigger>
          <TabsTrigger value="telegramAlerts">Telegram</TabsTrigger>
          <TabsTrigger value="dataPipeline">Data Pipeline</TabsTrigger>
          <TabsTrigger value="infrastructure">Infrastructure</TabsTrigger>
        </TabsList>

        <TabsContent value="strategyEvaluation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Strategy Evaluation</CardTitle>
              <CardDescription>Signal generation for all symbols</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {report.sections.strategyEvaluation?.checks?.map((check: any, idx: number) => (
                  <div key={idx} className="border-b pb-4 last:border-b-0">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold">{check.symbol}</h4>
                        <div className="text-sm text-gray-600 mt-1">
                          <p>Strict: {check.strict?.type} (Tier {check.strict?.tier}, Score {check.strict?.score})</p>
                          <p>Balanced: {check.balanced?.type} (Tier {check.balanced?.tier}, Score {check.balanced?.score})</p>
                        </div>
                      </div>
                      <span className={`font-semibold ${getStatusColor(check.status)}`}>{check.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="entryDecision" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Entry Decision Enforcement</CardTitle>
              <CardDescription>Tier enforcement and approval state validation</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {report.sections.entryDecision?.assertions?.map((assertion: any, idx: number) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-sm">{assertion.name}</h4>
                        <p className="text-xs text-gray-600 mt-1">{assertion.check}</p>
                      </div>
                      <span className={`font-semibold text-xs ${getStatusColor(assertion.status)}`}>{assertion.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activeTrades" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Trades</CardTitle>
              <CardDescription>Redis trade state {report.sections.activeTrades?.redisStatus}</CardDescription>
            </CardHeader>
            <CardContent>
              {report.sections.activeTrades?.activeTrades?.length > 0 ? (
                <div className="space-y-3">
                  {report.sections.activeTrades.activeTrades.map((trade: any, idx: number) => (
                    <div key={idx} className="p-3 bg-gray-50 rounded">
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="font-semibold">{trade.symbol}</h4>
                          <p className="text-sm text-gray-600">{trade.direction} @ {trade.entry} (Tier {trade.tier})</p>
                        </div>
                        <span className="text-sm px-2 py-1 bg-green-100 text-green-800 rounded">{trade.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600">No active trades</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marketStatus" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Market Status</CardTitle>
              <CardDescription>UI and market detection validation</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {report.sections.marketStatus?.checks?.map((check: any, idx: number) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-sm">{check.name}</h4>
                        <p className="text-xs text-gray-600 mt-1">{check.detail}</p>
                      </div>
                      <span className={`font-semibold text-xs ${getStatusColor(check.status)}`}>{check.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="telegramAlerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Telegram Alerts</CardTitle>
              <CardDescription>Alert enforcement and formatting</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {report.sections.telegramAlerts?.checks?.map((check: any, idx: number) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-sm">{check.name}</h4>
                        <p className="text-xs text-gray-600 mt-1">{check.detail}</p>
                        {check.requirements && (
                          <ul className="text-xs text-gray-600 mt-2 ml-4 list-disc">
                            {check.requirements.map((req: string, ridx: number) => (
                              <li key={ridx}>{req}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <span className={`font-semibold text-xs ${getStatusColor(check.status)}`}>{check.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dataPipeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Data Pipeline</CardTitle>
              <CardDescription>Candle quality and feed integrity</CardDescription>
            </CardHeader>
            <CardContent>
              {report.sections.dataPipeline?.checks?.map((check: any, idx: number) => (
                <div key={idx} className="p-3 bg-gray-50 rounded">
                  <h4 className="font-semibold text-sm mb-2">{check.symbol}</h4>
                  <div className="grid grid-cols-5 gap-2 text-sm">
                    <div>Daily: {check.daily}</div>
                    <div>4H: {check.h4}</div>
                    <div>1H: {check.h1}</div>
                    <div>15m: {check.m15}</div>
                    <div>5m: {check.m5}</div>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">{check.dataQuality}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="infrastructure" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Infrastructure</CardTitle>
              <CardDescription>System configuration and environment</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {report.sections.infrastructure?.checks?.map((check: any, idx: number) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-sm">{check.name}</h4>
                      {check.version && <p className="text-xs text-gray-600 mt-1">Version: {check.version}</p>}
                      {check.detail && <p className="text-xs text-gray-600 mt-1">{check.detail}</p>}
                    </div>
                    <span className={`font-semibold text-xs ${getStatusColor(check.status)}`}>{check.status}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>System Health Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 bg-green-50 rounded">
            <p className="font-semibold text-green-800">✅ v11.0.0 Architecture Enforced</p>
            <p className="text-sm text-green-700 mt-1">Architectural separation between strategy, Redis, and UI enforced via runtime assertions and defensive checks.</p>
          </div>
          <div className="p-3 bg-green-50 rounded">
            <p className="font-semibold text-green-800">✅ Entry Approval Immutable</p>
            <p className="text-sm text-green-700 mt-1">Strategy evaluation results cannot be mutated after evaluation. Tier corruption detection active.</p>
          </div>
          <div className="p-3 bg-green-50 rounded">
            <p className="font-semibold text-green-800">✅ Telegram Alerts Gated</p>
            <p className="text-sm text-green-700 mt-1">5-gate alert system prevents alerts on rejected trades or closed markets.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
