import { ref, computed } from 'vue';
import {
  normalizeMembers,
  normalizeGears,
  normalizeRequests,
  normalizeMaintenanceRecords,
  normalizeTrips,
  normalizeHandoverRecords,
  normalizeDepositRecords,
  normalizeInventoryLists,
  normalizeSettlementRecords,
  normalizeEventLogs,
  DATA_ENTITIES,
  performMerge,
  analyzeMergeData
} from '../utils/dataTransform.js';
import { normalizeReservations } from '../utils/reservationTransform.js';

export const SPACE_LIST_KEY = 'zfl-3-spaces';
export const CURRENT_SPACE_KEY = 'zfl-3-current-space';
export const SPACE_DATA_PREFIX = 'zfl-3-space-';
export const TEMPLATE_LIST_KEY = 'zfl-3-templates';
export const TEMPLATE_DATA_PREFIX = 'zfl-3-template-';

export const TEMPLATE_ENTITY_LABELS = {
  members: '成员',
  gears: '装备',
  maintenanceRecords: '保养记录',
  trips: '示例出行',
  depositRecords: '押金规则',
  handoverRecords: '交接记录',
  requests: '借用申请',
  inventoryLists: '盘点记录',
  settlementRecords: '结算记录',
  reservations: '候补预约',
  eventLogs: '操作日志'
};

export const TEMPLATE_CONFIG_ENTITY_LABELS = {
  members: '成员',
  gears: '装备',
  maintenanceRecords: '保养记录',
  depositRecords: '押金规则'
};

export const TEMPLATE_BUSINESS_ENTITY_LABELS = {
  trips: '示例出行',
  requests: '借用申请',
  handoverRecords: '交接记录',
  inventoryLists: '盘点记录',
  settlementRecords: '结算记录',
  reservations: '候补预约',
  eventLogs: '操作日志'
};

export const OLD_KEYS = [
  'zfl-3-members',
  'zfl-3-gears',
  'zfl-3-requests',
  'zfl-3-maintenance',
  'zfl-3-trips',
  'zfl-3-handovers',
  'zfl-3-deposits'
];

