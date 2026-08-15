/**
 * Tvary, ktoré si obrazovka návykov podáva medzi serverom a klientom.
 *
 * Oblasť sa sem posiela orezaná na tri polia, nie ako celý riadok `areas`.
 * Karta z nej potrebuje len meno a farbu; počty úloh a projektov, ktoré nesie
 * `AreaWithCounts`, by putovali cez sieť do každej karty len preto, aby ich
 * nikto nepoužil.
 */
export interface HabitAreaOption {
  id: string;
  name: string;
  color: string;
  /**
   * Archivovaná oblasť sa už neponúka pri zakladaní, ale musí sa dať prečítať:
   * návyk k nej mohol byť priradený predtým, než sa archivovala, a bez nej by
   * na karte zmizol názov oblasti bez vysvetlenia.
   */
  archived: boolean;
}
