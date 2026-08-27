import Link from 'next/link';
import {Dashboard} from './ui';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main>
      <div className="row" style={{justifyContent: 'space-between', alignItems: 'flex-start'}}>
        <h1>
          Fastlane <span>Local</span>
        </h1>
        <Link href="/avatars" className="button-link">
          🧑 Avatars
        </Link>
      </div>
      <p className="sub">
        Colle un lien produit, récupère des vidéos prêtes à poster.
      </p>
      <Dashboard />
    </main>
  );
}
