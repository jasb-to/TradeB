import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "TradeB - Gold & Silver Trading Signals",
  description:
    "Professional XAU_USD & XAG_USD trading signals with multi-timeframe analysis, session filtering, and intelligent risk management",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('unhandledrejection', function(event) {
                if (event.reason && (
                  event.reason.message?.includes('MetaMask') ||
                  event.reason.message?.includes('ethereum') ||
                  event.reason.message?.includes('web3')
                )) {
                  event.preventDefault();
                }
              });
            `,
          }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
