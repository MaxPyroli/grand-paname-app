import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etatDesLignes, analyserDetailLigne, nettoyerTexte, rechercherLignesBus, libelleMiseAJour } from '../traficApi.ts';

const NOW = new Date(2026, 9, 15, 12, 0, 0).getTime();   // 15 octobre 2026, 12 h (heure locale)
const dans = (j: number) => { const d = new Date(NOW + j * 86_400_000); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`; };
const ligne = (id: string) => ({ id, code: id, color: '000000', textColor: 'FFFFFF', mode: 'METRO' as const });
const PAS = { begin: dans(-1), end: dans(1) };

function bulk(perturb: any[], type = 'line') {
  return {
    disruptions: perturb.map((p, i) => ({ id: 'd' + i, applicationPeriods: [PAS], ...p })),
    lines: [{ id: 'L', impactedObjects: [{ type, disruptionIds: perturb.map((_, i) => 'd' + i) }] }],
  };
}
const etat = (perturb: any[], type = 'line') => etatDesLignes([ligne('L')], bulk(perturb, type), NOW)[0];

test('ligne sans perturbation : normale', () => {
  assert.deepEqual(etatDesLignes([ligne('L')], { disruptions: [], lines: [] }, NOW)[0].etat, 'normal');
  assert.equal(etatDesLignes([ligne('L')], undefined, NOW)[0].etat, 'normal');
});

test('classement : bloquante sur la ligne = interrompu, sur un arrêt = perturbé', () => {
  assert.equal(etat([{ severity: 'BLOQUANTE', cause: 'PERTURBATION' }]).etat, 'interrompu');
  assert.equal(etat([{ severity: 'BLOQUANTE', cause: 'PERTURBATION' }], 'stop_point').etat, 'perturbe');
});

test('classement : perturbée = perturbé, information = info', () => {
  assert.equal(etat([{ severity: 'PERTURBEE', cause: 'PERTURBATION' }]).etat, 'perturbe');
  assert.equal(etat([{ severity: 'PERTURBEE', cause: 'INFORMATION' }]).etat, 'info');
  assert.equal(etat([{ severity: 'INFORMATION', cause: 'PERTURBATION' }]).etat, 'info');
});

test('exception du titre « Traffic interrupted » (seulement sur la ligne)', () => {
  const p = { severity: 'PERTURBEE', cause: 'PERTURBATION', title: 'Traffic interrupted - power failure' };
  assert.equal(etat([p]).etat, 'interrompu');
  assert.equal(etat([p], 'stop_point').etat, 'perturbe');
  assert.equal(etat([{ ...p, title: 'Partial Traffic interrupted' }]).etat, 'perturbe');
});

test('travaux en cours : état « travaux », mais un incident en direct prime', () => {
  assert.equal(etat([{ severity: 'BLOQUANTE', cause: 'TRAVAUX' }]).etat, 'travaux');
  assert.equal(etat([{ severity: 'PERTURBEE', cause: 'TRAVAUX' }, { severity: 'PERTURBEE', cause: 'PERTURBATION' }]).etat, 'perturbe');
  assert.equal(etat([{ severity: 'INFORMATION', cause: 'INFORMATION' }, { severity: 'PERTURBEE', cause: 'TRAVAUX' }]).etat, 'travaux');
});

test('perturbation hors période ignorée ; sans période = en cours', () => {
  const futur = { severity: 'BLOQUANTE', cause: 'PERTURBATION', applicationPeriods: [{ begin: dans(2), end: dans(3) }] };
  assert.deepEqual([etat([futur]).etat, etat([futur]).nbPerturbations], ['normal', 0]);
  assert.equal(etat([{ severity: 'PERTURBEE', cause: 'PERTURBATION', applicationPeriods: [] }]).etat, 'perturbe');
});

test('nbPerturbations compte les perturbations en cours ; perturbation inconnue ignorée', () => {
  const b = bulk([{ severity: 'PERTURBEE', cause: 'PERTURBATION' }, { severity: 'PERTURBEE', cause: 'PERTURBATION' }]);
  b.lines[0].impactedObjects[0].disruptionIds.push('inconnue');
  assert.equal(etatDesLignes([ligne('L')], b, NOW)[0].nbPerturbations, 2);
});

test('les autres types d\'objets (réseau…) ne comptent pas', () => {
  assert.equal(etat([{ severity: 'BLOQUANTE', cause: 'PERTURBATION' }], 'network').etat, 'normal');
});

test('nettoyerTexte : HTML, entités, espaces', () => {
  assert.equal(nettoyerTexte('<p>Trafic&nbsp;interrompu</p><p>&#233;t&#xE9; &lt;3 &amp; plus</p>'), 'Trafic interrompu\nété <3 & plus');
  assert.equal(nettoyerTexte('a<br/>b<br>c'), 'a\nb\nc');
  assert.equal(nettoyerTexte('x\n\n\n\ny   z'), 'x\n\ny z');
  assert.equal(nettoyerTexte('&inconnue;'), '&inconnue;');
});

// ── Détail d'une ligne ──
const msg = (canal: string, text: string) => ({ channel: { name: canal }, text });
function dis(o: any = {}) {
  return {
    id: 'x', status: 'active', cause: 'perturbation', severity: { name: 'perturbée' },
    application_periods: [{ begin: dans(-1), end: dans(5) }],
    messages: [msg('titre', 'Titre A'), msg('moteur', 'Texte A')],
    impacted_objects: [{ pt_object: { embedded_type: 'line' } }], ...o,
  };
}
const detail = (...d: any[]) => analyserDetailLigne({ disruptions: d }, NOW);

test('détail : passé, sans titre, sans période, pannes d\'ascenseur ignorés', () => {
  const r = detail(dis({ status: 'past' }), dis({ messages: [] }), dis({ application_periods: [] }),
    dis({ messages: [msg('titre', 'Ascenseur en panne à Nation')] }), dis({ messages: [msg('titre', 'Escalier mécanique HS')] }));
  assert.equal(r.enCours.length + r.aVenir.length, 0);
});

test('détail : types selon gravité et cause', () => {
  const t = (o: any) => detail(dis(o)).enCours[0].type;
  assert.equal(t({ severity: { name: 'bloquante' } }), 'interrompu');
  assert.equal(t({ severity: { name: 'bloquante' }, impacted_objects: [{ pt_object: { embedded_type: 'stop_point' } }] }), 'perturbe');
  assert.equal(t({ cause: 'information' }), 'info');
  assert.equal(t({ severity: { name: 'information' } }), 'info');
  assert.equal(t({ messages: [msg('titre', 'Trafic interrompu - panne de courant')] }), 'interrompu');
  assert.equal(t({ messages: [msg('titre', 'Info : trafic interrompu hier')] }), 'perturbe');
});

test('détail : en cours / plus tard, et au-delà de 45 jours rien', () => {
  const r = detail(dis(), dis({ messages: [msg('titre', 'Plus tard')], application_periods: [{ begin: dans(10), end: dans(12) }] }),
    dis({ messages: [msg('titre', 'Trop loin')], application_periods: [{ begin: dans(60), end: dans(62) }] }));
  assert.deepEqual(r.enCours.map(p => p.titre), ['Titre A']);
  assert.deepEqual(r.aVenir.map(p => p.titre), ['Plus tard']);
  assert.match(r.aVenir[0].periode, /^À partir du \d+(er)? \S+/);
});

test('détail : périodes en français, « jusqu\'à nouvel ordre »', () => {
  const p = (fin: string) => detail(dis({ application_periods: [{ begin: dans(-1), end: fin }] })).enCours[0].periode;
  assert.equal(p('20261020T120000'), 'Jusqu\'au 20 octobre');
  assert.equal(p('20261101T020000'), 'Jusqu\'au 31 octobre');
  assert.equal(p('20261101T120000'), 'Jusqu\'au 1er novembre');
  assert.equal(p('20301231T120000'), 'Jusqu\'à nouvel ordre');
});

test('détail : doublons fusionnés, texte identique au titre vidé', () => {
  const r = detail(dis(), dis({ application_periods: [{ begin: dans(-3), end: dans(9) }] }), dis({ messages: [msg('titre', 'Seul')] }));
  assert.equal(r.enCours.length, 2);
  const fusion = r.enCours.find(p => p.titre === 'Titre A')!;
  assert.equal(fusion.fin, new Date(NOW + 9 * 86_400_000).getTime());
  assert.equal(r.enCours.find(p => p.titre === 'Seul')!.texte, '');
});

test('détail : tri — plus grave d\'abord, incident avant travaux', () => {
  const r = detail(
    dis({ cause: 'travaux', messages: [msg('titre', 'Travaux')] }),
    dis({ messages: [msg('titre', 'Incident')] }),
    dis({ severity: { name: 'bloquante' }, messages: [msg('titre', 'Coupure')] }),
    dis({ cause: 'information', messages: [msg('titre', 'Info')] }));
  assert.deepEqual(r.enCours.map(p => p.titre), ['Coupure', 'Incident', 'Travaux', 'Info']);
  assert.equal(r.enCours[2].cause, 'travaux');
});

test('détail : réponse vide ou absente', () => {
  assert.deepEqual(analyserDetailLigne(undefined, NOW), { enCours: [], aVenir: [], stations: [] });
});

// ── Recherche de bus ──
// (cette fonction lit l'heure réelle : les périodes sont calculées autour de maintenant)
const dateReelle = (j: number) => { const d = new Date(Date.now() + j * 86_400_000); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`; };
test("recherche de bus : seuls les bus, numéro exact d'abord, état calculé", async () => {
  const avant = globalThis.fetch;
  const ligneBus = (id: string, code: string) => ({ line: { id, code, color: 'FF1400', text_color: 'FFFFFF', physical_modes: [{ id: 'physical_mode:Bus' }] } });
  globalThis.fetch = (async (url: any) => {
    if (String(url).includes('pt_objects')) return { ok: true, json: async () => ({ pt_objects: [
      ligneBus('line:B2', '1104'), ligneBus('line:B1', '104'),
      { line: { id: 'line:M1', code: '1', physical_modes: [{ id: 'physical_mode:Metro' }] } }] }) };
    return { ok: true, json: async () => ({ disruptions: [{ id: 'd0', cause: 'PERTURBATION', severity: 'BLOQUANTE', applicationPeriods: [{ begin: dateReelle(-1), end: dateReelle(1) }] }],
      lines: [{ id: 'line:B1', impactedObjects: [{ type: 'line', disruptionIds: ['d0'] }] }] }) };
  }) as any;
  try {
    const r = await rechercherLignesBus('104');
    assert.deepEqual(r.map(l => l.code), ['104', '1104']);
    assert.equal(r[0].mode, 'BUS');
    assert.equal(r[0].etat, 'interrompu');
    assert.equal(r[1].etat, 'normal');
    assert.deepEqual(await rechercherLignesBus('   '), []);
  } finally { globalThis.fetch = avant; }
});

test('détail : date et heure de mise à jour (la plus récente en cas de doublons)', () => {
  const r = detail(dis({ updated_at: '20261124T135200' }), dis({ updated_at: '20261124T141500', application_periods: [{ begin: dans(-3), end: dans(9) }] }), dis({ messages: [msg('titre', 'Sans date')] }));
  assert.equal(r.enCours.find(p => p.titre === 'Titre A')!.miseAJour, new Date(2026, 10, 24, 14, 15, 0).getTime());
  assert.equal(r.enCours.find(p => p.titre === 'Sans date')!.miseAJour, null);
  assert.equal(libelleMiseAJour(new Date(2026, 10, 24, 14, 5).getTime()), 'Mis à jour le 24 novembre à 14 h 05');
});
