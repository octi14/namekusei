export const MAPS = {
  namek: {
    id: "namek",
    zLabel: "GUERREROS Z",
    fLabel: "FREEZER",
    zShort: "Z",
    fShort: "FREEZER",
    zWin: "Guerreros Z",
    fWin: "Freezer",
  },
  earth: {
    id: "earth",
    zLabel: "GUERREROS Z",
    fLabel: "SAIYAJIN",
    zShort: "Z",
    fShort: "SAIYAJIN",
    zWin: "Guerreros Z",
    fWin: "Saiyajin",
  },
  cell: {
    id: "cell",
    zLabel: "GUERREROS Z",
    fLabel: "CELL",
    zShort: "Z",
    fShort: "CELL",
    zWin: "Guerreros Z",
    fWin: "Cell",
  },
};

export let current = MAPS.namek;

export function setScenario(id) {
  current = MAPS[id] || MAPS.namek;
  return current;
}
