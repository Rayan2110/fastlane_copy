import {Dashboard} from './ui';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main>
      <h1>
        Fastlane <span>Local</span>
      </h1>
      <p className="sub">
        Colle un lien produit, récupère des vidéos prêtes à poster.
      </p>
      <Dashboard />
    </main>
  );
}
