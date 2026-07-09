import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BRAND } from "@/lib/brand";
import { CreditNotifier } from "@/components/CreditNotifier";
import { NavProgress } from "@/components/NavProgress";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark-grey"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Apply the stored theme before first paint (no flash). Dark Grey
            is the default; "ember" means no data-theme attribute. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("bs-theme")||"dark-grey";if(t==="ember"){document.documentElement.removeAttribute("data-theme")}else{document.documentElement.setAttribute("data-theme",t)}}catch(e){}`,
          }}
        />
        <NavProgress />
        <CreditNotifier />
        {children}
      </body>
    </html>
  );
}
