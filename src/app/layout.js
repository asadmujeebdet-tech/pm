import { Geist, Geist_Mono } from 'next/font/google';
import ThemeInitializer from '@/components/layout/ThemeInitializer';
import './globals.css';
import './premium.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata = {
  title: {
    default: 'Project Manager',
    template: '%s · Project Manager',
  },
  description: 'A focused workspace for teams to plan projects, organize work, and keep momentum.'
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#111521' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <ThemeInitializer />
      </head>
      <body>{children}</body>
    </html>
  );
}
