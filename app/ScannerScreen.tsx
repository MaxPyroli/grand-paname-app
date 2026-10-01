import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, ToastAndroid, Animated, Easing, Vibration } from 'react-native';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from './theme';
import { Icon, IconScannerNavigoCouleur } from './Icon';
import { PanelLayout, panelCardStyle, panelChipStyle } from './PanelLayout';
import { FadeTop, FadeBottom, FONDU_HAUT } from './Fade';

import Station from './reader/Station';
import Tarif from './reader/Tarif';
import EventCode from './reader/EventCode';
import EventResult from './reader/EventResult';

// Portage de Grand Paname Reader (projet séparé, C:\Users\maxim\Documents\
// navigoreader, lui-même dérivé de "navigo reader") — lecture et décodage
// des passes Navigo (protocole Calypso) via NFC. Portage fonctionnel pour
// l'instant : look propre au lecteur conservé tel quel (pas encore habillé
// avec le thème de Grand Paname), ça viendra dans une étape séparée.
// Android uniquement : la lecture bas niveau (isoDepHandler.transceive,
// APDU ISO-DEP) est spécifique à Android.

const stationHelper = new Station();
const tarifHelper = new Tarif();
const eventCodeHelper = new EventCode();
const eventResultHelper = new EventResult();

const EPOCH = new Date(1997, 0, 1).getTime();

// --- CHAMPS CALYPSO OFFICIELS ---
const CONTRACT_FIELDS = [
  { name: 'NetworkId', bits: 24 }, { name: 'Provider', bits: 8 }, { name: 'Tarif', bits: 16 },
  { name: 'SerialNumber', bits: 32 }, { name: 'CustomerBitmap', bits: 2 }, { name: 'PassengerBitmap', bits: 2 },
  { name: 'VehicleClass', bits: 6 }, { name: 'PaymentPointer', bits: 32 }, { name: 'PayMethod', bits: 11 },
  { name: 'Services', bits: 16 }, { name: 'PriceAmount', bits: 16 }, { name: 'PriceUnit', bits: 16 },
  { name: 'RestrictBitmap', bits: 7 }, { name: 'ValidityBitmap', bits: 9 }, { name: 'JourneyBitmap', bits: 8 },
  { name: 'SaleBitmap', bits: 4 }, { name: 'Status', bits: 8 }, { name: 'LoyaltyPoints', bits: 16 },
  { name: 'Authenticator', bits: 16 }, { name: 'ContractData', bits: 0 },
];

const VALIDITY_FIELDS = [
  { name: 'StartDate', bits: 14 }, { name: 'StartTime', bits: 11 }, { name: 'EndDate', bits: 14 },
  { name: 'EndTime', bits: 11 }, { name: 'Duration', bits: 8 }, { name: 'LimitDate', bits: 14 },
  { name: 'Zones', bits: 8 }, { name: 'Journeys', bits: 16 }, { name: 'PeriodJourneys', bits: 8 },
];

const EVENT_FIELDS = [
  { name: 'DisplayData', bits: 8 }, { name: 'NetworkId', bits: 24 }, { name: 'Code', bits: 8 },
  { name: 'Result', bits: 8 }, { name: 'ServiceProvider', bits: 8 }, { name: 'NotokCounter', bits: 8 },
  { name: 'SerialNumber', bits: 24 }, { name: 'Destination', bits: 16 }, { name: 'LocationId', bits: 16 },
  { name: 'LocationGate', bits: 8 }, { name: 'Device', bits: 16 }, { name: 'RouteNumber', bits: 16 },
  { name: 'RouteVariante', bits: 8 }, { name: 'JourneyRun', bits: 16 }, { name: 'VehicleId', bits: 16 },
  { name: 'VehicleClass', bits: 8 }, { name: 'LocationType', bits: 5 }, { name: 'Employee', bits: 240 },
  { name: 'LocationReference', bits: 16 }, { name: 'JourneyInterchanges', bits: 8 }, { name: 'PeriodJourneys', bits: 16 },
  { name: 'TotalJourneys', bits: 16 }, { name: 'JourneyDistance', bits: 16 }, { name: 'PriceAmount', bits: 16 },
  { name: 'PriceUnit', bits: 16 }, { name: 'ContractPointer', bits: 5 }, { name: 'Authenticator', bits: 16 },
  { name: 'EventDataBitmap', bits: 5 },
];

// --- UTILITAIRES BITS ---
function toBitArray(bytes: number[]): number[] {
  const bits: number[] = [];
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  }
  return bits;
}

function readBits(bits: number[], offset: number, length: number): number {
  let result = 0;
  for (let i = 0; i < length; i++) result = (result << 1) | (bits[offset + i] ?? 0);
  return result;
}

function getEnabledFields(bitmapValue: number, fields: any[]) {
  const enabled = [];
  let flags = bitmapValue;
  for (let i = 0; i < fields.length; i++) {
    if (flags % 2 === 1) enabled.push(fields[i]);
    flags >>= 1;
  }
  return enabled;
}

