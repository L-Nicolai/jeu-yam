export const COLUMNS = Object.freeze([
  { key: 'descending', label: 'Descendante', shortLabel: 'Desc.' },
  { key: 'free', label: 'Libre', shortLabel: 'Libre' },
  { key: 'ascending', label: 'Montante', shortLabel: 'Mont.' },
  { key: 'tam', label: 'Tam', shortLabel: 'Tam' },
  { key: 'dry', label: 'Sèche', shortLabel: 'Sèche' },
]);

export const CATEGORIES = Object.freeze([
  { key: 'one', label: '1', face: 1 },
  { key: 'two', label: '2', face: 2 },
  { key: 'three', label: '3', face: 3 },
  { key: 'four', label: '4', face: 4 },
  { key: 'five', label: '5', face: 5 },
  { key: 'six', label: '6', face: 6 },
  { key: 'straight', label: 'Quinte' },
  { key: 'full', label: 'Full' },
  { key: 'fourKind', label: 'Carré' },
  { key: 'plus', label: '+' },
  { key: 'middle', label: 'Moyen' },
  { key: 'minus', label: '−' },
  { key: 'yam', label: 'Yam' },
]);

export const CATEGORY_KEYS = Object.freeze(CATEGORIES.map(({ key }) => key));
export const UPPER_KEYS = Object.freeze(CATEGORY_KEYS.slice(0, 6));
export const TRIO_KEYS = Object.freeze(['plus', 'middle', 'minus']);

export const COLUMN_KEYS = Object.freeze(COLUMNS.map(({ key }) => key));

export function createEmptyColumn() {
  return Object.fromEntries(CATEGORY_KEYS.map((key) => [key, null]));
}

export function createEmptySheet() {
  return Object.fromEntries(COLUMN_KEYS.map((key) => [key, createEmptyColumn()]));
}

export function categoryLabel(category) {
  return CATEGORIES.find(({ key }) => key === category)?.label ?? category;
}

