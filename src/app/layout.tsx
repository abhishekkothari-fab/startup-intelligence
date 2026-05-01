import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Startup Intelligence",
  description: "Deep research profiles for Indian D2C and BFSI startups",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
