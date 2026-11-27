import { useContext, useEffect, useState } from 'react';
import { Linking, Platform, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Constants from 'expo-constants';
import { ThemeContext, useColors } from '../theme';
import { Icon } from '../Icon';
import { symboleLigne } from '../symbolesLignes';
import { Carte, Interrupteur, LigneReglage, ListeChoix, PageReglages, type Choix } from './composants';
import { changerPrefs, chargerPrefs, lirePrefs, suivrePrefs, type NiveauAlertes } from '../prefsNotifs';
import {
  ecouterLignesSuivies, enregistrerBusSuivis, enregistrerLignesSuivies, enregistrerNiveauAlertes,
  lireBusSuivis, lireCatalogueLignes, lireLignesSuivies, lignesSuiviesConnues, busSuivisConnus, type BusSuivi,
} from '../notifications';

const ROUGE = '#E5493E', ORANGE = '#F39C12', BLEU = '#3C91DC';
const NIVEAUX: Choix<NiveauAlertes>[] = [
  { cle: 'toutes', titre: 'Toutes', texte: 'Interruptions, perturbations et informations.', points: [ROUGE, ORANGE, BLEU] },
  { cle: 'standard', titre: 'Perturbations et interruptions', texte: 'Les incidents en cours, sans les informations.', points: [ROUGE, ORANGE] },
  {
    cle: 'interruptions', titre: 'Interruptions', texte: 'Seulement quand le trafic est annoncé comme interrompu.', points: [ROUGE],
    avertissement: 'Certaines coupures peuvent ne pas être signalées si elles ne sont pas annoncées comme une interruption.',
  },
];

export function usePrefsNotifs() {
  const [prefs, setPrefs] = useState(lirePrefs);
  useEffect(() => {
    const arret = suivrePrefs(() => setPrefs(lirePrefs()));
    chargerPrefs().then(setPrefs);
    return arret;
  }, []);
  return prefs;
}

// Texte de la ligne « Notifications » sur la page principale des Paramètres.
export function useResumeNotifs(): string {
  const prefs = usePrefsNotifs();
  const [nombre, setNombre] = useState(() => lignesSuiviesConnues().length);
  useEffect(() => {
    lireBusSuivis();
    lireLignesSuivies().then(l => setNombre(l.length));
    return ecouterLignesSuivies(l => setNombre(l.length));
  }, []);
  const niveau = NIVEAUX.find(n => n.cle === prefs.niveau)!.titre;
  return `${niveau} · ${nombre === 0 ? 'aucune ligne' : `${nombre} ligne${nombre > 1 ? 's' : ''}`}`;
}

// Ouvre les réglages de notifications Android de CETTE application (à défaut, sa fiche dans les réglages).
function ouvrirNotificationsAndroid() {
  const paquet = Constants.expoConfig?.android?.package;
  if (Platform.OS !== 'android' || !paquet) { Linking.openSettings(); return; }
  Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [{ key: 'android.provider.extra.APP_PACKAGE', value: paquet }])
    .catch(() => Linking.openSettings());
}

