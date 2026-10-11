/** Los equipos se nombran solo por color. */
const TEAM_NAMES = { zLabel: "NARANJA", fLabel: "AZUL", zShort: "NARANJA", fShort: "AZUL", zWin: "Naranja", fWin: "Azul" };

export const MAPS = {
  namek: {
    id: "namek",
    ...TEAM_NAMES,
  },
  earth: {
    id: "earth",
    ...TEAM_NAMES,
  },
  cell: {
    id: "cell",
    ...TEAM_NAMES,
  },
  city: {
    id: "city",
    ...TEAM_NAMES,
  },
  vegeta: {
    id: "vegeta",
    ...TEAM_NAMES,
  },
};

export let current = MAPS.namek;

export function setScenario(id) {
  current = MAPS[id] || MAPS.namek;
  return current;
}
