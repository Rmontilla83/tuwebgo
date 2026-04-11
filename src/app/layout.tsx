import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TuWebGo — Portal",
  description: "Panel de control de TuWebGo — Analytics, CRM y Campañas",
  icons: { icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect x='2' y='4' width='28' height='20' rx='4' fill='%234F46E5'/><circle cx='7' cy='9' r='1.5' fill='%23FF5F57'/><circle cx='11' cy='9' r='1.5' fill='%23FEBC2E'/><circle cx='15' cy='9' r='1.5' fill='%2328C840'/><text x='9' y='22' font-size='8' fill='white' font-weight='bold'>&lt;/&gt;</text></svg>" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
