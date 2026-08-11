import { useColors } from './theme';
import { Icon, IconInfoTraficCouleur } from './Icon';
import { PanelLayout } from './PanelLayout';
import { PanelEmptyState } from './PanelEmptyState';

// Tiroir "Info trafic" — coquille pour l'instant (contenu réel prévu plus
// tard), même moteur PanelLayout/PanelEmptyState que Favoris pour rester
// cohérent visuellement avec le reste des tiroirs.
export default function TraficScreen() {
  const c = useColors();
  return (
    <PanelLayout
      icon={<IconInfoTraficCouleur size={26} dotColor={c.text} />}
      title="Info trafic"
      subtitle="État du trafic en temps réel"
      headerAlign="left"
    >
      <PanelEmptyState
        icon={<Icon name="info-trafic" size={44} color={c.textSub} />}
        title="Bientôt disponible"
        description="L'info trafic en temps réel arrive dans une prochaine mise à jour."
      />
    </PanelLayout>
  );
}
