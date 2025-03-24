import { ThemeProvider } from "@/providers/theme-provider";
import { Metadata } from 'next'
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const runtime = "edge"; // 'nodejs' (default) | 'edge'

export const metadata: Metadata = {
  title: 'Deep Researcher',
  description: 'AI-powered research assistant'
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: 1,
};

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider 
      attribute="class" 
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      storageKey="deep-researcher-theme"
    >
      {children}
      <Toaster />
    </ThemeProvider>
  )
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <main className="min-h-screen">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
