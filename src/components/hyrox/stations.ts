export interface HyroxStation {
  number: string;
  key: string;
}

export const HYROX_STATIONS: readonly HyroxStation[] = Array.from(
  { length: 8 },
  (_, i) => {
    const number = String(i + 1).padStart(2, "0");
    return { number, key: `station${number}` };
  },
);
