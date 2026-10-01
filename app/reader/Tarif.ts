export enum CodeTarif {
  Navigo = 1,
  NavigoAnnuel = 2,
  ImaginR = 4,
  ImaginRBis = 5,
  LibertePlus = 4096,
  TicketTPlus = 20480,
  TicketMetroTrainRER = 20488, 
  TicketBusTram = 24912,
  TicketTPlusDemiTarif = 20496,
  TicketMetroTrainRERDemi = 20504,
  TicketBusTramDemi = 0,
  TicketAeroports = 4144,
  SolidariteTransport = 32771,
}

export default class Tarif {
  public getTarif(codeTarif: number): string {
    switch (codeTarif) {
      case CodeTarif.Navigo:
        return "Navigo Jour/Semaine/Mois";
      case CodeTarif.NavigoAnnuel:
        return "Navigo Annuel";
      case CodeTarif.ImaginR:
      case CodeTarif.ImaginRBis:
        return "Imagin'R";
      case CodeTarif.LibertePlus:
        return "Navigo Liberté +";
      case CodeTarif.TicketTPlus:
        return "Ticket t+";
      case CodeTarif.TicketMetroTrainRER:
        return "Ticket Métro-Train-RER";
      case CodeTarif.TicketBusTram:
        return "Ticket Bus-Tram";
      case CodeTarif.TicketTPlusDemiTarif:
        return "Ticket t+ (Demi-tarif)";
      case CodeTarif.TicketMetroTrainRERDemi:
        return "Ticket Métro-Train-RER (Demi-tarif)"; // <-- La traduction ici !
      case CodeTarif.TicketBusTramDemi:
        return "Ticket Bus-Tram (Demi-tarif)";
      case CodeTarif.SolidariteTransport:
        return "Solidarité Transport";
      case CodeTarif.TicketAeroports:
        return "Ticket Paris Région <> Aéroports";
      default:
        console.warn("Code tarif inconnu : " + codeTarif);
        return "Tarif inconnu (" + codeTarif + ")";
    }
  }
}