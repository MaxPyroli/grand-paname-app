// Éléments de l'app que le tutoriel guidé peut éclairer : chacun s'enregistre avec `ref={refCible('…')}` (la vue doit
// avoir `collapsable={false}` pour exister sur Android). Le tutoriel les mesure à l'écran au moment de les éclairer.
import type { CibleTuto } from './tuto';

type Mesurable = { measureInWindow: (f: (x: number, y: number, w: number, h: number) => void) => void };

const cibles = new Map<CibleTuto, Mesurable>();
const refs = new Map<CibleTuto, (n: unknown) => void>();

// Toujours la même fonction pour une cible donnée (sinon React la détache et la rattache à chaque rendu).
export function refCible(id: CibleTuto): (n: unknown) => void {
  let f = refs.get(id);
  if (!f) {
    f = n => { if (n) cibles.set(id, n as Mesurable); else cibles.delete(id); };
    refs.set(id, f);
  }
  return f;
}

export function lireCible(id: CibleTuto): Mesurable | undefined { return cibles.get(id); }
