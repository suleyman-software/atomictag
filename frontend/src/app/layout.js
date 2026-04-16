import "./globals.css";

export const metadata = {
  title: "AtomicTag — Laser Tag Control Panel",
  description: "Real-time laser tag game dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body className="bg-gray-950 text-white antialiased">{children}</body>
    </html>
  );
}
