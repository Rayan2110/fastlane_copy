import Link from 'next/link';
import {ProductView} from '../../ui';

export const dynamic = 'force-dynamic';

export default function ProductPage({params}: {params: {id: string}}) {
  return (
    <main>
      <Link href="/" className="back">
        ← Retour aux produits
      </Link>
      <div style={{height: 16}} />
      <ProductView productId={Number(params.id)} />
    </main>
  );
}
