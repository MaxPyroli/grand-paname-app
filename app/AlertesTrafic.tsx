import { useContext } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useColors, ThemeContext } from './theme';
import { Icon } from './Icon';
import { panelCardStyle, PANEL_CONTENT_TOP_PAD } from './PanelLayout';
import { ListeFondue } from './ListeFondue';
import { FONDU_BAS } from './Fade';
import { MODE_ICONS } from './modeIcons';
import { symboleLigne } from './symbolesLignes';
import { SECTIONS_TRAFIC, LigneTrafic } from './traficApi';

// Réglage des alertes trafic (étape 1.5 du plan de la 3.4.0) : on choisit à la main les lignes à suivre ; un
// programme de surveillance (scripts/surveillance-trafic.js) envoie une notification quand l'une d'elles est
// interrompue ou fortement perturbée (ni travaux ni informations).
export type EtatAlertes = 'ok' | 'refuse' | 'erreur';

export default function AlertesTrafic({ lignes, suivies, onBasculer, etat, verre }: {
  lignes: LigneTrafic[] | null;
  suivies: string[];
  onBasculer: (idLigne: string) => void;
  etat: EtatAlertes;
  verre?: boolean;
}) {
  const c = useColors();
  const { isDark } = useContext(ThemeContext);

  return (
    <ListeFondue verre={verre}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 8, paddingTop: PANEL_CONTENT_TOP_PAD, paddingBottom: FONDU_BAS + 16 }}
      >
        <View style={[styles.carte, { backgroundColor: c.bgCard, borderColor: c.borderCard }]}>
          <Text style={[styles.carteTexte, { color: c.textSub }]}>
            Choisis les lignes à suivre. Tu recevras une notification quand leur trafic est interrompu ou fortement
            perturbé. Les travaux et les informations ne sont pas signalés.
          </Text>
        </View>

        {etat === 'refuse' && (
          <View style={[styles.carte, { backgroundColor: c.bgCard, borderColor: '#E5493E' }]}>
            <Text style={[styles.carteTitre, { color: c.text }]}>Notifications désactivées</Text>
            <Text style={[styles.carteTexte, { color: c.textSub }]}>
              Autorise les notifications de Grand Paname dans les réglages du téléphone pour recevoir les alertes.
            </Text>
            <TouchableOpacity onPress={() => Linking.openSettings().catch(() => {})} style={[styles.bouton, { backgroundColor: c.accent }]}>
              <Text style={styles.boutonTexte}>Ouvrir les réglages</Text>
            </TouchableOpacity>
          </View>
        )}
        {etat === 'erreur' && (
          <View style={[styles.carte, { backgroundColor: c.bgCard, borderColor: '#F39C12' }]}>
            <Text style={[styles.carteTexte, { color: c.textSub }]}>
              Ton choix est gardé sur le téléphone, mais n'a pas pu être envoyé : vérifie ta connexion. Il sera renvoyé au prochain essai.
            </Text>
          </View>
        )}

        {lignes === null ? (
          <Text style={[styles.carteTexte, { color: c.textSub, marginLeft: 4 }]}>Chargement des lignes…</Text>
        ) : SECTIONS_TRAFIC.map(section => {
          const deSection = lignes.filter(l => section.modes.includes(l.mode));
          if (deSection.length === 0) return null;
          return (
            <View key={section.cle} style={styles.section}>
              <View style={styles.sectionTitre}>
                <ExpoImage source={{ uri: MODE_ICONS[section.icone] ?? MODE_ICONS['BUS'] }} style={[styles.sectionIcone, { tintColor: c.textSub }]} contentFit="contain" />
                <Text style={[styles.sectionTexte, { color: c.textSub }]}>{section.libelle.toUpperCase()}</Text>
              </View>
              <View style={styles.grille}>
                {deSection.map(l => {
                  const choisie = suivies.includes(l.id);
                  const symbole = symboleLigne(l.mode, l.code, isDark);
                  return (
                    <TouchableOpacity
                      key={l.id}
                      activeOpacity={0.6}
                      onPress={() => onBasculer(l.id)}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: choisie }}
                      accessibilityLabel={`Alertes pour la ligne ${l.code}`}
                      style={[styles.case, choisie && { borderColor: c.accent, backgroundColor: c.accent + '22' }]}
                    >
                      {symbole
                        ? <ExpoImage source={{ uri: symbole }} style={[styles.symbole, !choisie && { opacity: 0.55 }]} contentFit="contain" />
                        : <View style={[styles.repli, { backgroundColor: '#' + l.color }, !choisie && { opacity: 0.55 }]}><Text style={[styles.repliTexte, { color: '#' + l.textColor }]}>{l.code}</Text></View>}
                      {choisie && (
                        <View style={[styles.coche, { backgroundColor: c.accent, borderColor: verre ? c.bgCard : c.bg }]}>
                          <Icon name="valider" size={10} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </ListeFondue>
  );
}

const styles = StyleSheet.create({
  carte: { ...panelCardStyle, flexDirection: 'column', alignItems: 'stretch', paddingVertical: 14, marginBottom: 10 },
  carteTitre: { fontSize: 15, fontFamily: 'GrandParis-Bold', marginBottom: 4 },
  carteTexte: { fontSize: 13, fontFamily: 'GrandParis-Light', lineHeight: 19 },
  bouton: { height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  boutonTexte: { color: '#fff', fontFamily: 'GrandParis-Bold', fontSize: 14 },
  section: { marginTop: 8 },
  sectionTitre: { flexDirection: 'row', alignItems: 'center', marginLeft: 4, marginBottom: 10, gap: 8 },
  sectionIcone: { width: 18, height: 18 },
  sectionTexte: { fontSize: 12, fontFamily: 'GrandParis-Bold', letterSpacing: 0.8 },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  case: { width: 50, height: 50, borderRadius: 16, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  symbole: { width: 40, height: 40 },
  repli: { minWidth: 40, height: 28, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  repliTexte: { fontSize: 13, fontFamily: 'GrandParis-Bold' },
  coche: { position: 'absolute', top: -3, right: -3, width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
