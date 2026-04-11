import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TuWebGo CRM",
  description: "Panel de control de TuWebGo — Analytics y CRM",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col font-['DM_Sans',system-ui,sans-serif]">{children}</body>
    </html>
  );
}
