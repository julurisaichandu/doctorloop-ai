import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { MotionProvider } from "@/components/motion/motion-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });
const display = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "DoctorLoop AI",
    template: "%s · DoctorLoop AI",
  },
  description:
    "Between appointments, nothing gets lost. Capture recovery updates, review them, and share only what you approve with your care team. Prototype with synthetic data.",
};

const toastStyle = {
  "--normal-bg": "var(--ink)",
  "--normal-text": "var(--paper)",
  "--normal-border": "var(--ink-3)",
  "--border-radius": "14px",
  "--success-bg": "var(--ink)",
  "--success-text": "var(--paper)",
  "--success-border": "var(--ink-3)",
  "--error-bg": "var(--ink)",
  "--error-text": "var(--vermilion)",
  "--error-border": "var(--vermilion-deep)",
  "--info-bg": "var(--ink)",
  "--info-text": "var(--paper)",
  "--info-border": "var(--ink-3)",
  "--warning-bg": "var(--ink)",
  "--warning-text": "var(--amber)",
  "--warning-border": "var(--ink-3)",
} as CSSProperties;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <MotionProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster
            theme="light"
            position="bottom-right"
            style={toastStyle}
            toastOptions={{ classNames: { toast: "cn-toast font-sans" } }}
          />
        </MotionProvider>
      </body>
    </html>
  );
}