export default function PageNotifications({ onRetour, onAjouterLigne }: { onRetour: () => void; onAjouterLigne: () => void }) {
  const c = useColors();
  const { isDark } = useContext(ThemeContext);
  const prefs = usePrefsNotifs();
  const [suivies, setSuivies] = useState<string[]>(lignesSuiviesConnues);
  const [bus, setBus] = useState<BusSuivi[]>(busSuivisConnus);
  useEffect(() => {
    lireLignesSuivies().then(setSuivies);
    lireBusSuivis().then(setBus);
    return ecouterLignesSuivies(setSuivies);
  }, []);

  const choisirNiveau = (niveau: NiveauAlertes) => {
    changerPrefs({ niveau });
    enregistrerNiveauAlertes(niveau);
  };
  const retirer = (id: string) => {
    const apres = suivies.filter(x => x !== id);
    setSuivies(apres);
    if (bus.some(b => b.id === id)) {
      const restants = bus.filter(b => b.id !== id);
      setBus(restants);
      enregistrerBusSuivis(restants);
    }
    enregistrerLignesSuivies(apres);
  };

  const catalogue = lireCatalogueLignes();
  const nbBus = suivies.filter(id => bus.some(b => b.id === id)).length;
  const nbLignes = suivies.length - nbBus;
  const resume = suivies.length === 0 ? 'Aucune ligne suivie'
    : [nbLignes > 0 ? `${nbLignes} ligne${nbLignes > 1 ? 's' : ''}` : '', nbBus > 0 ? `${nbBus} bus` : ''].filter(Boolean).join(' et ') + (suivies.length > 1 ? ' suivis' : nbBus ? ' suivi' : ' suivie');

  return (
    <PageReglages icone="notifications" titre="Notifications" sousTitre={resume} action="Retour" onAction={onRetour}>
      <Carte titre="Me prévenir pour">
        <ListeChoix choix={NIVEAUX} valeur={prefs.niveau} onChange={choisirNiveau} />
        <View style={{ height: 4 }} />
      </Carte>

      <Carte titre="Lignes suivies">
        <View style={styles.grille}>
          {suivies.map(id => {
            const unBus = bus.find(b => b.id === id);
            const ligne = catalogue.get(id);
            const symbole = ligne && !unBus ? symboleLigne(ligne.mode, ligne.code, isDark) : undefined;
            const code = unBus?.code ?? ligne?.code ?? '?';
            const fond = unBus?.color ?? ligne?.color;
            const texte = unBus?.textColor ?? ligne?.textColor;
            return (
              <TouchableOpacity key={id} style={styles.case} activeOpacity={0.7} onPress={() => retirer(id)} accessibilityRole="button" accessibilityLabel={`Ne plus suivre la ligne ${code}`}>
                {symbole
                  ? <ExpoImage source={{ uri: symbole }} style={styles.symbole} contentFit="contain" />
                  : (
                    <View style={[styles.bus, { backgroundColor: fond ? '#' + fond : c.pillCenter }]}>
                      <Text style={[styles.busTexte, { color: texte ? '#' + texte : c.text }]} numberOfLines={1}>{code}</Text>
                    </View>
                  )}
                <View style={[styles.croix, { backgroundColor: c.pillCenter, borderColor: c.bgCard }]}>
                  <Icon name="quitter" size={8} color={c.accent} />
                </View>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={[styles.plus, { backgroundColor: c.pillCenter }]} activeOpacity={0.7} onPress={onAjouterLigne} accessibilityRole="button" accessibilityLabel="Ajouter une ligne">
            <Text style={[styles.plusTexte, { color: c.accent }]}>+</Text>
          </TouchableOpacity>
        </View>
      </Carte>

      <Carte>
        <LigneReglage
          icone="bandeau" titre="Alertes dans l'app"
          texte={prefs.dansApp ? 'S’affichent en haut de l’écran' : 'Notifications Android seulement'}
          droite={<Interrupteur label="Alertes dans l'app" actif={prefs.dansApp} onChange={dansApp => changerPrefs({ dansApp })} />}
        />
        <LigneReglage
          trait icone="vibration" titre="Vibration" texte="Pour les alertes dans l’app" desactivee={!prefs.dansApp}
          droite={<Interrupteur label="Vibration" desactive={!prefs.dansApp} actif={prefs.vibration} onChange={vibration => changerPrefs({ vibration })} />}
        />
      </Carte>

      <Carte>
        <LigneReglage icone="telephone-reglages" titre="Notifications Android" texte="Son, bannière, catégories" droite="externe" onPress={ouvrirNotificationsAndroid} />
      </Carte>
    </PageReglages>
  );
}

const styles = StyleSheet.create({
  grille: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingBottom: 12 },
  case: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  symbole: { width: 46, height: 46 },
  bus: { minWidth: 42, maxWidth: 46, height: 26, borderRadius: 13, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  busTexte: { fontSize: 13, fontFamily: 'GrandParis-Bold', includeFontPadding: false },
  croix: { position: 'absolute', top: -2, right: -4, width: 17, height: 17, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  plus: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  plusTexte: { fontSize: 22, lineHeight: 26, fontFamily: 'GrandParis-Medium' },
});
