export enum CodePays {
  France = 250,
}

export default class Pays {
  public getPays(codePays: number): string {
    switch (codePays) {
      case CodePays.France:
        return "France";
      default:
        console.warn("Pays inconnu : " + codePays);
        return "Pays Inconnu (" + codePays + ")";
    }
  }
}