const _today = new Date();
export function iso(offset = 0) {
  const date = new Date(_today);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function safeParseJSON(str, fallback) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

export function createDefaultMembers() {
  return [
    { id: crypto.randomUUID(), nickname: '阿岚', phone: '', area: '', notes: '' },
    { id: crypto.randomUUID(), nickname: '梁序', phone: '', area: '', notes: '' },
    { id: crypto.randomUUID(), nickname: '小北', phone: '', area: '', notes: '' },
    { id: crypto.randomUUID(), nickname: '陈默', phone: '', area: '', notes: '' }
  ];
}

export function createDefaultGears(ownerName = '阿岚', stoveOwner = '梁序', lampOwner = '小北') {
  return [
    { id: crypto.randomUUID(), name: '双人轻量帐', category: '帐篷天幕', owner: ownerName, available: iso(1), deposit: '200', status: '可借', notes: '含地钉和防潮垫', damage: '', maintenanceCycleDays: 30, nextMaintenanceDate: iso(30), maintenanceReminderLevel: '标准' },
    { id: crypto.randomUUID(), name: '炉头套装', category: '炊具', owner: stoveOwner, available: iso(0), deposit: '80', status: '借出中', notes: '需自备气罐', damage: '', maintenanceCycleDays: 15, nextMaintenanceDate: iso(15), maintenanceReminderLevel: '严格' },
    { id: crypto.randomUUID(), name: '营地灯三件组', category: '照明', owner: lampOwner, available: iso(3), deposit: '50', status: '可借', notes: '满电交接', damage: '', maintenanceCycleDays: 60, nextMaintenanceDate: iso(60), maintenanceReminderLevel: '宽松' }
  ];
}

export function createDefaultRequests(gearList) {
  if (gearList.length < 3) return [];
  return [
    { id: crypto.randomUUID(), gearId: gearList[1].id, gearName: '炉头套装', owner: gearList[1].owner, borrower: '阿岚', start: iso(-1), end: iso(2), status: '已同意', reason: '周末湖边露营', damage: '' },
    { id: crypto.randomUUID(), gearId: gearList[2].id, gearName: '营地灯三件组', owner: gearList[2].owner, borrower: '陈默', start: iso(3), end: iso(5), status: '待处理', reason: '夜钓备用', damage: '' }
  ];
}

export function createDefaultMaintenanceRecords(gearList) {
  const findGear = (name, owner) => gearList.find((gear) => gear.name === name && gear.owner === owner);
  const tent = findGear('双人轻量帐', '阿岚');
  const stove = findGear('炉头套装', '梁序');
  return [
    tent && { id: crypto.randomUUID(), gearId: tent.id, gearName: tent.name, owner: tent.owner, date: iso(-7), type: '清洁', description: '内外帐全面擦拭，通风晾干', handler: '阿岚' },
    tent && { id: crypto.randomUUID(), gearId: tent.id, gearName: tent.name, owner: tent.owner, date: iso(-20), type: '检查', description: '检查地钉和防风绳，状态良好', handler: '阿岚' },
    stove && { id: crypto.randomUUID(), gearId: stove.id, gearName: stove.name, owner: stove.owner, date: iso(-3), type: '补件', description: '更换了新的密封圈和点火电极', handler: '梁序' }
  ].filter(Boolean);
}

export function createDefaultTrips(gearList, memberList) {
  const memberNames = memberList.map((m) => m.nickname);
  const availableGears = gearList.filter((g) => g.status === '可借');
  if (availableGears.length === 0) return [];
  const sampleGears = availableGears.slice(0, 2).map((g) => ({
    gearId: g.id,
    gearName: g.name,
    owner: g.owner,
    deposit: g.deposit,
    status: '待借'
  }));
  return [
    {
      id: crypto.randomUUID(),
      destination: '天目湖营地',
      startDate: iso(14),
      members: memberNames.slice(0, 3),
      gears: sampleGears,
      notes: '周末湖边露营，记得带驱蚊液'
    }
  ];
}

export function createEmptySpaceData() {
  const members = createDefaultMembers();
  const gears = createDefaultGears();
  return {
    members,
    gears,
    requests: createDefaultRequests(gears),
    maintenanceRecords: createDefaultMaintenanceRecords(gears),
    trips: createDefaultTrips(gears, members),
    handoverRecords: [],
    depositRecords: [],
    inventoryLists: [],
    settlementRecords: [],
    reservations: [],
    eventLogs: []
  };
}

export function getTemplateList() {
  return safeParseJSON(localStorage.getItem(TEMPLATE_LIST_KEY), []);
}

export function setTemplateList(templates) {
  localStorage.setItem(TEMPLATE_LIST_KEY, JSON.stringify(templates));
}

export function getTemplateDataKey(templateId) {
  return TEMPLATE_DATA_PREFIX + templateId;
}

export function getTemplateDataRaw(templateId) {
  const raw = localStorage.getItem(getTemplateDataKey(templateId));
  if (!raw) return null;
  return safeParseJSON(raw, null);
}

export function setTemplateDataRaw(templateId, data) {
  localStorage.setItem(getTemplateDataKey(templateId), JSON.stringify(data));
}

export function removeTemplateData(templateId) {
  localStorage.removeItem(getTemplateDataKey(templateId));
}

export function saveAsTemplate(sourceData, sourceSpaceInfo, templateName, selectedEntities) {
  if (!sourceData || typeof sourceData !== 'object') return null;
  const templateId = crypto.randomUUID();
  const templateInfo = {
    id: templateId,
    name: templateName.trim() || '未命名模板',
    sourceSpaceName: sourceSpaceInfo?.name || '',
    createdAt: new Date().toISOString().slice(0, 10),
    entitySummary: {}
  };
  const templateData = {};
  const entityKeys = selectedEntities || Object.keys(TEMPLATE_ENTITY_LABELS);
  entityKeys.forEach((key) => {
    if (sourceData[key] && Array.isArray(sourceData[key])) {
      templateData[key] = JSON.parse(JSON.stringify(sourceData[key]));
      templateInfo.entitySummary[key] = sourceData[key].length;
    }
  });
  templateData._isTemplate = true;
  templateData._templateId = templateId;
  templateData._templateName = templateInfo.name;
  templateData._createdAt = new Date().toISOString();
  const templates = getTemplateList();
  templates.push(templateInfo);
  setTemplateList(templates);
  setTemplateDataRaw(templateId, templateData);
  return templateInfo;
}

export function deleteTemplateById(templateId) {
  const templates = getTemplateList();
  const filtered = templates.filter((t) => t.id !== templateId);
  setTemplateList(filtered);
  removeTemplateData(templateId);
  return true;
}

export function cloneSpaceFromTemplate(templateId, options = {}) {
  const templateData = getTemplateDataRaw(templateId);
  if (!templateData || typeof templateData !== 'object') return null;

  const {
    copyMembers = true,
    copyGears = true,
    copyMaintenanceRecords = true,
    copyDepositRules = true,
    copyExampleTrips = false,
    clearBusinessFlow = true
  } = options;

  const idMap = {
    members: Object.create(null),
    gears: Object.create(null),
    requests: Object.create(null),
    maintenanceRecords: Object.create(null),
    trips: Object.create(null),
    handoverRecords: Object.create(null),
    depositRecords: Object.create(null),
    inventoryLists: Object.create(null),
    settlementRecords: Object.create(null),
    reservations: Object.create(null)
  };

  const result = {
    members: [],
    gears: [],
    requests: [],
    maintenanceRecords: [],
    trips: [],
    handoverRecords: [],
    depositRecords: [],
    inventoryLists: [],
    settlementRecords: [],
    reservations: [],
    eventLogs: []
  };

  if (copyMembers && templateData.members) {
    result.members = templateData.members.map((m) => {
      const newId = crypto.randomUUID();
      idMap.members[m.id] = newId;
      return { ...m, id: newId };
    });
  }

  if (copyGears && templateData.gears) {
    result.gears = templateData.gears.map((g) => {
      const newId = crypto.randomUUID();
      idMap.gears[g.id] = newId;
      return {
        ...g,
        id: newId,
        status: '可借',
        damage: '',
        available: iso(0)
      };
    });
  }

  if (copyMaintenanceRecords && templateData.maintenanceRecords && result.gears.length > 0) {
    result.maintenanceRecords = templateData.maintenanceRecords
      .filter((r) => idMap.gears[r.gearId])
      .map((r) => {
        const newId = crypto.randomUUID();
        idMap.maintenanceRecords[r.id] = newId;
        return {
          ...r,
          id: newId,
          gearId: idMap.gears[r.gearId] || r.gearId
        };
      });
  }

  if (copyDepositRules && templateData.depositRecords && result.gears.length > 0) {
    result.depositRecords = templateData.depositRecords
      .filter((d) => idMap.gears[d.gearId])
      .map((d) => {
        const newId = crypto.randomUUID();
        idMap.depositRecords[d.id] = newId;
        return {
          ...d,
          id: newId,
          gearId: idMap.gears[d.gearId] || d.gearId,
          requestId: '',
          receivedAmount: '0',
          deductedAmount: '0',
          refundedAmount: '0',
          deductReason: '',
          status: '待收取',
          updatedAt: new Date().toISOString().slice(0, 10)
        };
      });
  }

  if (!clearBusinessFlow) {
    if (templateData.trips && result.gears.length > 0 && result.members.length > 0) {
      const memberNames = new Set(result.members.map((m) => m.nickname));
      result.trips = templateData.trips
        .filter((t) => {
          if (!copyExampleTrips) return false;
          return true;
        })
        .map((t) => {
          const newId = crypto.randomUUID();
          idMap.trips[t.id] = newId;
          return {
            ...t,
            id: newId,
            members: (t.members || []).filter((m) => memberNames.has(m)),
            gears: (t.gears || [])
              .filter((g) => idMap.gears[g.gearId])
              .map((g) => ({
                ...g,
                gearId: idMap.gears[g.gearId] || g.gearId,
                status: '待借'
              }))
          };
        });
    }

    if (templateData.requests && result.gears.length > 0) {
      result.requests = templateData.requests
        .filter((r) => idMap.gears[r.gearId])
        .map((r) => {
          const newId = crypto.randomUUID();
          idMap.requests[r.id] = newId;
          return {
            ...r,
            id: newId,
            gearId: idMap.gears[r.gearId] || r.gearId,
            fromReservationId: r.fromReservationId ? (idMap.reservations[r.fromReservationId] || '') : ''
          };
        });
    }

    if (templateData.handoverRecords && result.gears.length > 0) {
      result.handoverRecords = templateData.handoverRecords
        .filter((h) => idMap.gears[h.gearId])
        .map((h) => {
          const newId = crypto.randomUUID();
          idMap.handoverRecords[h.id] = newId;
          return {
            ...h,
            id: newId,
            requestId: h.requestId ? (idMap.requests[h.requestId] || '') : '',
            gearId: idMap.gears[h.gearId] || h.gearId
          };
        });
    }

    if (templateData.inventoryLists && result.gears.length > 0) {
      result.inventoryLists = templateData.inventoryLists
        .filter((inv) => inv.items && inv.items.some((it) => idMap.gears[it.gearId]))
        .map((inv) => {
          const newId = crypto.randomUUID();
          idMap.inventoryLists[inv.id] = newId;
          return {
            ...inv,
            id: newId,
            tripId: inv.tripId ? (idMap.trips[inv.tripId] || '') : '',
            items: (inv.items || [])
              .filter((it) => idMap.gears[it.gearId])
              .map((it) => {
                const newItemId = crypto.randomUUID();
                return {
                  ...it,
                  id: newItemId,
                  gearId: idMap.gears[it.gearId] || it.gearId,
                  checkStatus: '待盘点',
                  missingAccessories: '',
                  notes: '',
                  hasAbnormal: false,
                  abnormalActions: (it.abnormalActions || []).map((a) => {
                    const newActionId = crypto.randomUUID();
                    return {
                      ...a,
                      id: newActionId,
                      relatedRecordId: a.relatedRecordId
                        ? (idMap.handoverRecords[a.relatedRecordId] || idMap.depositRecords[a.relatedRecordId] || '')
                        : ''
                    };
                  })
                };
              })
          };
        });
    }

    if (templateData.settlementRecords && result.members.length > 0) {
      result.settlementRecords = templateData.settlementRecords.map((s) => {
        const newId = crypto.randomUUID();
        idMap.settlementRecords[s.id] = newId;
        return {
          ...s,
          id: newId,
          tripId: s.tripId ? (idMap.trips[s.tripId] || '') : '',
          members: (s.members || []).map((sm) => ({
            ...sm,
            memberId: sm.memberId ? (idMap.members[sm.memberId] || '') : '',
            depositItems: (sm.depositItems || []).map((d) => ({
              ...d,
              depositId: d.depositId ? (idMap.depositRecords[d.depositId] || d.depositId) : '',
              inventoryId: d.inventoryId ? (idMap.inventoryLists[d.inventoryId] || '') : ''
            }))
          }))
        };
      });
    }

    if (templateData.reservations && result.gears.length > 0) {
      result.reservations = templateData.reservations
        .filter((r) => idMap.gears[r.gearId])
        .map((r) => {
          const newId = crypto.randomUUID();
          idMap.reservations[r.id] = newId;
          return {
            ...r,
            id: newId,
            gearId: idMap.gears[r.gearId] || r.gearId,
            requestId: r.requestId ? (idMap.requests[r.requestId] || '') : '',
            generatedRequestId: r.generatedRequestId ? (idMap.requests[r.generatedRequestId] || '') : ''
          };
        });

      if (result.requests.length > 0) {
        result.requests = result.requests.map((r) => ({
          ...r,
          fromReservationId: r.fromReservationId ? (idMap.reservations[r.fromReservationId] || '') : ''
        }));
      }
    }
  }

  return result;
}

export function isTemplateData(data) {
  return data && typeof data === 'object' && data._isTemplate === true;
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

export function getSpaceDataRaw(spaceId) {
  const raw = localStorage.getItem(getSpaceDataKey(spaceId));
  if (!raw) return null;
  return safeParseJSON(raw, null);
}

export function setSpaceDataRaw(spaceId, data) {
  localStorage.setItem(getSpaceDataKey(spaceId), JSON.stringify(data));
}

export function removeSpaceData(spaceId) {
  localStorage.removeItem(getSpaceDataKey(spaceId));
}

export function hasOldData() {
  return OLD_KEYS.some((key) => localStorage.getItem(key) !== null);
}

export function loadSpaceData(spaceId, onError = null) {
  try {
    const raw = localStorage.getItem(SPACE_DATA_PREFIX + spaceId);
    if (!raw) return createEmptySpaceData();
    const data = safeParseJSON(raw, null);
    if (!data || typeof data !== 'object') {
      if (onError) onError('空间数据格式损坏，已加载空白数据。可尝试重新创建空间。');
      return createEmptySpaceData();
    }
    const members = normalizeMembers(data.members || []).data;
    const gears = normalizeGears(data.gears || []).data;
    const requests = normalizeRequests(data.requests, gears).data;
    const maintenanceRecords = normalizeMaintenanceRecords(data.maintenanceRecords || [], gears).data;
    const trips = normalizeTrips(data.trips || [], gears, members).data;
    const handoverRecords = normalizeHandoverRecords(data.handoverRecords || [], gears, requests).data;
    const depositRecords = normalizeDepositRecords(data.depositRecords || [], gears, requests).data;
    const inventoryLists = normalizeInventoryLists(data.inventoryLists || [], gears, trips, members).data;
    const settlementRecords = normalizeSettlementRecords(data.settlementRecords || [], gears, members, depositRecords).data;
    const reservations = normalizeReservations(data.reservations || [], gears, members).data;
    const eventLogs = normalizeEventLogs(data.eventLogs || []).data;
    return { members, gears, requests, maintenanceRecords, trips, handoverRecords, depositRecords, inventoryLists, settlementRecords, reservations, eventLogs };
  } catch (e) {
    if (onError) onError(`加载空间数据时出错：${e.message}。已加载空白数据。`);
    return createEmptySpaceData();
  }
}

export function saveSpaceData(spaceId, data) {
  if (!spaceId || !data) return;
  localStorage.setItem(SPACE_DATA_PREFIX + spaceId, JSON.stringify(data));
}

export function buildExportData(spaceData, spaceInfo = null) {
  const result = {
    _exportVersion: 1,
    _exportedAt: new Date().toISOString(),
    _spaceInfo: spaceInfo
  };
  DATA_ENTITIES.forEach((key) => {
    if (spaceData[key] !== undefined && Array.isArray(spaceData[key])) {
      result[key] = spaceData[key];
    }
  });
  return result;
}

export function mergeImportData(targetData, importedData, mode = 'overwrite', mergeAnalysis = null) {
  if (mode === 'merge' && mergeAnalysis) {
    return performMerge(targetData, importedData, mergeAnalysis);
  }

  const result = { ...targetData };
  DATA_ENTITIES.forEach((key) => {
    if (importedData[key] !== undefined) {
      result[key] = [...importedData[key]];
    }
  });
  return result;
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

export function useSpaceStorage() {
  const spaces = ref([]);
  const currentSpaceId = ref(null);
  const spaceData = ref({});
  const dataErrorWarning = ref('');

  const currentSpace = computed(() =>
    spaces.value.find((s) => s.id === currentSpaceId.value)
  );

  const currentSpaceData = computed(() => {
    if (!currentSpaceId.value) return null;
    return spaceData.value[currentSpaceId.value] || null;
  });

  function loadAllSpaces() {
    spaces.value = getSpaceList();
    if (spaces.value.length === 0) {
      currentSpaceId.value = null;
      return;
    }

    let savedCurrent = getCurrentSpaceId();
    if (!savedCurrent || !spaces.value.some((s) => s.id === savedCurrent)) {
      savedCurrent = spaces.value[0].id;
      setCurrentSpaceId(savedCurrent);
    }

    currentSpaceId.value = savedCurrent;
    spaces.value.forEach((s) => ensureSpaceDataLoaded(s.id));
  }

  function ensureSpaceDataLoaded(spaceId) {
    if (!spaceData.value[spaceId]) {
      spaceData.value[spaceId] = loadSpaceData(spaceId, (msg) => {
        dataErrorWarning.value = msg;
      });
    }
    return spaceData.value[spaceId];
  }

  function saveSpace(spaceId) {
    if (!spaceId || !spaceData.value[spaceId]) return;
    saveSpaceData(spaceId, spaceData.value[spaceId]);
  }

  function createNewSpace(name, description = '') {
    const newSpace = {
      id: crypto.randomUUID(),
      name: name.trim() || '新社群空间',
      description: description.trim(),
      createdAt: new Date().toISOString().slice(0, 10)
    };
    spaces.value = [...spaces.value, newSpace];
    setSpaceList(spaces.value);
    spaceData.value[newSpace.id] = createEmptySpaceData();
    saveSpace(newSpace.id);
    return newSpace;
  }

  function createSpaceFromTemplate(name, description, templateId, cloneOptions) {
    const clonedData = cloneSpaceFromTemplate(templateId, cloneOptions);
    if (!clonedData) return null;
    const newSpace = {
      id: crypto.randomUUID(),
      name: name.trim() || '新社群空间',
      description: description.trim(),
      createdAt: new Date().toISOString().slice(0, 10),
      _clonedFromTemplate: templateId
    };
    spaces.value = [...spaces.value, newSpace];
    setSpaceList(spaces.value);
    spaceData.value[newSpace.id] = clonedData;
    saveSpace(newSpace.id);
    return newSpace;
  }

  function saveCurrentSpaceAsTemplate(templateName, selectedEntities) {
    if (!currentSpaceId.value || !spaceData.value[currentSpaceId.value]) return null;
    return saveAsTemplate(
      spaceData.value[currentSpaceId.value],
      currentSpace.value,
      templateName,
      selectedEntities
    );
  }

  function getAvailableTemplates() {
    return getTemplateList();
  }

  function deleteTemplate(templateId) {
    return deleteTemplateById(templateId);
  }

  function updateSpaceById(spaceId, name, description) {
    spaces.value = spaces.value.map((s) =>
      s.id === spaceId
        ? { ...s, name: name.trim() || s.name, description: description.trim() }
        : s
    );
    setSpaceList(spaces.value);
  }

  function deleteSpaceById(spaceId) {
    const space = spaces.value.find((s) => s.id === spaceId);
    if (!space) return false;
    if (spaces.value.length <= 1) return false;
    spaces.value = spaces.value.filter((s) => s.id !== spaceId);
    setSpaceList(spaces.value);
    removeSpaceData(spaceId);
    delete spaceData.value[spaceId];
    if (currentSpaceId.value === spaceId) {
      switchToSpace(spaces.value[0].id);
    }
    return true;
  }

  function switchToSpace(spaceId) {
    if (!spaceId || spaceId === currentSpaceId.value) return;
    currentSpaceId.value = spaceId;
    setCurrentSpaceId(spaceId);
    ensureSpaceDataLoaded(spaceId);
    dataErrorWarning.value = '';
  }

  function resetSpace(spaceId) {
    spaceData.value[spaceId] = createEmptySpaceData();
    saveSpace(spaceId);
  }

  function importIntoSpace(spaceId, importedData, mode = 'overwrite', mergeAnalysis = null) {
    if (!spaceId || !importedData || typeof importedData !== 'object') return { success: false, stats: null };
    const current = spaceData.value[spaceId];
    if (!current) return { success: false, stats: null };

    let stats = null;

    if (mode === 'merge' && mergeAnalysis) {
      const merged = performMerge(current, importedData, mergeAnalysis);
      DATA_ENTITIES.forEach((key) => {
        if (merged[key] !== undefined) {
          current[key] = merged[key];
        }
      });
      stats = mergeAnalysis.summary;
    } else {
      DATA_ENTITIES.forEach((key) => {
        if (importedData[key] !== undefined) {
          current[key] = [...importedData[key]];
        }
      });
      stats = null;
    }

    saveSpace(spaceId);
    return { success: true, stats };
  }

  function exportFromSpace(spaceId, selectedEntities = null) {
    const data = spaceData.value[spaceId];
    if (!data) return null;
    const exportData = {};
    const entities = selectedEntities || DATA_ENTITIES;
    entities.forEach((key) => {
      if (data[key] !== undefined) {
        exportData[key] = data[key];
      }
    });
    return buildExportData(exportData, currentSpace.value);
  }

  return {
    spaces,
    currentSpaceId,
    spaceData,
    dataErrorWarning,
    currentSpace,
    currentSpaceData,
    loadAllSpaces,
    ensureSpaceDataLoaded,
    saveSpace,
    createNewSpace,
    createSpaceFromTemplate,
    saveCurrentSpaceAsTemplate,
    getAvailableTemplates,
    deleteTemplate,
    updateSpaceById,
    deleteSpaceById,
    switchToSpace,
    resetSpace,
    importIntoSpace,
    exportFromSpace
  };
}
