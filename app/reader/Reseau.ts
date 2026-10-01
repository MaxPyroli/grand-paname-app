import { CodePays } from "./Pays";

export default class Region {
  public getReseau(codePays: number, codeReseau: number): string {
    switch (codePays) {
      case CodePays.France:
        switch (codeReseau) {
          case 72:
            return "Orléans Métropole";
          case 901:
            return "Île-de-France";
          case 908:
            return "Bretagne";
          case 912:
            return "Normandie";
          case 915:
            return "Grand Est";
          case 921:
            return "Nouvelle-Aquitaine";
          default:
            console.warn("Réseau inconnue pour France : " + codeReseau);
            return "Réseau Inconnu (" + codeReseau + ")";
        }
      default:
        return "Réseau Inconnu (" + codeReseau + ")";
    }
  }
}
