// Registre des surfaces flottantes qui reçoivent un verre dépoli DANS la carte
// (backdrop-filter côté WebView, voir setGlassRects dans MapWebView). Les
// surfaces déclarent leur rectangle en coordonnées fenêtre ; on retire
// l'origine de la carte et on envoie le tout par lots (une fois par image).
// x/y/w/h en dp ; `b` = distance au bas de l'écran (à la place de y ou h) ;
// `r` = rayon (nombre ou 4 rayons CSS) ; `o` = ombre CSS ; `tx` = décalage
// horizontal ; `nf` = pas de flou (ombre seule, le flou est natif) ; `anim` = la carte anime le changement (transition CSS de durée `d` ms).
export type RectVerre = { id: string; x: number; y?: number; w: number; h?: number; b?: number; r: number | string; o?: string; tx?: number; anim?: boolean; d?: number; nf?: boolean; op?: number };

const rects = new Map<string, RectVerre>();
let origine = { x: 0, y: 0 };
let envoyeur: ((liste: RectVerre[]) => void) | null = null;
let minuteur: ReturnType<typeof setTimeout> | null = null;

export function renvoyerVerre() {
  if (minuteur) return;
  minuteur = setTimeout(() => {
    minuteur = null;
    envoyeur?.([...rects.values()].map(r => ({ ...r, x: r.x - origine.x, y: r.y == null ? undefined : r.y - origine.y })));
  }, 16);
}

export function definirOrigine(x: number, y: number) {
  origine = { x, y };
  renvoyerVerre();
}

export function definirRect(r: RectVerre) {
  rects.set(r.id, r);
  renvoyerVerre();
}

export function retirerRect(id: string) {
  if (rects.delete(id)) renvoyerVerre();
}

export function definirEnvoyeur(fn: ((liste: RectVerre[]) => void) | null) {
  envoyeur = fn;
  renvoyerVerre();
}
