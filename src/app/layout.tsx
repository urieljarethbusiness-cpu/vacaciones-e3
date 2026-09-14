import type { Metadata, Viewport } from "next";
import { Poppins, Bebas_Neue, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ProveedorTema } from "@/components/tema/proveedor-tema";
import "./globals.css";

/**
 * Layout raíz — espejo del de E3 Manager sin los módulos que esta
 * recreación no trae (PWA, suplantación). Poppins en sus cinco pesos es la
 * fuente de la interfaz; Bebas Neue queda disponible como `font-display`.
 */
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "Vacaciones E3",
  title: "Vacaciones E3",
  description:
    "El sistema de vacaciones del equipo de Consultoría E3: solicitudes, saldos y aprobaciones.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
  themeColor: "#070707",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `dark` por defecto EN EL SERVIDOR: los tokens oscuros viven en `:root`
    // (globals.css), así que el HTML llega ya oscuro, sin script bloqueante
    // ni la advertencia de React 19 por renderizar <script> en un componente.
    // El tema claro es la excepción `.light`.
    <html
      lang="es"
      className={`dark ${poppins.variable} ${bebasNeue.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="flex h-dvh flex-col font-sans"
        suppressHydrationWarning
      >
        <ProveedorTema>
          {children}
          <Toaster
            richColors
            position="top-right"
            offset={{ top: "7rem", left: "1.5rem", right: "1.5rem" }}
            mobileOffset={{ top: "7rem", left: "1rem", right: "1rem" }}
          />
        </ProveedorTema>
      </body>
    </html>
  );
}
