import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import DesignProviders from "@/components/DesignProviders";
const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});
const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});
export const metadata = {
    title: "Task Scheduler",
    description: "Task scheduling and resource management starter template",
};
export default function RootLayout({ children, }) {
    return (<html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <DesignProviders>{children}</DesignProviders>
      </body>
    </html>);
}
