import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'US: The People Admin',
  description: 'Verification and moderation dashboard for the civic prototype',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
