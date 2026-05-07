import "./globals.css";

export const metadata = {
  title: "AtomicTag",
  description: "Laser Tag Kontrol Paneli",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body className="bg-gray-950 text-white min-h-screen">{children}</body>
    </html>
  );
}