function decodeDate(days: number): string {
  if (days === 0) return 'Inconnue';
  const d = new Date(EPOCH + days * 86400000);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function decodeTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}h${m}`;
}

function decodeZones(value: number): string {
  const zones: number[] = [];
  for (let i = 0; i < 8; i++) {
    if ((value >> i) & 1) zones.push(i + 1);
  }
  if (zones.length === 0) return '';
  zones.sort((a, b) => a - b);
  return `Zones ${zones[0]}-${zones[zones.length - 1]}`;
}

function hexString(bytes: number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

// Traduit les erreurs brutes de react-native-nfc-manager (souvent une
// exception native peu parlante, ex: "TagLostException") en message
// compréhensible — le retrait du passe en cours de lecture est l'erreur la
// plus fréquente sur le terrain, bien avant un vrai bug.
function formatNfcError(ex: unknown): string {
  const raw = ex instanceof Error ? ex.message : typeof ex === 'string' ? ex : JSON.stringify(ex);
  const low = raw.toLowerCase();
  if (low.includes('tag was lost') || low.includes('taglost')) {
    return '📴 Le passe a été retiré trop tôt. Garde-le bien immobile contre le dos du téléphone pendant tout le scan.';
  }
  if (low.includes('ioexception') || low.includes('io error') || low.includes('transceive')) {
    return '⚠️ Erreur de communication avec le passe. Rapproche-le du dos du téléphone et réessaie.';
  }
  if (low.includes('cancel')) {
    return 'Scan annulé.';
  }
  return `❌ Erreur technique : ${raw}`;
}

// Différencie ce qui est simplement écrit sur le contrat (dates, nombre de
// trajets d'origine) de ce qui est réellement utilisable maintenant — un
// forfait dont la date de fin est passée reste lisible sur la puce, mais
// n'est plus valable pour voyager. Comparaison sur des jours entiers depuis
// l'epoch Calypso (1997-01-01), comme StartDate/EndDate/Journeys.
type ContractStatus = { emoji: string; label: string; active: boolean };

function computeContractStatus(fields: any, isTicket: boolean): ContractStatus {
  const todayDays = Math.floor((Date.now() - EPOCH) / 86400000);

  if (fields.EndDate && fields.EndDate > 0 && fields.EndDate < todayDays) {
    return { emoji: '⏳', label: 'Expiré', active: false };
  }
  if (fields.StartDate && fields.StartDate > todayDays) {
    return { emoji: '🕒', label: 'Pas encore actif', active: false };
  }
  // Vérifié sur le terrain (carte réelle à 0 ticket restant) : le champ
  // `Journeys` de ce contrat contient bien une valeur pour les tickets à
  // l'unité, mais elle ne correspond PAS au vrai nombre restant — le vrai
  // compteur doit vivre ailleurs (un fichier "compteurs" séparé, pas encore
  // identifié). Mieux vaut ne rien affirmer que d'afficher un chiffre faux.
  if (isTicket) {
    return { emoji: '❓', label: 'Nombre de tickets non fiable', active: false };
  }
  if (fields.Journeys !== undefined) {
    let nb = fields.Journeys;
    if (nb > 255) nb = nb & 0xFF;
    return nb === 0
      ? { emoji: '❌', label: 'Épuisé', active: false }
      : { emoji: '✅', label: 'Actif', active: true };
  }
  if (fields.EndDate) {
    return { emoji: '✅', label: 'Actif', active: true };
  }
  return { emoji: '❓', label: 'Statut inconnu', active: false };
}

// Couleur associée à chaque statut de contrat, réutilisée pour la pastille
// de statut ET pour savoir si la carte doit être affichée en grisé (les
// contrats "épuisés"/"expirés" restent lisibles mais ne doivent pas
// attirer l'œil autant qu'un contrat encore utilisable).
function contractStatusColor(status: ContractStatus): string {
  if (status.label === 'Actif') return '#27A65C';
  if (status.label === 'Pas encore actif') return '#2E9BD6';
  if (status.label === 'Expiré' || status.label === 'Épuisé') return '#E5493E';
  return '#F2B705';
}

function isContractDimmed(status: ContractStatus): boolean {
  return status.label === 'Expiré' || status.label === 'Épuisé';
}

// Ordre d'affichage des contrats : ce qui est utilisable ou le sera bientôt
// remonte en premier, ce qui ne sert plus à rien redescend en bas — plutôt
// que l'ordre brut de lecture des 4 emplacements de la puce.
function contractSortPriority(status: ContractStatus): number {
  switch (status.label) {
    case 'Actif': return 0;
    case 'Pas encore actif': return 1;
    case 'Épuisé': return 2;
    case 'Expiré': return 3;
    default: return 1.5;
  }
}

// --- STRUCTURE DES DONNÉES ---
interface DisplayItem {
  id: string;
  type: 'header' | 'item' | 'subitem' | 'raw';
  text: string;
  devInfo?: string;
}

interface IdentityInfo {
  icon: string;
  title: string;
  number: string;
  extra?: string;
  devInfo?: string;
}

interface ContractCard {
  id: string;
  tarifName: string;
  status: ContractStatus;
  details: string[];
  devInfo?: string;
}

// Validations et incidents fusionnés dans une seule chronologie (`kind` les
// distingue visuellement) plutôt que deux listes séparées dans l'ordre de
// lecture des fichiers — trié du plus récent au plus ancien après coup.
interface EventRow {
  id: string;
  kind: 'ok' | 'incident';
  label: string;
  station: string;
  dateText: string;
  timeText: string;
  reason?: string;
  sortKey: number;
  devInfo?: string;
}

interface ScanResult {
  identity: IdentityInfo | null;
  contracts: ContractCard[];
  events: EventRow[];
}

type NfcStatus = 'checking' | 'ready' | 'unsupported' | 'disabled';

export default function ScannerScreen({ active }: { active?: boolean }) {
  const c = useColors();
  // `dataList` reste utilisé par le dump intégral (résultat à deux lignes,
  // pas besoin du même habillage) ; un scan normal remplit `scanResult`,
  // affiché avec de vraies cartes (voir renderScanResult plus bas).
  const [dataList, setDataList] = useState<DisplayItem[]>([]);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [rawLogs, setRawLogs] = useState<string[]>([]);
  // Message d'échec (erreur, timeout, annulation) affiché bien en évidence
  // dans le contenu — voir renderScanVisual — tant qu'aucun nouveau scan n'a
  // été lancé. Le sous-titre du header, lui, reste une description fixe du
  // panneau, pas un journal d'état qui change à chaque étape.
  const [scanError, setScanError] = useState<string | null>(null);

  // Le mode dev de l'appli (réglé dans Paramètres, persisté séparément) est
  // la condition d'affichage de l'interrupteur ci-dessous — pas question de
  // le dupliquer ici. ScannerScreen reste monté en permanence (onglet glissé
  // hors écran, pas démonté), donc on relit la valeur à chaque passage sur
  // l'onglet (`active`) plutôt qu'une seule fois au montage, pour rester à
  // jour si elle a été changée entre-temps dans Paramètres.
  const [appDevMode, setAppDevMode] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('@gp_dev_mode').then(v => setAppDevMode(v === '1'));
  }, [active]);

  // Remplace l'ancien "secret tap" (10 appuis sur le titre) par un
  // interrupteur explicite, mais seulement visible si le mode dev de
  // l'appli est actif — voir `appDevMode` ci-dessus. `devFeaturesOn`
  // masque aussi les fonctions dev si l'interrupteur maître est retiré
  // pendant qu'il était activé, sans avoir à réinitialiser `dumpModeOn`.
  const [dumpModeOn, setDumpModeOn] = useState(false);
  const isDevMode = appDevMode && dumpModeOn;

  // Quelle action attend un passe, le cas échéant ('scan' ou 'dump') — plutôt
  // qu'un simple booléen, pour savoir quel bouton doit se transformer en
  // « Annuler » et lequel doit rester désactivé (une seule session NFC à la
  // fois). `isScanning` reste dérivé pour l'anneau qui pulse dans le contenu.
  const [scanKind, setScanKind] = useState<'scan' | 'dump' | null>(null);
  const isScanning = scanKind !== null;
  // Distingue "on attend que le passe touche le téléphone" de "le passe est
  // là, on est en train de le décoder" — sans ça l'écran d'attente reste
  // affiché tel quel pendant toute la lecture (qui prend un instant), ce qui
  // laisse croire que rien ne se passe une fois le passe posé.
  const [tagDetected, setTagDetected] = useState(false);

  // Réf (pas de state) car lue uniquement dans le bloc catch, pas besoin de
  // re-render : distingue une annulation volontaire ou un timeout d'une
  // vraie erreur de lecture, pour ne pas afficher "Erreur technique" quand
  // c'est juste l'utilisateur qui a annulé.
  const scanReasonRef = useRef<'user' | 'timeout' | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SCAN_TIMEOUT_MS = 20000;
  const TIMEOUT_MESSAGE = '⏱️ Aucun passe détecté après 20 secondes. Approche le passe du dos du téléphone et réessaie.';

  function clearScanTimeout() {
    if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null; }
  }

  function cancelScan(reason: 'user' | 'timeout') {
    scanReasonRef.current = reason;
    clearScanTimeout();
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }

  // Encadre toute session NFC (scan ou dump) : démarre le timeout d'attente,
  // lance requestTechnology puis la tâche fournie, et centralise le message
  // affiché en cas d'échec (annulation, timeout, ou vraie erreur technique).
  async function runNfcSession(task: () => Promise<void>) {
    scanReasonRef.current = null;
    setTagDetected(false);
    clearScanTimeout();
    scanTimeoutRef.current = setTimeout(() => cancelScan('timeout'), SCAN_TIMEOUT_MS);

    try {
      await NfcManager.requestTechnology(NfcTech.IsoDep);
      // Confirme au toucher que le passe a bien été détecté — le bip du
      // système Android joue au même moment mais n'est pas pilotable par
      // l'app (voir la discussion sur le son personnalisé). `Vibration.
      // vibrate` pilote directement le moteur avec une durée explicite,
      // contrairement aux constantes de retour haptique système (expo-
      // haptics) qui restent à peine perceptibles sur Android.
      Vibration.vibrate(80);
      setTagDetected(true);
      await task();
      Vibration.vibrate([0, 40, 60, 80]);
    } catch (ex) {
      setDataList([]);
      const message = scanReasonRef.current === 'user' ? 'Scan annulé.'
        : scanReasonRef.current === 'timeout' ? TIMEOUT_MESSAGE
        : formatNfcError(ex);
      setScanError(message);
      // Pas de vibration sur une annulation volontaire (déjà le geste de
      // l'utilisateur) ; avertissement sur timeout, erreur sur un vrai échec.
      if (scanReasonRef.current === 'timeout') {
        Vibration.vibrate(150);
      } else if (scanReasonRef.current === null) {
        Vibration.vibrate([0, 100, 80, 100]);
      }
    } finally {
      clearScanTimeout();
      setScanKind(null);
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  }

  useEffect(() => clearScanTimeout, []);

  // Anneau qui grossit et s'estompe en boucle pendant l'attente (même esprit
  // que le halo de pulsation de la position GPS sur la carte) — tourne tant
  // qu'isScanning est vrai, s'arrête et se réinitialise sinon.
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isScanning) { pulseAnim.setValue(0); return; }
    const loop = Animated.loop(
      Animated.timing(pulseAnim, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => { loop.stop(); pulseAnim.setValue(0); };
  }, [isScanning]);
  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 2.4] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.8, 0, 0] });

  // Absent de l'app d'origine : celle-ci n'appelait jamais NfcManager.start()
  // ni ne vérifiait isSupported(), donc `requestTechnology` échouait en
  // silence sur un téléphone sans puce NFC (ou NFC désactivé). On démarre
  // le gestionnaire une fois au montage et on vérifie l'état réel.
  const [nfcStatus, setNfcStatus] = useState<NfcStatus>('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supported = await NfcManager.isSupported();
        if (cancelled) return;
        if (!supported) { setNfcStatus('unsupported'); return; }
        await NfcManager.start();
        if (cancelled) return;
        if (Platform.OS === 'android') {
          const enabled = await NfcManager.isEnabled();
          if (cancelled) return;
          setNfcStatus(enabled ? 'ready' : 'disabled');
        } else {
          setNfcStatus('ready');
        }
      } catch {
        if (!cancelled) setNfcStatus('unsupported');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Intercepte les erreurs de longueur (6C XX) et renvoie la requête avec la bonne taille
  async function transceiveWithLengthAutoCorrection(cmd: number[]): Promise<number[]> {
    let resp = await NfcManager.isoDepHandler.transceive(cmd);
    if (resp.length >= 2 && resp[resp.length - 2] === 0x6C) {
      const correctLength = resp[resp.length - 1];
      const correctedCmd = [...cmd];
      correctedCmd[correctedCmd.length - 1] = correctLength;
      resp = await NfcManager.isoDepHandler.transceive(correctedCmd);
    }
    return resp;
  }

  // --- SCAN INTELLIGENT (Lecture ciblée et rapide) ---
  async function scanPass() {
    if (nfcStatus !== 'ready') return;
    setDataList([]);
    setScanResult(null);
    setRawLogs([]);
    setScanError(null);
    setScanKind('scan');

    await runNfcSession(async () => {
      let identity: IdentityInfo | null = null;
      const contracts: ContractCard[] = [];
      const events: EventRow[] = [];
      const hexDump: string[] = [];

      const tag = await NfcManager.getTag();
      if (tag && tag.id) hexDump.push(`Tag UID: ${tag.id}`);

      let cla = 0x00;
      let isFlatMemory = false;
      let supportType = "Inconnu";

      let resp = await NfcManager.isoDepHandler.transceive([0x94, 0xA4, 0x04, 0x00, 0x08, 0x31, 0x54, 0x49, 0x43, 0x2E, 0x49, 0x43, 0x41, 0x00]);
      if (resp[resp.length - 2] === 0x90) { cla = 0x94; supportType = "Passe Rigide"; }

      if (supportType === "Inconnu") {
        resp = await NfcManager.isoDepHandler.transceive([0x00, 0xA4, 0x04, 0x00, 0x08, 0x31, 0x54, 0x49, 0x43, 0x2E, 0x49, 0x43, 0x41, 0x00]);
        if (resp[resp.length - 2] === 0x90) supportType = "Navigo Easy (Light)";
      }

      if (supportType === "Inconnu") {
        resp = await NfcManager.isoDepHandler.transceive([0x00, 0xA4, 0x00, 0x00, 0x02, 0x20, 0x00]);
        if (resp[resp.length - 2] === 0x90) supportType = "Passe Rigide";
      }

      if (supportType === "Inconnu") {
         isFlatMemory = true;
         supportType = "Passe Souple";
      }

      async function readRecord(sfi: number, fileId: number[], record: number): Promise<number[] | null> {
         try {
            // MÉTHODE 1 : Lecture directe via le numéro SFI
            const p2 = (sfi << 3) | 4;
            let readResp = await transceiveWithLengthAutoCorrection([cla, 0xB2, record, p2, 0x1D]);

            if (readResp && readResp.length > 2 && readResp[readResp.length - 2] === 0x90) {
               return readResp;
            }

            // MÉTHODE 2 : Fallback par sélection du fichier (A4) si la lecture directe a échoué
            if (!isFlatMemory && fileId && fileId.length === 2) {
               const selResp = await transceiveWithLengthAutoCorrection([cla, 0xA4, 0x00, 0x00, 0x02, ...fileId]);
               if (selResp && selResp.length > 1 && selResp[selResp.length - 2] === 0x90) {
                  readResp = await transceiveWithLengthAutoCorrection([cla, 0xB2, record, 0x04, 0x1D]);
                  if (readResp && readResp.length > 2 && readResp[readResp.length - 2] === 0x90) {
                     return readResp;
                  }
               }
            }
         } catch (e) {
            // Silence des erreurs pour ne pas crasher la boucle globale
         }
         return null;
      }

      // ENVIRONNEMENT
      const envData = await readRecord(1, [0x20, 0x01], 1);
      if (envData) {
          hexDump.push(`Env (SFI 1): ${hexString(envData)}`);
          const bits = toBitArray(envData.slice(0, -2));
          let pos = 6;
          const bitmap = readBits(bits, pos, 7); pos += 7;

          let passNum = "Inconnu";
          let logicalNum = "Inconnu";
          let endDate = "Inconnue";

          if ((bitmap >> 6) & 1) pos += 24;
          if ((bitmap >> 5) & 1) pos += 8;
          if ((bitmap >> 4) & 1) {
             logicalNum = readBits(bits, pos, 32).toString(); pos += 32;
             if (tag && tag.id) {
                const idHex = tag.id.length > 8 ? tag.id.substring(tag.id.length - 8) : tag.id;
                passNum = parseInt(idHex, 16).toString().padStart(10, '0');
             } else passNum = logicalNum;
          }
          if ((bitmap >> 3) & 1) pos += 14;
          if ((bitmap >> 2) & 1) { endDate = decodeDate(readBits(bits, pos, 14)); pos += 14; }

          identity = {
            icon: '🪪',
            title: 'Informations',
            number: passNum,
            extra: `Expire le ${endDate} · ${supportType}`,
            devInfo: `App Logic: ${logicalNum} | Tag UID: ${tag ? tag.id : 'N/A'}`,
          };
      } else if (isFlatMemory) {
          const sfi2Rec1 = await readRecord(2, [0x20, 0x20], 1);
          let bscNum = "Inconnu";
          if (sfi2Rec1) {
              const data = sfi2Rec1.slice(0, -2);
              let offset = (data[0] === 0x00 && data[1] === 0x00) ? 16 : 0;
              if (data.length >= offset + 4) {
                 const val = (data[offset] << 24) | (data[offset+1] << 16) | (data[offset+2] << 8) | data[offset+3];
                 bscNum = (val >>> 0).toString().padStart(10, '0');
              }
          }
          identity = {
            icon: '🔖',
            title: 'Informations',
            number: bscNum,
            extra: supportType,
            devInfo: 'Lu sur SFI 2.',
          };
      }

      // CONTRATS
      const targetSfiContracts = isFlatMemory ? 2 : 9;

      for (let i = 1; i <= 4; i++) {
         const contData = await readRecord(targetSfiContracts, [0x20, 0x20], i);
         if (contData) {
            hexDump.push(`Contrat (SFI 2, Rec ${i}): ${hexString(contData)}`);
            const data = contData.slice(0, -2);
            if (!data.every(b => b === 0 || b === 255)) {
              const bits = toBitArray(data);
              let pos = (isFlatMemory && data[0] === 0x00 && data[1] === 0x00) ? 128 : 0;
              const bitmapValue = readBits(bits, pos, 20); pos += 20;
              const enabledFields = getEnabledFields(bitmapValue, CONTRACT_FIELDS);
              const fields: any = {};
              for (const field of enabledFields) {
                if (field.bits === 0) continue;
                fields[field.name] = readBits(bits, pos, field.bits); pos += field.bits;
                if (field.name === 'ValidityBitmap') {
                  const valEnabled = getEnabledFields(fields['ValidityBitmap'], VALIDITY_FIELDS);
                  for (const vf of valEnabled) { fields[vf.name] = readBits(bits, pos, vf.bits); pos += vf.bits; }
                }
              }

              const isValidContract = (fields.Tarif && fields.Tarif !== 0) || (isFlatMemory && i === 1);

              if (isValidContract) {
                 const tarifName = fields.Tarif ? (tarifHelper.getTarif(fields.Tarif) || `Code Tarif: ${fields.Tarif}`) : "Ticket t+";
                 // Tous les tarifs "à l'unité" (Tarif.ts) sont nommés "Ticket
                 // ...". Le champ Journeys s'est avéré peu fiable pour ce
                 // type de contrat (vérifié sur une carte réelle), donc on
                 // n'affiche ni le statut ni le détail basés dessus pour eux.
                 const isTicket = tarifName.startsWith('Ticket');

                 let detailsList: string[] = [];

                 if (!isFlatMemory && !isTicket) {
                    if (fields.PriceAmount) detailsList.push(`${(fields.PriceAmount / 100).toFixed(2).replace('.', ',')} €`);
                    let nbJourneys = fields.Journeys;
                    if (nbJourneys !== undefined && nbJourneys > 255) nbJourneys = nbJourneys & 0xFF;
                    if (nbJourneys !== undefined) detailsList.push(nbJourneys === 0 ? '❌ Épuisé' : `🎫 ${nbJourneys} trajet(s)`);
                 } else if (!isFlatMemory && fields.PriceAmount) {
                    detailsList.push(`${(fields.PriceAmount / 100).toFixed(2).replace('.', ',')} €`);
                 }

                 if (fields.Zones) detailsList.push(decodeZones(fields.Zones));
                 if (fields.StartDate && fields.EndDate) detailsList.push(`Du ${decodeDate(fields.StartDate)} au ${decodeDate(fields.EndDate)}`);
                 else if (fields.StartDate) detailsList.push(`À partir du ${decodeDate(fields.StartDate)}`);

                 // Ce qui est écrit sur la puce (dates, trajets d'origine) ne
                 // dit pas si le contrat sert encore à quelque chose
                 // aujourd'hui — le statut le précise explicitement.
                 const status = computeContractStatus(fields, isTicket);
                 contracts.push({
                   id: `c-${i}`,
                   tarifName,
                   status,
                   details: detailsList,
                   devInfo: `Tarif ID: ${fields.Tarif || 'ABSENT'}`,
                 });
              }
            }
         }
      }
      contracts.sort((a, b) => contractSortPriority(a.status) - contractSortPriority(b.status));

      // --- VALIDATIONS ET INCIDENTS (fusionnés, triés du plus récent au plus ancien) ---
      const seenEvents = new Set<string>();

      const targets = isFlatMemory ? [3, 4] : [3, 8, 4, 29];

      for (const sfi of targets) {
         const isSpecialFile = (sfi === 4 || sfi === 29);
         const fileId = isSpecialFile ? [0x20, 0x11] : [0x20, 0x10];

         for (let i = 1; i <= 3; i++) {
            const valData = await readRecord(sfi, fileId, i);

            if (valData) {
               const data = valData.slice(0, -2);
               if (!data.every(b => b === 0)) {
                  const bits = toBitArray(data);
                  let pos = 0;
                  const dateStamp = readBits(bits, pos, 14); pos += 14;
                  const timeStamp = readBits(bits, pos, 11); pos += 11;

                  if (dateStamp > 1000 && dateStamp < 16000 && timeStamp < 1440) {
                     let code: number | undefined = undefined;
                     let locationId: number | undefined = undefined;
                     let result: number | undefined = undefined;

                     if (data.length > 5) {
                        pos = 25;
                        const bitmapValue = readBits(bits, pos, 28); pos += 28;
                        const enabledFields = getEnabledFields(bitmapValue, EVENT_FIELDS);

                        const fields: any = {};
                        for (const field of enabledFields) {
                          if (field.bits === 0) continue;
                          fields[field.name] = readBits(bits, pos, field.bits);
                          pos += field.bits;
                        }

                        code = fields.Code;
                        result = fields.Result;
                        locationId = fields.LocationId;
                     }

                     const eventKey = `${dateStamp}-${timeStamp}-${code || 0}`;
                     if (seenEvents.has(eventKey)) continue;
                     seenEvents.add(eventKey);

                    const stationStr = locationId !== undefined ? stationHelper.getStation(code ?? 0, locationId) || '' : '';

                    const eventStr = code !== undefined ? eventCodeHelper.getEventCode(code) || `Action (0x${code.toString(16).toUpperCase()})` : 'Validation';

                    const resultStr = result !== undefined ? eventResultHelper.getEventResult(result) : undefined;
                    const isIncidentRow = isSpecialFile || (result !== undefined && result !== 0);

                    events.push({
                      id: isIncidentRow ? `inc-${sfi}-${i}` : `val-${sfi}-${i}`,
                      kind: isIncidentRow ? 'incident' : 'ok',
                      label: eventStr,
                      station: stationStr,
                      dateText: decodeDate(dateStamp),
                      timeText: decodeTime(timeStamp),
                      reason: isIncidentRow ? (resultStr || `Code erreur inconnu (0x${result?.toString(16)})`) : undefined,
                      sortKey: dateStamp * 1440 + timeStamp,
                      devInfo: `SFI ${sfi} Ligne ${i} | Code: ${code} Res: ${result}`,
                    });
                  }
               }
            }
         }
      }
      events.sort((a, b) => b.sortKey - a.sortKey);

      setScanResult({ identity, contracts, events });
      setRawLogs(hexDump);
    });
  }

  // --- LE DUMPER INTÉGRAL (BRUTE-FORCE) ---
  async function dumpPass() {
    if (nfcStatus !== 'ready') return;
    setDataList([]);
    setScanResult(null);
    setRawLogs([]);
    setScanError(null);
    setScanKind('dump');

    await runNfcSession(async () => {
      const hexDump: string[] = [];

      const tag = await NfcManager.getTag();
      if (tag && tag.id) hexDump.push(`Tag UID: ${tag.id}\n`);

      // Journalise le statut de chaque tentative de sélection d'application
      // (dernier octet-2 de la réponse : 90 00 = succès, autre chose = refus/
      // introuvable) — sur un pass virtuel (téléphone/montre), si les 3
      // tentatives échouent, ça pointe vers un blocage au niveau de
      // l'émulation elle-même (aucun fichier ne pourra ensuite répondre),
      // pas vers un mauvais numéro de SFI dans la boucle qui suit.
      let cla = 0x00;
      let resp = await NfcManager.isoDepHandler.transceive([0x94, 0xA4, 0x04, 0x00, 0x08, 0x31, 0x54, 0x49, 0x43, 0x2E, 0x49, 0x43, 0x41, 0x00]);
      hexDump.push(`Sélection appli (cla 94, AID 1TIC.ICA) : ${hexString(resp)}`);
      if (resp[resp.length - 2] === 0x90) cla = 0x94;
      else {
        resp = await NfcManager.isoDepHandler.transceive([0x00, 0xA4, 0x04, 0x00, 0x08, 0x31, 0x54, 0x49, 0x43, 0x2E, 0x49, 0x43, 0x41, 0x00]);
        hexDump.push(`Sélection appli (cla 00, AID 1TIC.ICA) : ${hexString(resp)}`);
        if (resp[resp.length - 2] !== 0x90) {
           resp = await NfcManager.isoDepHandler.transceive([0x00, 0xA4, 0x00, 0x00, 0x02, 0x20, 0x00]);
           hexDump.push(`Sélection fichier générique (2000) : ${hexString(resp)}`);
        }
      }

      hexDump.push("--- DÉBUT DE L'EXTRACTION COMPLÈTE ---");

      for (let sfi = 1; sfi <= 30; sfi++) {
        let p2 = (sfi << 3) | 4;
        let foundSomethingInSFI = false;

        for (let rec = 1; rec <= 10; rec++) {
           try {
             const readResp = await NfcManager.isoDepHandler.transceive([cla, 0xB2, rec, p2, 0x1D]);

             if (readResp.length > 2 && readResp[readResp.length - 2] === 0x90) {
                if (!foundSomethingInSFI) {
                   hexDump.push(`\n[ Fichier SFI ${sfi} ]`);
                   foundSomethingInSFI = true;
                }
                hexDump.push(`Ligne ${rec} : ${hexString(readResp)}`);
             } else {
                break;
             }
           } catch (e) {
             break;
           }
        }
      }

      hexDump.push("\n--- FIN DU DUMP ---");
      setRawLogs(hexDump);
      setDataList([
         { id: 'dump-ok', type: 'item', text: '✅ Dump terminé avec succès.' },
         { id: 'dump-desc', type: 'subitem', text: 'Toute la mémoire cachée du passe a été extraite ci-dessous.' }
      ]);
    });
  }

  // Rendu partagé par les trois états "rien à afficher" du panneau (attente
  // d'un passe, échec, aucun scan encore fait) : même squelette (icône dans
  // le même cadre 88×88, mêmes styles de titre/description) pour que le
  // logo et les textes restent exactement à la même position d'un état à
  // l'autre, et que la transition entre eux paraisse fluide plutôt que de
  // sauter.
  function renderScanVisual({ icon, title, description, pulse }: {
    icon: React.ReactNode; title: string; description: string; pulse?: boolean;
  }) {
    return (
      <View style={styles.scanningWrap}>
        <View style={[styles.scanningIconWrap, { backgroundColor: c.iconGareBg }]}>
          {pulse && (
            <Animated.View
              style={[
                styles.pulseRing,
                { borderColor: '#2E9BD6', opacity: pulseOpacity, transform: [{ scale: pulseScale }] },
              ]}
            />
          )}
          {icon}
        </View>
        <Text style={[styles.scanningText, { color: c.text }]}>{title}</Text>
        <Text style={[styles.scanningSubText, { color: c.textSub }]}>{description}</Text>
      </View>
    );
  }

  // Titre de section "propre" (icône + libellé + compteur), en remplacement
  // des anciens en-têtes façon log ("[CONTRATS]") qui avaient plus leur
  // place dans un terminal que dans l'app.
  function SectionTitle({ label, count }: { icon?: string; label: string; count?: number }) {
    return (
      <View style={styles.sectionTitleRow}>
        <Text style={[styles.sectionTitleText, { color: c.textSub }]}>{label.toUpperCase()}</Text>
        {count !== undefined && <Text style={[styles.sectionTitleCount, { color: c.textSub }]}>{count}</Text>}
      </View>
    );
  }

  function IdentityCardView({ identity }: { identity: IdentityInfo }) {
    return (
      <View style={[styles.card, { backgroundColor: c.bgCard, borderColor: c.borderCard }]}>
        <View style={styles.identityRow}>
          <View style={[panelChipStyle, { backgroundColor: c.iconGareBg, marginRight: 0 }]}>
            <Text style={styles.identityIcon}>{identity.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: c.text }]}>N° {identity.number}</Text>
            {identity.extra ? <Text style={[styles.cardDetails, { color: c.textSub }]}>{identity.extra}</Text> : null}
          </View>
        </View>
        {isDevMode && identity.devInfo && <Text style={[styles.devInlineText, { color: c.textSub }]}>{identity.devInfo}</Text>}
      </View>
    );
  }

  // Carte plus compacte et grisée pour un contrat épuisé/expiré — ce qui
  // n'est plus utilisable ne doit pas attirer l'œil autant que ce qui l'est
  // encore, plutôt que la même carte pleine opacité pour tous les statuts.
  function ContractCardView({ contract }: { contract: ContractCard }) {
    const color = contractStatusColor(contract.status);
    const dimmed = isContractDimmed(contract.status);
    return (
      <View style={[styles.card, { backgroundColor: c.bgCard, borderColor: c.borderCard, opacity: dimmed ? 0.55 : 1 }]}>
        <Text style={[styles.cardTitle, { color: c.text }]} numberOfLines={2}>{contract.tarifName}</Text>
        <View style={[styles.statusPill, { backgroundColor: color + '22', borderColor: color + '55', alignSelf: 'flex-start', marginTop: 6 }]}>
          <Text style={[styles.statusPillText, { color }]} numberOfLines={1}>{contract.status.emoji} {contract.status.label}</Text>
        </View>
        {contract.details.length > 0 && (
          <Text style={[styles.cardDetails, { color: c.textSub }]}>{contract.details.join('  ·  ')}</Text>
        )}
        {isDevMode && contract.devInfo && <Text style={[styles.devInlineText, { color: c.textSub }]}>{contract.devInfo}</Text>}
      </View>
    );
  }

  // Ligne compacte pour une validation/un incident : une seule rangée
  // (icône, station + libellé, date/heure) plutôt que les 3 lignes "↳ ..."
  // façon log de l'ancien affichage. Un incident se distingue par la
  // bordure gauche colorée plutôt qu'un habillage entièrement différent.
  function EventRowView({ event }: { event: EventRow }) {
    const isIncident = event.kind === 'incident';
    const color = isIncident ? '#E5493E' : '#27A65C';
    return (
      <View style={[
        styles.eventRow,
        { backgroundColor: c.bgCard, borderColor: c.borderCard },
        isIncident && { borderLeftColor: color, borderLeftWidth: 3 },
      ]}>
        <View style={[styles.eventDot, { backgroundColor: color + '22' }]}>
          <Icon name={isIncident ? 'info-trafic' : 'valider'} size={14} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.eventTopRow}>
            <Text style={[styles.eventStation, { color: c.text, flex: 1 }]}>{event.station || event.label}</Text>
            <View style={styles.eventTimeCol}>
              <Text style={[styles.eventDate, { color: c.textSub }]}>{event.dateText}</Text>
              <Text style={[styles.eventTime, { color: c.textSub }]}>{event.timeText}</Text>
            </View>
          </View>
          {/* Pas de `numberOfLines` ici : contrairement à la station et à la
              date/heure, le libellé (ex: "Validation de correspondance en
              sortie") n'a plus la colonne date/heure comme voisine sur sa
              propre ligne — il a toute la largeur pour s'afficher en entier. */}
          {event.station ? <Text style={[styles.eventLabel, { color: c.textSub }]}>{event.label}</Text> : null}
          {isIncident && event.reason && <Text style={[styles.eventReason, { color }]}>{event.reason}</Text>}
          {isDevMode && event.devInfo && <Text style={[styles.devInlineText, { color: c.textSub }]}>{event.devInfo}</Text>}
        </View>
      </View>
    );
  }

  function renderScanResult(result: ScanResult) {
    return (
      <View style={{ flex: 1 }}>
        <ScrollView style={styles.dataBox} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: FONDU_HAUT, paddingBottom: 28, paddingHorizontal: 8 }}>
          {result.identity && (
            <>
              <SectionTitle label={result.identity.title} />
              <IdentityCardView identity={result.identity} />
            </>
          )}

          <SectionTitle label="Contrats" count={result.contracts.length} />
          {result.contracts.length === 0 ? (
            <Text style={[styles.emptySectionText, { color: c.textSub }]}>Aucun contrat décodable.</Text>
          ) : (
            result.contracts.map(contract => <ContractCardView key={contract.id} contract={contract} />)
          )}

          <SectionTitle label="Historique" count={result.events.length} />
          {result.events.length === 0 ? (
            <Text style={[styles.emptySectionText, { color: c.textSub }]}>Aucune validation ni incident enregistré.</Text>
          ) : (
            result.events.map(event => <EventRowView key={event.id} event={event} />)
          )}

          {isDevMode && rawLogs.length > 0 && (
            <View style={[styles.rawLogContainer, { backgroundColor: c.bgSubtle }]}>
              <View style={styles.rawLogHeaderRow}>
                <Text style={[styles.headerText, { color: c.accent }]}>[DONNÉES BRUTES (HEX)]</Text>
                <TouchableOpacity
                  style={[styles.copyButton, { backgroundColor: c.accent }]}
                  onPress={async () => {
                    await Clipboard.setStringAsync(rawLogs.join('\n'));
                    if (Platform.OS === 'android') ToastAndroid.show('Dump copié !', ToastAndroid.SHORT);
                  }}
                >
                  <Text style={styles.copyButtonText}>📋 Copier</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.rawLogText, { color: c.accent }]} selectable={true}>{rawLogs.join('\n')}</Text>
            </View>
          )}
        </ScrollView>
        <FadeTop color={c.bg} />
        <FadeBottom color={c.bg} />
      </View>
    );
  }

  const nfcWarning = nfcStatus === 'unsupported'
    ? "📵 Cet appareil n'a pas de puce NFC."
    : nfcStatus === 'disabled'
    ? '📵 NFC désactivé — active-le dans les paramètres du téléphone.'
    : null;

  return (
    <PanelLayout
      icon={<IconScannerNavigoCouleur size={26} dotColor={c.text} />}
      title="Scanner Navigo"
      titleBadge={
        <View style={[styles.betaBadge, { backgroundColor: c.accent }]}>
          <Text style={styles.betaBadgeText}>BÊTA</Text>
        </View>
      }
      subtitle="Lecture NFC des passes Navigo"
      headerRight={appDevMode ? (
        <TouchableOpacity
          onPress={() => setDumpModeOn(v => !v)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[styles.devSwitch, { backgroundColor: dumpModeOn ? c.accent : c.dragBar }]}
        >
          <View style={[styles.devSwitchThumb, { alignSelf: dumpModeOn ? 'flex-end' : 'flex-start' }]} />
        </TouchableOpacity>
      ) : null}
      footer={
        <>
          {nfcWarning && <Text style={styles.nfcWarning}>{nfcWarning}</Text>}
          <TouchableOpacity
            style={[styles.button, { backgroundColor: scanKind === 'scan' ? c.bgSubtle : c.accent, opacity: scanKind === 'dump' ? 0.5 : 1 }]}
            onPress={scanKind === 'scan' ? () => cancelScan('user') : scanKind === 'dump' ? undefined : scanPass}
            disabled={scanKind === 'dump'}
          >
            {scanKind === 'scan' ? (
              <View style={styles.buttonContentRow}>
                <Icon name="quitter" size={13} color={c.textSub} />
                <Text style={[styles.buttonText, { color: c.textSub }]}>ANNULER LE SCAN</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>SCANNER LE PASSE</Text>
            )}
          </TouchableOpacity>
          {isDevMode && (
            <TouchableOpacity
              style={[styles.dumpButton, { opacity: scanKind === 'scan' ? 0.5 : 1 }]}
              onPress={scanKind === 'dump' ? () => cancelScan('user') : scanKind === 'scan' ? undefined : dumpPass}
              disabled={scanKind === 'scan'}
            >
              <Text style={styles.dumpButtonText}>{scanKind === 'dump' ? '✋ ANNULER LE DUMP' : '🔴 DUMP INTÉGRAL DE LA PUCE'}</Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.creditText, { color: c.textSub }]}>Basé sur les travaux originaux de NavigoReader.</Text>
        </>
      }
    >
      {isScanning
        ? renderScanVisual({
            icon: <IconScannerNavigoCouleur size={44} dotColor={c.text} />,
            title: tagDetected
              ? (scanKind === 'dump' ? 'Dump en cours…' : 'Lecture en cours…')
              : 'En attente du passe…',
            description: tagDetected
              ? 'Passe détecté — garde-le bien immobile contre le dos du téléphone jusqu\'à la fin de la lecture.'
              : 'Approche ton passe Navigo du dos du téléphone, ou annule ci-dessous.',
            pulse: !tagDetected,
          })
        : scanError
        ? renderScanVisual({
            icon: <Icon name="scanner-navigo" size={44} color="#E5493E" />,
            title: 'Échec du scan',
            description: scanError,
          })
        : scanResult
        ? renderScanResult(scanResult)
        : dataList.length === 0
        ? renderScanVisual({
            icon: <Icon name="scanner-navigo" size={44} color={c.textSub} />,
            title: "Aucun scan pour l'instant",
            description: 'Pose ton passe Navigo au dos du téléphone, puis appuie sur « Scanner le passe ».',
          })
        : (
        <View style={{ flex: 1 }}>
          <ScrollView style={styles.dataBox} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: FONDU_HAUT, paddingBottom: 28, paddingHorizontal: 8 }}>
            {dataList.map((item) => (
              <View key={item.id}>
                <Text style={[
                  item.type === 'header' ? styles.headerText : item.type === 'subitem' ? styles.subText : styles.dataText,
                  { color: item.type === 'header' ? c.accent : item.type === 'subitem' ? c.textSub : c.text },
                ]}>
                  {item.text}
                </Text>
                {isDevMode && item.devInfo && <Text style={[styles.devInlineText, { color: c.textSub }]}>{item.devInfo}</Text>}
              </View>
            ))}

            {isDevMode && rawLogs.length > 0 && (
              <View style={[styles.rawLogContainer, { backgroundColor: c.bgSubtle }]}>
                <View style={styles.rawLogHeaderRow}>
                  <Text style={[styles.headerText, { color: c.accent }]}>[DONNÉES BRUTES (HEX)]</Text>
                  <TouchableOpacity
                    style={[styles.copyButton, { backgroundColor: c.accent }]}
                    onPress={async () => {
                      await Clipboard.setStringAsync(rawLogs.join('\n'));
                      if (Platform.OS === 'android') ToastAndroid.show('Dump copié !', ToastAndroid.SHORT);
                    }}
                  >
                    <Text style={styles.copyButtonText}>📋 Copier</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.rawLogText, { color: c.accent }]} selectable={true}>{rawLogs.join('\n')}</Text>
              </View>
              )}
          </ScrollView>
          <FadeTop color={c.bg} />
          <FadeBottom color={c.bg} />
        </View>
      )}
    </PanelLayout>
  );
}

