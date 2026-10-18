import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relay · Department workspace",
  description: "Local department agent activity and owner approvals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
