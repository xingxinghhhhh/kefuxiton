import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI 客服演示会话',
  description: '安全的匿名会话与 Mock Agent 演示',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
