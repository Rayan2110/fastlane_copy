import Link from 'next/link';
import {AvatarStudio} from './studio';

export const dynamic = 'force-dynamic';

export default function AvatarsPage() {
  return (
    <main>
      <Link href="/" className="back">
        ← Retour aux produits
      </Link>
      <div style={{height: 16}} />
      <h1>
        Tes <span>avatars</span>
      </h1>
      <p className="sub">
        Des personnages réutilisables pour tes vidéos UGC. Un portrait coûte ~0,03 $ de crédits
        fal.ai — crée-en plusieurs et garde les plus crédibles.
      </p>
      <AvatarStudio />
    </main>
  );
}
