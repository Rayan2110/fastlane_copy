import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fastlane Local',
  description: 'Générateur local de vidéos marketing pour le dropshipping',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
