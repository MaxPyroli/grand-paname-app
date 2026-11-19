// Registre des surfaces flottantes qui reçoivent un verre dépoli DANS la carte
// (backdrop-filter côté WebView, voir setGlassRects dans MapWebView). Les
// surfaces déclarent leur rectangle en coordonnées fenêtre ; on retire
// l'origine de la carte et on envoie le tout par lots (une fois par image).
// x/y/w/h en dp ; `b` = distance au bas de l'écran (à la place de y ou h) ;
// `r` = rayon (nombre ou 4 rayons CSS) ; `o` = ombre CSS ; `tx` = décalage
// horizontal ; `nf` = pas de flou (ombre seule, le flou est natif) ; `anim` = la carte anime le changement (transition CSS de durée `d` ms).
export type RectVerre = { id: string; x: number; y?: number; w: number; h?: number; b?: number; r: number | string; o?: string; tx?: number; anim?: boolean; d?: number; nf?: boolean; op?: number; fo?: boolean };

const rects = new Map<string, RectVerre>();
let origine = { x: 0, y: 0 };
let envoyeur: ((liste: RectVerre[]) => void) | null = null;
let minuteur: ReturnType<typeof setTimeout> | null = null;

// Rotation : les rectangles de verre sont dessinés DANS la carte (une WebView qui se redimensionne et reçoit ses nouvelles
// positions avec du retard), alors que les éléments natifs sont déjà à leur nouvelle place : le flou « traînait » derrière
// eux. Pendant la rotation les rectangles sont donc masqués d'un coup (`voilerVerre`) puis réapparaissent en fondu une fois
// la carte à jour : plus de flou qui se déplace en retard.
let voile = false;
let reapparition = false;

function liste(): RectVerre[] {
  return [...rects.values()].map(r => ({
    ...r, x: r.x - origine.x, y: r.y == null ? undefined : r.y - origine.y,
    ...(voile ? { op: 0, anim: false } : {}), ...(reapparition ? { fo: true } : {}),
  }));
}

export function renvoyerVerre() {
  if (minuteur) return;
  minuteur = setTimeout(() => {
    minuteur = null;
    envoyeur?.(liste());
    reapparition = false;
  }, 16);
}

export function voilerVerre(dureeMs = 300) {
  voile = true;
  envoyeur?.(liste());
  if (voileMinuteur) clearTimeout(voileMinuteur);
  voileMinuteur = setTimeout(() => { voile = false; reapparition = true; voileMinuteur = null; renvoyerVerre(); }, dureeMs);
}
let voileMinuteur: ReturnType<typeof setTimeout> | null = null;

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
