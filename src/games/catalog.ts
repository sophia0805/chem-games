export type GameDefinition = {
  slug: string;
  title: string;
  description: string;
  route: string;
  tag?: string;
  meta?: string;
};

export const GAME_CATALOG: GameDefinition[] = [
  {
    slug: "lab-equipment",
    title: "Lab Equipment ID",
    description:
      "Identify common AP Chem lab tools through varied question styles — photo clues, purpose descriptions, and name-to-image matching.",
    route: "/discover/lab-equipment",
    tag: "New game",
    meta: "16 equipment cards in pool",
  },
];

export function getGameBySlug(slug: string): GameDefinition | undefined {
  return GAME_CATALOG.find((game) => game.slug === slug);
}

export function getGameByRoute(pathname: string): GameDefinition | undefined {
  return GAME_CATALOG.find((game) => game.route === pathname);
}
