import type { Metadata } from "next"
import { Geist, Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AppShell } from "@/components/app-shell"
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "HerosOne Core",
  description: "企业级数据智能核心平台",
  icons: { icon: "/icon.svg" },
}

const inter = Inter({subsets:['latin'],variable:'--font-sans'})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", inter.variable)}
    >
      <body>
        <ThemeProvider defaultTheme="dark">
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  )
}
