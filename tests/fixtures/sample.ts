import type {ProductData, VideoScript} from '../../lib/types';

export const sampleProduct: ProductData = {
  title: 'Bracelet réveil vibrant SILÈNE',
  price: '39,90 €',
  compareAtPrice: '59,90 €',
  currency: 'EUR',
  description: 'Un bracelet fin en silicone qui vous réveille par une vibration au poignet.',
  benefits: ['Réveil silencieux', '10 jours d’autonomie', '5 coloris'],
  images: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
  sourceUrl: 'https://silene-3766.myshopify.com/products/bracelet-reveil-vibrant',
  vendor: 'SILÈNE',
};

export const sampleScript: VideoScript = {
  angle: 'probleme-solution',
  hook: 'Réveillé en sursaut chaque matin ?',
  scenes: [
    {imageIndex: 0, screenText: 'Réveil en sursaut ?', voiceText: 'Tu te réveilles encore avec une sonnerie stressante ?'},
    {imageIndex: 1, screenText: 'Vibration douce', voiceText: 'Ce bracelet te réveille par une douce vibration au poignet.'},
  ],
  cta: 'Le lien est en bio.',
};
