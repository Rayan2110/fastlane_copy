import {describe, it, expect} from 'vitest';
import {parseScripts, buildScriptsPrompt} from '../lib/scripts-gen';
import {sampleProduct} from './fixtures/sample';

const validScript = {
  angle: 'curiosite',
  hook: 'Tu connais ce bracelet ?',
  scenes: [
    {imageIndex: 0, screenText: 'Le secret', voiceText: 'Voici un secret pour mieux dormir.'},
    {imageIndex: 1, screenText: 'Vibration douce', voiceText: 'Il vibre doucement pour te réveiller.'},
    {imageIndex: 0, screenText: 'Zéro bruit', voiceText: 'Sans aucun bruit pour les autres.'},
  ],
  cta: 'Le lien est en bio.',
};

describe('parseScripts', () => {
  it('accepte un tableau de scripts valides', () => {
    const raw = JSON.stringify([validScript, validScript]);
    expect(parseScripts(raw, 5)).toHaveLength(2);
  });

  it('clamp les imageIndex hors bornes', () => {
    const bad = {
      ...validScript,
      scenes: [{...validScript.scenes[0], imageIndex: 99}, validScript.scenes[1]],
    };
    const out = parseScripts(JSON.stringify([bad]), 3);
    expect(out[0].scenes[0].imageIndex).toBe(2);
  });

  it('filtre les scripts sans scenes et garde les valides', () => {
    const noScenes = {...validScript, scenes: []};
    const out = parseScripts(JSON.stringify([noScenes, validScript]), 5);
    expect(out).toHaveLength(1);
  });

  it('throw si aucun script valide', () => {
    expect(() => parseScripts('pas du json', 5)).toThrow();
    expect(() => parseScripts('[{"angle": "x"}]', 5)).toThrow();
  });

  it('tolere les fences markdown', () => {
    const raw = '```json\n' + JSON.stringify([validScript]) + '\n```';
    expect(parseScripts(raw, 5)).toHaveLength(1);
  });
});

describe('buildScriptsPrompt', () => {
  it('contient le produit, le nombre demande et la contrainte d images', () => {
    const prompt = buildScriptsPrompt(sampleProduct, 12);
    expect(prompt).toContain('12');
    expect(prompt).toContain(sampleProduct.title);
    expect(prompt).toContain(`0 et ${sampleProduct.images.length - 1}`);
  });
});
