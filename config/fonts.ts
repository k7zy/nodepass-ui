import { Inter, Fira_Code } from 'next/font/google'

export const fontSans = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
})

export const fontMono = Fira_Code({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
})
