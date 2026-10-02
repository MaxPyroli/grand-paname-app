import React, { useContext, useState } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors, ThemeContext } from './theme';
import { FadeTop, FadeBottom, hexToRgba, FONDU_HAUT, FONDU_BAS } from './Fade';

// Masque de dégradé pour le fondu des bords d'une liste sur le verre des tiroirs. Module natif : absent d'un
// build de développement plus ancien que son installation → on retombe sur les fondus de couleur (voir GardeMasque).
export let MaskedView: any = null;
try { MaskedView = require('@react-native-masked-view/masked-view').default; } catch { MaskedView = null; }
export class GardeMasque extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { erreur: boolean }> {
  state = { erreur: false };
  static getDerivedStateFromError() { return { erreur: true }; }
  render() { return this.state.erreur ? this.props.fallback : this.props.children; }
}

// Zone de liste avec fondus standard en haut (FONDU_HAUT) et en bas (FONDU_BAS), comme les Favoris.
// `verre` : tiroir en verre (masque de dégradé) ; sinon fondus de la couleur du fond. La zone dépasse de 8 px de
// chaque côté pour ne pas couper les ombres des cartes : donner le même `paddingHorizontal: 8` au contenu de la liste.
export function ListeFondue({ verre, children }: { verre?: boolean; children: React.ReactNode }) {
  const c = useColors();
  const { isDark } = useContext(ThemeContext);
  const [hauteur, setHauteur] = useState(0);
  const teinte = isDark ? hexToRgba(c.bgCard, 0.3) : 'rgba(255,255,255,0.6)';
  return (
    <View style={{ flex: 1, marginHorizontal: -8 }} onLayout={e => setHauteur(e.nativeEvent.layout.height)}>
      {verre && MaskedView ? (
        <GardeMasque fallback={<>{children}<FadeTop color={teinte} /><FadeBottom color={teinte} /></>}>
          <MaskedView
            style={{ flex: 1 }}
            maskElement={
              <LinearGradient
                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,1)', 'rgba(0,0,0,1)', 'rgba(0,0,0,0)']}
                locations={hauteur > 0 ? [0, FONDU_HAUT / hauteur, 1 - FONDU_BAS / hauteur, 1] : [0, 0.02, 0.94, 1]}
                style={{ flex: 1 }}
              />
            }
          >
            {children}
          </MaskedView>
        </GardeMasque>
      ) : (
        <>
          {children}
          <FadeTop color={verre ? teinte : c.bg} />
          <FadeBottom color={verre ? teinte : c.bg} />
        </>
      )}
    </View>
  );
}