// Palette du thème appliquée en inline (voir plus haut) — cette feuille ne
// porte que la mise en page (tailles, espacements, police), pas de couleurs
// en dur, pour suivre le même thème clair/sombre que le reste de l'app.
const styles = StyleSheet.create({
  devSwitch: { width: 44, height: 26, borderRadius: 13, justifyContent: 'center', paddingHorizontal: 3 },
  devSwitchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  betaBadge: { borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1.5 },
  betaBadgeText: { color: '#fff', fontSize: 9, fontFamily: 'GrandParis-Bold', letterSpacing: 0.2 },
  // Couleur d'alerte fixe (palette du logo, rouge) : pas d'équivalent
  // "danger" dans le thème clair/sombre actuellement.
  nfcWarning: { color: '#E5493E', fontSize: 13, marginBottom: 8, textAlign: 'center', fontFamily: 'GrandParis-Medium' },
  button: { paddingVertical: 15, paddingHorizontal: 40, borderRadius: 30, marginBottom: 10, width: '100%', alignItems: 'center' },
  buttonText: { color: '#fff', fontFamily: 'GrandParis-Bold', fontSize: 16 },
  buttonContentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dumpButton: { backgroundColor: '#2C1010', paddingVertical: 12, paddingHorizontal: 40, borderRadius: 30, marginBottom: 20, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: '#E5493E' },
  dumpButtonText: { color: '#FF9999', fontFamily: 'GrandParis-Bold', fontSize: 14 },
  // Marge négative + padding identique dans la liste : les ombres des cartes, collées aux bords, ne sont pas coupées.
  dataBox: { flex: 1, alignSelf: 'stretch', marginHorizontal: -8 },
  headerText: { fontFamily: 'GrandParis-Bold', fontSize: 16, marginTop: 15, marginBottom: 5 },
  dataText: { fontSize: 14, marginBottom: 4, paddingLeft: 10, fontFamily: 'GrandParis' },
  subText: { fontSize: 13, marginBottom: 8, paddingLeft: 25, fontFamily: 'GrandParis-Light' },
  devInlineText: { fontFamily: 'monospace', fontSize: 11, paddingLeft: 25, marginBottom: 8 },
  rawLogContainer: { marginTop: 30, padding: 10, borderRadius: 8, marginBottom: 40 },
  rawLogHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  copyButton: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 6 },
  copyButtonText: { color: '#fff', fontFamily: 'GrandParis-Bold', fontSize: 12 },
  rawLogText: { fontFamily: 'monospace', fontSize: 10, lineHeight: 18 },
  creditText: { fontSize: 11, marginTop: 8, textAlign: 'center', fontFamily: 'GrandParis-Light' },
  // `paddingTop` fixe plutôt que `justifyContent: 'center'` : un message
  // d'erreur plus long ou plus court en dessous ne doit pas déplacer
  // l'icône, sinon elle "saute" à chaque changement d'état (attente / échec
  // / vide) — voir renderScanVisual.
  scanningWrap: { flex: 1, alignItems: 'center', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 40 },
  scanningIconWrap: { width: 88, height: 88, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  pulseRing: { position: 'absolute', width: 44, height: 44, borderRadius: 22, borderWidth: 2 },
  scanningText: { fontSize: 17, fontFamily: 'GrandParis-Bold', marginBottom: 8, textAlign: 'center' },
  scanningSubText: { fontSize: 14, fontFamily: 'GrandParis-Light', textAlign: 'center', lineHeight: 22 },

  // --- Résultats de scan (cartes) ---
  // Titres de section au style des Paramètres : petites capitales espacées.
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 8, marginLeft: 6, gap: 8 },
  sectionTitleText: { fontSize: 12, fontFamily: 'GrandParis-Bold', letterSpacing: 0.8 },
  sectionTitleCount: { fontSize: 12, fontFamily: 'GrandParis-Light' },
  emptySectionText: { fontSize: 13, fontFamily: 'GrandParis-Light', marginBottom: 4 },
  // Cartes au gabarit des volets (rayon 20, ombre douce) — voir PanelLayout.
  card: { ...panelCardStyle, flexDirection: 'column', alignItems: 'stretch', padding: 14, marginBottom: 10 },
  cardTitle: { fontSize: 15, fontFamily: 'GrandParis-Bold' },
  cardDetails: { fontSize: 12.5, fontFamily: 'GrandParis-Light', marginTop: 5, lineHeight: 18 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  identityIcon: { fontSize: 22, lineHeight: 28 },
  statusPill: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontFamily: 'GrandParis-Bold' },
  eventRow: { ...panelCardStyle, alignItems: 'flex-start', borderRadius: 16, padding: 11, marginBottom: 8, gap: 10 },
  eventDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  eventTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  eventStation: { fontSize: 13.5, fontFamily: 'GrandParis-Bold' },
  eventLabel: { fontSize: 12, fontFamily: 'GrandParis-Light', marginTop: 1 },
  eventReason: { fontSize: 11.5, fontFamily: 'GrandParis-Medium', marginTop: 3 },
  eventTimeCol: { alignItems: 'flex-end', width: 72 },
  eventDate: { fontSize: 11, fontFamily: 'GrandParis-Medium' },
  eventTime: { fontSize: 11, fontFamily: 'GrandParis-Light' },
});
