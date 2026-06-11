export const SPACE_LIST_KEY = 'zfl-3-spaces';
export const CURRENT_SPACE_KEY = 'zfl-3-current-space';
export const SPACE_DATA_PREFIX = 'zfl-3-space-';

export const OLD_KEYS = [
  'zfl-3-members',
  'zfl-3-gears',
  'zfl-3-requests',
  'zfl-3-maintenance',
  'zfl-3-trips',
  'zfl-3-handovers',
  'zfl-3-deposits'
];

export function safeParseJSON(str, fallback) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

export function getSpaceList() {
  return safeParseJSON(localStorage.getItem(SPACE_LIST_KEY), []);
}

export function setSpaceList(spaces) {
  localStorage.setItem(SPACE_LIST_KEY, JSON.stringify(spaces));
}

export function getCurrentSpaceId() {
  return localStorage.getItem(CURRENT_SPACE_KEY);
}

export function setCurrentSpaceId(spaceId) {
  localStorage.setItem(CURRENT_SPACE_KEY, spaceId);
}

export function getSpaceDataKey(spaceId) {
  return SPACE_DATA_PREFIX + spaceId;
}

export function getSpaceData(spaceId) {
  const raw = localStorage.getItem(getSpaceDataKey(spaceId));
  if (!raw) return null;
  return safeParseJSON(raw, null);
}

export function setSpaceData(spaceId, data) {
  localStorage.setItem(getSpaceDataKey(spaceId), JSON.stringify(data));
}

export function removeSpaceData(spaceId) {
  localStorage.removeItem(getSpaceDataKey(spaceId));
}

export function hasOldData() {
  return OLD_KEYS.some((key) => localStorage.getItem(key) !== null);
}

export function buildExportData(spaceData, spaceInfo) {
  return {
    _exportVersion: 1,
    _exportedAt: new Date().toISOString(),
    _spaceInfo: spaceInfo || null,
    members: spaceData.members || [],
    gears: spaceData.gears || [],
    requests: spaceData.requests || [],
    maintenanceRecords: spaceData.maintenanceRecords || [],
    trips: spaceData.trips || [],
    handoverRecords: spaceData.handoverRecords || [],
    depositRecords: spaceData.depositRecords || []
  };
}

export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}
