export enum EventResultCode {
  None = 0x00,
  DoubleValidationEntree = 0x30,
  ZoneInvalide = 0x31,
  AbonnementPérimé = 0x35,
  DoubleValidationSortie = 0x45,
}

export default class EventResult {
  public getEventResult(codeResult: number): string {
    switch (codeResult) {
      case EventResultCode.None:
        return "-";
      case EventResultCode.DoubleValidationEntree:
        return "Double validation en entrée";
      case EventResultCode.ZoneInvalide:
        return "Zone invalide";
      case EventResultCode.AbonnementPérimé:
        return "Abonnement périmé";
      case EventResultCode.DoubleValidationSortie:
        return "Double validation en sortie";
      default:
        console.warn("Code événement retour inconnu " + codeResult);
        return "Retour inconnu (" + codeResult + ")";
    }
  }
}
