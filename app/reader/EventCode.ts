export enum Mode {
  BusUrbain = 0x01,
  BusInterurbain = 0x02,
  Metro = 0x03,
  Tramway = 0x04,
  Train = 0x05,
  Parking = 0x08,
}

enum Action {
  ValidationEntree = 0x01,
  ValidationSortie = 0x02,
  ControleVolant = 0x04, //Valideur d'un bus par exemple
  ValidationTest = 0x05,
  ValidationCorrespondanceEntree = 0x06,
  ValidationCorrespondanceSortie = 0x07,
  AnnulationValidation = 0x09,
  Distribution = 0x0d,
  Invalidation = 0x0f,
}

export default class EventCode {
  public getEventCode(codeEvent: number): string {
    const modeCode = Math.floor(codeEvent / 16);
    const actionCode = codeEvent % 16;

    let evenement = "";

    switch (modeCode) {
      case Mode.BusUrbain:
        evenement += "Bus urbain";
        break;
      case Mode.BusInterurbain:
        evenement += "Bus interurbain";
        break;
      case Mode.Metro:
        evenement += "Métro";
        break;
      case Mode.Tramway:
        evenement += "Tramway";
        break;
      case Mode.Train:
        evenement += "Train";
        break;
      case Mode.Parking:
        evenement += "Parking";
        break;
      default:
        console.warn("Code événement mode inconnu " + modeCode);
        evenement += "Mode inconnu (" + modeCode + ")";
        break;
    }

    evenement += " - ";

    switch (actionCode) {
      case Action.ValidationEntree:
        evenement += "Validation en entrée";
        break;
      case Action.ValidationSortie:
        evenement += "Validation en sortie";
        break;
      case Action.ControleVolant:
        evenement += "Validation à bord";
        break;
      case Action.ValidationTest:
        evenement += "Validation de test";
        break;
      case Action.ValidationCorrespondanceEntree:
        evenement += "Validation de correspondance en entrée";
        break;
      case Action.ValidationCorrespondanceSortie:
        evenement += "Validation de correspondance en sortie";
        break;
      case Action.AnnulationValidation:
        evenement += "Validation annulée";
        break;
      case Action.Distribution:
        evenement += "Distribution";
        break;
      case Action.Invalidation:
        evenement += "Invalidation";
        break;
    }

    return evenement;
  }
}
