<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import DataImportExport from './components/DataImportExport.vue';
import EquipmentHealthProfile from './components/EquipmentHealthProfile.vue';
import InventoryPanel from './components/InventoryPanel.vue';
import SettlementPanel from './components/SettlementPanel.vue';
import ReservationPanel from './components/ReservationPanel.vue';
import EventTimeline from './components/EventTimeline.vue';
import TripWrapUpWizard from './components/TripWrapUpWizard.vue';
import { useTripWrapUp } from './composables/useTripWrapUp.js';
import { applyAbnormalDeductionToDeposit } from './utils/inventoryTransform.js';
import {
  propagateMemberRename,
  cleanupDeletedTrip,
  linkDepositsToSettlement,
  calculateSettlement,
  getSettlementStats
} from './utils/settlementTransform.js';
import { normalizeGears } from './utils/dataTransform.js';
import { useReservation } from './composables/useReservation.js';
import { computeQueuePositions, expireOutdatedReservations, recalcAllPriorities } from './utils/reservationTransform.js';
import { buildAllHealthInfoMap } from './composables/useEquipmentHealth.js';
import { recordEvent } from './composables/useEventLog.js';
import {
  safeParseJSON,
  SPACE_LIST_KEY,
  CURRENT_SPACE_KEY,
  SPACE_DATA_PREFIX,
  TEMPLATE_LIST_KEY,
  hasOldData,
  iso,
  useSpaceStorage,
  TEMPLATE_ENTITY_LABELS,
  TEMPLATE_CONFIG_ENTITY_LABELS,
  TEMPLATE_BUSINESS_ENTITY_LABELS,
  OLD_KEYS,
  buildImportEventNote
} from './composables/useSpaceStorage.js';

const storage = useSpaceStorage();
const {
  spaces,
  currentSpaceId,
  spaceData,
  dataErrorWarning,
  currentSpace,
  currentSpaceData,
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
  importIntoSpace
} = storage;

const migrationWarning = ref('');
const showSpaceModal = ref(false);
const spaceModalMode = ref('create');
const editingSpaceId = ref(null);
const spaceForm = ref({ name: '', description: '' });
const showSpaceMenu = ref(false);

const showTemplateModal = ref(false);
const templateModalMode = ref('save');
const templateForm = ref({ name: '', selectedEntities: Object.keys(TEMPLATE_ENTITY_LABELS) });
const cloneForm = ref({
  templateId: '',
  copyMembers: true,
  copyGears: true,
  copyMaintenanceRecords: true,
  copyDepositRules: true,
  copyExampleTrips: false,
  clearBusinessFlow: true
});
const templateList = ref([]);

function createDefaultMembers() {
  return [
    { id: crypto.randomUUID(), nickname: '阿岚', phone: '', area: '', notes: '' },
    { id: crypto.randomUUID(), nickname: '梁序', phone: '', area: '', notes: '' },
    { id: crypto.randomUUID(), nickname: '小北', phone: '', area: '', notes: '' },
    { id: crypto.randomUUID(), nickname: '陈默', phone: '', area: '', notes: '' }
  ];
}

function createDefaultGears(ownerName = '阿岚', stoveOwner = '梁序', lampOwner = '小北') {
  return [
    { id: crypto.randomUUID(), name: '双人轻量帐', category: '帐篷天幕', owner: ownerName, available: iso(1), deposit: '200', status: '可借', notes: '含地钉和防潮垫', damage: '', maintenanceCycleDays: 30, nextMaintenanceDate: iso(30), maintenanceReminderLevel: '标准' },
    { id: crypto.randomUUID(), name: '炉头套装', category: '炊具', owner: stoveOwner, available: iso(0), deposit: '80', status: '借出中', notes: '需自备气罐', damage: '', maintenanceCycleDays: 15, nextMaintenanceDate: iso(15), maintenanceReminderLevel: '严格' },
    { id: crypto.randomUUID(), name: '营地灯三件组', category: '照明', owner: lampOwner, available: iso(3), deposit: '50', status: '可借', notes: '满电交接', damage: '', maintenanceCycleDays: 60, nextMaintenanceDate: iso(60), maintenanceReminderLevel: '宽松' }
  ];
}

function createDefaultRequests(gearList) {
  if (gearList.length < 3) return [];
  return [
    { id: crypto.randomUUID(), gearId: gearList[1].id, gearName: '炉头套装', owner: gearList[1].owner, borrower: '阿岚', start: iso(-1), end: iso(2), status: '已同意', reason: '周末湖边露营', damage: '' },
    { id: crypto.randomUUID(), gearId: gearList[2].id, gearName: '营地灯三件组', owner: gearList[2].owner, borrower: '陈默', start: iso(3), end: iso(5), status: '待处理', reason: '夜钓备用', damage: '' }
  ];
}

function findGearForMaintenance(record, gearList) {
  return gearList.find((gear) => gear.id === record.gearId)
    || gearList.find((gear) => gear.name === record.gearName && gear.owner === record.owner);
}

function normalizeMaintenanceRecords(records, gearList) {
  if (!Array.isArray(records)) return [];
  return records
    .map((record) => {
      if (!record || typeof record !== 'object') return null;
      const gear = findGearForMaintenance(record, gearList);
      return gear ? { ...record, gearId: gear.id, gearName: gear.name, owner: gear.owner } : null;
    })
    .filter(Boolean);
}

function createDefaultMaintenanceRecords(gearList) {
  const findGear = (name, owner) => gearList.find((gear) => gear.name === name && gear.owner === owner);
  const tent = findGear('双人轻量帐', '阿岚');
  const stove = findGear('炉头套装', '梁序');
  return [
    tent && { id: crypto.randomUUID(), gearId: tent.id, gearName: tent.name, owner: tent.owner, date: iso(-7), type: '清洁', description: '内外帐全面擦拭，通风晾干', handler: '阿岚' },
    tent && { id: crypto.randomUUID(), gearId: tent.id, gearName: tent.name, owner: tent.owner, date: iso(-20), type: '检查', description: '检查地钉和防风绳，状态良好', handler: '阿岚' },
    stove && { id: crypto.randomUUID(), gearId: stove.id, gearName: stove.name, owner: stove.owner, date: iso(-3), type: '补件', description: '更换了新的密封圈和点火电极', handler: '梁序' }
  ].filter(Boolean);
}

function createDefaultTrips(gearList, memberList) {
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

function normalizeTrips(storedTrips, gearList, memberList) {
  if (!Array.isArray(storedTrips)) return [];
  const memberNames = memberList.map((m) => m.nickname);
  return storedTrips.map((trip) => {
    if (!trip || typeof trip !== 'object') return null;
    return {
      ...trip,
      members: Array.isArray(trip.members) ? trip.members.filter((m) => memberNames.includes(m)) : [],
      gears: Array.isArray(trip.gears)
        ? trip.gears
            .map((g) => {
              if (!g || typeof g !== 'object') return null;
              const gear = gearList.find((gear) => gear.id === g.gearId);
              if (!gear) return g;
              return {
                ...g,
                gearName: gear.name,
                owner: gear.owner,
                deposit: gear.deposit
              };
            })
            .filter(Boolean)
        : []
    };
  }).filter(Boolean);
}

function normalizeRequests(storedRequests, gearList) {
  if (!Array.isArray(storedRequests)) return [];
  return storedRequests.map((req) => {
    if (!req || typeof req !== 'object') return null;
    const gear = gearList.find((g) => g.id === req.gearId)
      || gearList.find((g) => g.name === req.gearName && g.owner === req.owner);
    return {
      id: req.id || crypto.randomUUID(),
      gearId: gear ? gear.id : (req.gearId || ''),
      gearName: gear ? gear.name : (req.gearName || '未知装备'),
      owner: gear ? gear.owner : (req.owner || ''),
      borrower: req.borrower || '未知成员',
      start: req.start || iso(0),
      end: req.end || req.start || iso(0),
      status: req.status || '待处理',
      reason: req.reason || '',
      damage: req.damage || '',
      fromReservationId: req.fromReservationId || ''
    };
  }).filter(Boolean);
}

function validateAmount(value, allowZero = true) {
  if (value === '' || value === null || value === undefined) return { valid: false, message: '金额不能为空' };
  const num = Number(value);
  if (isNaN(num)) return { valid: false, message: '请输入有效的数字' };
  if (num < 0) return { valid: false, message: '金额不能为负数' };
  if (!allowZero && num === 0) return { valid: false, message: '金额不能为零' };
  return { valid: true, message: '', amount: num };
}

function normalizeDepositRecords(records, gearList, requestList) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => {
    if (!record || typeof record !== 'object') return null;
    const gear = gearList.find((g) => g.id === record.gearId)
      || gearList.find((g) => g.name === record.gearName && g.owner === record.owner);
    const req = requestList.find((r) => r.id === record.requestId);
    return {
      id: record.id || crypto.randomUUID(),
      requestId: record.requestId || (req ? req.id : ''),
      gearId: gear ? gear.id : (record.gearId || ''),
      gearName: gear ? gear.name : (record.gearName || (req ? req.gearName : '未知装备')),
      owner: gear ? gear.owner : (record.owner || (req ? req.owner : '')),
      borrower: record.borrower || (req ? req.borrower : ''),
      depositAmount: record.depositAmount !== undefined ? String(record.depositAmount) : (gear ? gear.deposit : '0'),
      receivedAmount: record.receivedAmount !== undefined ? String(record.receivedAmount) : '0',
      deductedAmount: record.deductedAmount !== undefined ? String(record.deductedAmount) : '0',
      refundedAmount: record.refundedAmount !== undefined ? String(record.refundedAmount) : '0',
      deductReason: record.deductReason || '',
      status: record.status || '待收取',
      notes: record.notes || '',
      createdAt: record.createdAt || new Date().toISOString().slice(0, 10),
      updatedAt: record.updatedAt || new Date().toISOString().slice(0, 10)
    };
  }).filter(Boolean);
}

function normalizeHandoverRecords(records, gearList, requestList) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => {
    if (!record || typeof record !== 'object') return null;
    const gear = gearList.find((g) => g.id === record.gearId)
      || gearList.find((g) => g.name === record.gearName && g.owner === record.owner);
    const req = requestList.find((r) => r.id === record.requestId);
    return {
      id: record.id || crypto.randomUUID(),
      type: record.type || '借出',
      requestId: record.requestId || '',
      gearId: gear ? gear.id : (record.gearId || ''),
      gearName: gear ? gear.name : (record.gearName || '未知装备'),
      owner: gear ? gear.owner : (record.owner || ''),
      borrower: record.borrower || (req ? req.borrower : ''),
      gearStatus: record.gearStatus || '',
      deposit: record.deposit || (gear ? gear.deposit : ''),
      accessories: record.accessories || '',
      handoverNotes: record.handoverNotes || '',
      damageRecord: record.damageRecord || '',
      deductAmount: record.deductAmount !== undefined ? record.deductAmount : '',
      deductReason: record.deductReason || '',
      ownerConfirmed: !!record.ownerConfirmed,
      borrowerConfirmed: !!record.borrowerConfirmed,
      createdAt: record.createdAt || new Date().toISOString().slice(0, 10)
    };
  }).filter(Boolean);
}

function migrateOldDataToDefaultSpace() {
  const storedSpaces = safeParseJSON(localStorage.getItem(SPACE_LIST_KEY), null);
  if (storedSpaces && Array.isArray(storedSpaces) && storedSpaces.length > 0) {
    return { migrated: false, message: '' };
  }

  if (!hasOldData()) {
    return { migrated: false, message: '' };
  }

  let warnings = [];

  const defaultMembers = createDefaultMembers();
  const defaultGears = createDefaultGears();
  const defaultRequests = createDefaultRequests(defaultGears);
  const defaultMaintenance = createDefaultMaintenanceRecords(defaultGears);
  const defaultTrips = createDefaultTrips(defaultGears, defaultMembers);

  let members, gears, requests, maintenanceRecords, trips, handoverRecords, depositRecords;

  try {
    const rawMembers = localStorage.getItem('zfl-3-members');
    members = rawMembers ? safeParseJSON(rawMembers, null) : null;
    if (!members || !Array.isArray(members)) {
      warnings.push('成员数据格式异常，已使用默认值');
      members = defaultMembers;
    } else {
      members = members.filter((m) => m && typeof m === 'object' && m.nickname);
      if (members.length === 0) {
        warnings.push('成员数据为空，已使用默认值');
        members = defaultMembers;
      }
    }
  } catch (e) {
    warnings.push('读取成员数据失败，已使用默认值');
    members = defaultMembers;
  }

  try {
    const rawGears = localStorage.getItem('zfl-3-gears');
    if (rawGears) {
      const parsedGears = safeParseJSON(rawGears, null);
      if (parsedGears && Array.isArray(parsedGears)) {
        const gearsResult = normalizeGears(parsedGears);
        gears = gearsResult.data;
        warnings.push(...gearsResult.warnings);
      } else {
        warnings.push('装备数据格式异常，已使用默认值');
        gears = defaultGears;
      }
    } else {
      gears = defaultGears;
    }
  } catch (e) {
    warnings.push('读取装备数据失败，已使用默认值');
    gears = defaultGears;
  }

  try {
    const rawRequests = localStorage.getItem('zfl-3-requests');
    requests = rawRequests ? normalizeRequests(safeParseJSON(rawRequests, []), gears) : defaultRequests;
  } catch (e) {
    warnings.push('读取申请数据失败，已使用默认值');
    requests = defaultRequests;
  }

  try {
    const rawMaintenance = localStorage.getItem('zfl-3-maintenance');
    maintenanceRecords = rawMaintenance
      ? normalizeMaintenanceRecords(safeParseJSON(rawMaintenance, []), gears)
      : createDefaultMaintenanceRecords(gears);
  } catch (e) {
    warnings.push('读取保养数据失败，已使用默认值');
    maintenanceRecords = createDefaultMaintenanceRecords(gears);
  }

  try {
    const rawTrips = localStorage.getItem('zfl-3-trips');
    trips = rawTrips
      ? normalizeTrips(safeParseJSON(rawTrips, []), gears, members)
      : createDefaultTrips(gears, members);
  } catch (e) {
    warnings.push('读取出行数据失败，已使用默认值');
    trips = createDefaultTrips(gears, members);
  }

  try {
    const rawHandovers = localStorage.getItem('zfl-3-handovers');
    handoverRecords = rawHandovers
      ? normalizeHandoverRecords(safeParseJSON(rawHandovers, []), gears, requests)
      : [];
  } catch (e) {
    warnings.push('读取交接数据失败，已使用默认值');
    handoverRecords = [];
  }

  try {
    const rawDeposits = localStorage.getItem('zfl-3-deposits');
    depositRecords = rawDeposits
      ? normalizeDepositRecords(safeParseJSON(rawDeposits, []), gears, requests)
      : [];
  } catch (e) {
    warnings.push('读取押金数据失败，已使用默认值');
    depositRecords = [];
  }

  const defaultSpaceId = crypto.randomUUID();
  const defaultSpace = {
    id: defaultSpaceId,
    name: '默认社群',
    description: '从旧数据自动迁移的默认空间',
    createdAt: new Date().toISOString().slice(0, 10)
  };

  const spacePayload = {
    members,
    gears,
    requests,
    maintenanceRecords,
    trips,
    handoverRecords,
    depositRecords,
    reservations: [],
    _migratedFromOld: true,
    _migratedAt: new Date().toISOString()
  };

  localStorage.setItem(SPACE_LIST_KEY, JSON.stringify([defaultSpace]));
  localStorage.setItem(CURRENT_SPACE_KEY, defaultSpaceId);
  localStorage.setItem(SPACE_DATA_PREFIX + defaultSpaceId, JSON.stringify(spacePayload));

  const existingTemplateList = safeParseJSON(localStorage.getItem(TEMPLATE_LIST_KEY), null);
  if (existingTemplateList && Array.isArray(existingTemplateList) && existingTemplateList.length > 0) {
    warnings.push(`发现 ${existingTemplateList.length} 个已保存的空间模板，已保留`);
  }

  OLD_KEYS.forEach((key) => localStorage.removeItem(key));

  const msg = warnings.length > 0
    ? `已迁移旧数据到「默认社群」。${warnings.join('；')}。如数据异常，可在空间设置中重置。`
    : '已成功迁移旧数据到「默认社群」空间。';

  return { migrated: true, message: msg, spaceId: defaultSpaceId };
}

function saveSpaceData(spaceId) {
  saveSpace(spaceId);
}

function importSpaceData(spaceId, importedData, mode = 'overwrite', mergeAnalysis = null) {
  const result = importIntoSpace(spaceId, importedData, mode, mergeAnalysis);
  if (!result.success) return false;
  const firstMember = spaceData.value[spaceId]?.members?.[0];
  if (firstMember && firstMember.nickname) {
    currentUser.value = firstMember.nickname;
  }
  return result;
}

function getCurrentSpaceData() {
  return currentSpaceData.value;
}

function ensureSpaceDataExists(spaceId) {
  return ensureSpaceDataLoaded(spaceId);
}

function createSpace(name, description = '') {
  return createNewSpace(name, description);
}

function updateSpace(spaceId, name, description) {
  updateSpaceById(spaceId, name, description);
}

function deleteSpace(spaceId) {
  const space = spaces.value.find((s) => s.id === spaceId);
  if (!space) return;
  if (!confirm(`确定删除空间「${space.name}」吗？该空间的所有数据将被永久清除，此操作不可恢复。`)) return;
  if (spaces.value.length <= 1) {
    alert('至少需要保留一个空间');
    return;
  }
  logEvent({
    entityType: 'space',
    entityId: spaceId,
    entityName: space.name,
    action: 'delete',
    beforeState: space,
    notes: `删除空间「${space.name}」（${space.description || '无描述'}）`
  });
  deleteSpaceById(spaceId);
}

function switchSpace(spaceId) {
  if (!spaceId || spaceId === currentSpaceId.value) return;
  switchToSpace(spaceId);
  const data = getCurrentSpaceData();
  if (data && data.members.length > 0 && !data.members.some((m) => m.nickname === currentUser.value)) {
    currentUser.value = data.members[0].nickname;
  }
  dataErrorWarning.value = '';
  closeSpaceMenu();
}

function resetSpaceData(spaceId) {
  const space = spaces.value.find((s) => s.id === spaceId);
  if (!space) return;
  if (!confirm(`确定重置空间「${space.name}」的所有数据吗？此操作将清空该空间的成员、装备、申请等所有记录，不可恢复。`)) return;
  logEvent({
    entityType: 'space',
    entityId: spaceId,
    entityName: space.name,
    action: 'reset',
    beforeState: { ...space },
    notes: `重置空间「${space.name}」所有数据`
  });
  resetSpace(spaceId);
  if (currentSpaceId.value === spaceId) {
    const data = getCurrentSpaceData();
    if (data && data.members.length > 0) {
      currentUser.value = data.members[0].nickname;
    }
  }
  alert('空间数据已重置');
}

function handleDataImported(payload) {
  if (!currentSpaceId.value) return;

  const { data, mode = 'overwrite', mergeAnalysis = null } = payload || {};

  if (!data) {
    console.error('导入数据为空');
    return;
  }

  const beforeSpace = spaces.value.find((s) => s.id === currentSpaceId.value);
  const result = importSpaceData(currentSpaceId.value, data, mode, mergeAnalysis);
  if (result && result.success) {
    const notes = buildImportEventNote(mode, mergeAnalysis);
    logEvent({
      entityType: 'space',
      entityId: currentSpaceId.value,
      entityName: beforeSpace?.name || '当前空间',
      action: 'import',
      beforeState: beforeSpace ? { ...beforeSpace } : null,
      notes
    });
    if (result.stats) {
      console.log('合并导入成功', result.stats);
    } else {
      console.log('覆盖导入成功');
    }
  } else {
    console.error('数据导入失败');
  }
}

function openCreateSpaceModal() {
  spaceModalMode.value = 'create';
  editingSpaceId.value = null;
  spaceForm.value = { name: '', description: '' };
  showSpaceModal.value = true;
}

function openEditSpaceModal(space) {
  spaceModalMode.value = 'edit';
  editingSpaceId.value = space.id;
  spaceForm.value = { name: space.name, description: space.description || '' };
  showSpaceModal.value = true;
}

function closeSpaceModal() {
  showSpaceModal.value = false;
  editingSpaceId.value = null;
  spaceForm.value = { name: '', description: '' };
}

function saveSpaceModal() {
  if (!spaceForm.value.name.trim()) {
    alert('请输入空间名称');
    return;
  }
  if (spaceModalMode.value === 'create') {
    const newSpace = createSpace(spaceForm.value.name, spaceForm.value.description);
    switchSpace(newSpace.id);
  } else if (spaceModalMode.value === 'edit' && editingSpaceId.value) {
    const oldSpace = spaces.value.find((s) => s.id === editingSpaceId.value);
    const beforeState = oldSpace ? { ...oldSpace } : null;
    updateSpace(editingSpaceId.value, spaceForm.value.name, spaceForm.value.description);
    if (beforeState && (beforeState.name !== spaceForm.value.name || (beforeState.description || '') !== (spaceForm.value.description || ''))) {
      logEvent({
        entityType: 'space',
        entityId: editingSpaceId.value,
        entityName: beforeState.name,
        action: 'rename',
        beforeState,
        afterState: { ...beforeState, name: spaceForm.value.name, description: spaceForm.value.description },
        notes: beforeState.name !== spaceForm.value.name
          ? `空间「${beforeState.name}」改名为「${spaceForm.value.name}」`
          : `更新空间描述「${spaceForm.value.name}」`
      });
    }
  }
  closeSpaceModal();
}

function toggleSpaceMenu() {
  showSpaceMenu.value = !showSpaceMenu.value;
}

function closeSpaceMenu() {
  showSpaceMenu.value = false;
}

function refreshTemplateList() {
  templateList.value = getAvailableTemplates();
}

function openSaveTemplateModal() {
  templateModalMode.value = 'save';
  templateForm.value = {
    name: (currentSpace.value?.name || '空间') + ' 模板',
    selectedEntities: Object.keys(TEMPLATE_ENTITY_LABELS)
  };
  showTemplateModal.value = true;
  closeSpaceMenu();
}

function openCloneFromTemplateModal() {
  refreshTemplateList();
  if (templateList.value.length === 0) {
    alert('暂无可用模板。请先将当前空间保存为模板。');
    return;
  }
  templateModalMode.value = 'clone';
  cloneForm.value = {
    templateId: templateList.value[0].id,
    copyMembers: true,
    copyGears: true,
    copyMaintenanceRecords: true,
    copyDepositRules: true,
    copyExampleTrips: false,
    clearBusinessFlow: true
  };
  spaceForm.value = { name: '', description: '' };
  showTemplateModal.value = true;
  closeSpaceMenu();
}

function openTemplateListModal() {
  refreshTemplateList();
  templateModalMode.value = 'list';
  showTemplateModal.value = true;
  closeSpaceMenu();
}

function closeTemplateModal() {
  showTemplateModal.value = false;
  templateForm.value = { name: '', selectedEntities: Object.keys(TEMPLATE_ENTITY_LABELS) };
  cloneForm.value = {
    templateId: '',
    copyMembers: true,
    copyGears: true,
    copyMaintenanceRecords: true,
    copyDepositRules: true,
    copyExampleTrips: false,
    clearBusinessFlow: true
  };
}

function saveTemplateAction() {
  if (!templateForm.value.name.trim()) {
    alert('请输入模板名称');
    return;
  }
  const result = saveCurrentSpaceAsTemplate(
    templateForm.value.name,
    templateForm.value.selectedEntities
  );
  if (result) {
    logEvent({
      entityType: 'space',
      entityId: currentSpaceId.value,
      entityName: currentSpace.value?.name || '当前空间',
      action: 'export',
      notes: `保存为模板「${result.name}」`
    });
    alert(`模板「${result.name}」保存成功！`);
    closeTemplateModal();
  } else {
    alert('保存模板失败，请重试');
  }
}

function cloneFromTemplateAction() {
  if (!spaceForm.value.name.trim()) {
    alert('请输入新空间名称');
    return;
  }
  if (!cloneForm.value.templateId) {
    alert('请选择模板');
    return;
  }
  const newSpace = createSpaceFromTemplate(
    spaceForm.value.name,
    spaceForm.value.description,
    cloneForm.value.templateId,
    {
      copyMembers: cloneForm.value.copyMembers,
      copyGears: cloneForm.value.copyGears,
      copyMaintenanceRecords: cloneForm.value.copyMaintenanceRecords,
      copyDepositRules: cloneForm.value.copyDepositRules,
      copyExampleTrips: cloneForm.value.copyExampleTrips,
      clearBusinessFlow: cloneForm.value.clearBusinessFlow
    }
  );
  if (newSpace) {
    logEvent({
      entityType: 'space',
      entityId: newSpace.id,
      entityName: newSpace.name,
      action: 'create',
      notes: `从模板创建空间「${newSpace.name}」`
    });
    switchSpace(newSpace.id);
    alert(`空间「${newSpace.name}」已从模板创建成功！`);
    closeTemplateModal();
  } else {
    alert('从模板创建空间失败，请重试');
  }
}

function deleteTemplateAction(templateId) {
  const tmpl = templateList.value.find((t) => t.id === templateId);
  if (!tmpl) return;
  if (!confirm(`确定删除模板「${tmpl.name}」吗？此操作不可恢复。`)) return;
  deleteTemplate(templateId);
  refreshTemplateList();
  logEvent({
    entityType: 'space',
    entityId: currentSpaceId.value,
    entityName: currentSpace.value?.name || '空间',
    action: 'delete',
    notes: `删除模板「${tmpl.name}」`
  });
}

function getTemplateEntitySummary(template) {
  if (!template || !template.entitySummary) return '';
  return Object.entries(template.entitySummary)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${TEMPLATE_ENTITY_LABELS[key] || key} ${count}`)
    .join('、');
}

const members = computed({
  get: () => getCurrentSpaceData()?.members || [],
  set: (val) => {
    const data = getCurrentSpaceData();
    if (data) data.members = val;
  }
});

const gears = computed({
  get: () => getCurrentSpaceData()?.gears || [],
  set: (val) => {
    const data = getCurrentSpaceData();
    if (data) data.gears = val;
  }
});

const requests = computed({
  get: () => getCurrentSpaceData()?.requests || [],
  set: (val) => {
    const data = getCurrentSpaceData();
    if (data) data.requests = val;
  }
});

const maintenanceRecords = computed({
  get: () => getCurrentSpaceData()?.maintenanceRecords || [],
  set: (val) => {
    const data = getCurrentSpaceData();
    if (data) data.maintenanceRecords = val;
  }
});

const trips = computed({
  get: () => getCurrentSpaceData()?.trips || [],
  set: (val) => {
    const data = getCurrentSpaceData();
    if (data) data.trips = val;
  }
});

const handoverRecords = computed({
  get: () => getCurrentSpaceData()?.handoverRecords || [],
  set: (val) => {
    const data = getCurrentSpaceData();
    if (data) data.handoverRecords = val;
  }
});

const depositRecords = computed({
  get: () => getCurrentSpaceData()?.depositRecords || [],
  set: (val) => {
    const data = getCurrentSpaceData();
    if (data) data.depositRecords = val;
  }
});

const inventoryLists = computed({
  get: () => getCurrentSpaceData()?.inventoryLists || [],
  set: (val) => {
    const data = getCurrentSpaceData();
    if (data) data.inventoryLists = val;
  }
});

const settlementRecords = computed({
  get: () => getCurrentSpaceData()?.settlementRecords || [],
  set: (val) => {
    const data = getCurrentSpaceData();
    if (data) data.settlementRecords = val;
  }
});

const reservations = computed({
  get: () => getCurrentSpaceData()?.reservations || [],
  set: (val) => {
    const data = getCurrentSpaceData();
    if (data) data.reservations = val;
  }
});

const eventLogs = computed({
  get: () => getCurrentSpaceData()?.eventLogs || [],
  set: (val) => {
    const data = getCurrentSpaceData();
    if (data) data.eventLogs = val;
  }
});

const eventLogRef = computed({
  get: () => eventLogs.value,
  set: (val) => { eventLogs.value = val; }
});

function logEvent(params) {
  if (!currentSpaceId.value) return null;
  const data = getCurrentSpaceData();
  if (!data) return null;

  const logsArr = data.eventLogs || [];
  const wrappedRef = { value: logsArr };

  const event = recordEvent(wrappedRef, {
    ...params,
    actor: currentUser.value,
    sourcePage: params.sourcePage || tab.value || ''
  });

  if (event) {
    data.eventLogs = wrappedRef.value;
  }

  return event;
}

const currentUser = ref('阿岚');

const healthInfoMap = computed(() =>
  buildAllHealthInfoMap({
    gears: gears.value,
    requests: requests.value,
    handovers: handoverRecords.value,
    maintenanceRecords: maintenanceRecords.value,
    depositRecords: depositRecords.value,
    inventoryLists: inventoryLists.value
  })
);

const reservationHelper = useReservation({
  reservations: reservations,
  gears: gears,
  requests: requests,
  handovers: handoverRecords,
  members: members,
  currentUser: currentUser,
  healthInfoMap: healthInfoMap
});

const tripWrapUp = useTripWrapUp({
  trips: trips,
  members: members,
  gears: gears,
  requests: requests,
  handoverRecords: handoverRecords,
  depositRecords: depositRecords,
  inventoryLists: inventoryLists,
  settlementRecords: settlementRecords,
  currentUser: currentUser
});

const wrapUpSelectedTripId = ref(null);
const wrapUpEditingInventoryId = ref(null);
const wrapUpEditingSettlementId = ref(null);
const pendingReviewNotification = ref(null);

function triggerReservationCheck() {
  const beforeReservations = JSON.parse(JSON.stringify(reservations.value));
  const result = reservationHelper.checkAndActivateWithReview();
  
  if (result.list) {
    reservations.value = result.list;
  }
  if (result.newRequests && result.newRequests.length > 0) {
    for (const req of result.newRequests) {
      requests.value = [req, ...requests.value];
    }
    if (result.activated && result.activated.length > 0) {
      for (const activatedId of result.activated) {
        const beforeRes = beforeReservations.find((r) => r.id === activatedId);
        const afterRes = reservations.value.find((r) => r.id === activatedId);
        const relatedRequest = result.newRequests.find((req) => req.fromReservationId === activatedId);
        const gear = gears.value.find((g) => g.id === afterRes?.gearId || beforeRes?.gearId);
        logEvent({
          entityType: 'reservation',
          entityId: activatedId,
          entityName: `${gear?.name || beforeRes?.gearName || '未知装备'} - ${afterRes?.borrower || beforeRes?.borrower || ''}`,
          action: 'activate',
          beforeState: beforeRes,
          afterState: afterRes,
          sourcePage: tab.value || '',
          notes: '系统自动检测转正，已生成借用申请',
          relatedEntityType: 'request',
          relatedEntityId: relatedRequest?.id || '',
          relatedEntityName: relatedRequest?.gearName || ''
        });
      }
      const firstRes = reservations.value.find((r) => r.id === result.activated[0]);
      if (firstRes) {
        alert(`候补预约「${firstRes.gearName}」已自动转正，已生成借用申请`);
      }
    }
  }

  const reviewItems = reservationHelper.reviewItems || [];
  if (reviewItems.length > 0) {
    const canActivateCount = reviewItems.filter(i => i.canActivate).length;
    const hasWarningCount = reviewItems.filter(i => i.warnings.length > 0 && !i.activationBlockers.length).length;
    const blockedCount = reviewItems.filter(i => i.activationBlockers.length > 0).length;

    pendingReviewNotification.value = {
      total: reviewItems.length,
      canActivate: canActivateCount,
      hasWarning: hasWarningCount,
      blocked: blockedCount,
      timestamp: Date.now()
    };

    logEvent({
      entityType: 'reservation',
      entityId: 'review_detection',
      entityName: '候补转正审核',
      action: 'review_items_detected',
      beforeState: null,
      afterState: pendingReviewNotification.value,
      sourcePage: tab.value || '',
      notes: `检测到 ${reviewItems.length} 项候补可转正审核`
    });
  } else {
    pendingReviewNotification.value = null;
  }
}

function dismissReviewNotification() {
  pendingReviewNotification.value = null;
}

function navigateToReview() {
  tab.value = '预约排程';
  pendingReviewNotification.value = null;
}

function handleReservationActivated(reservation) {
  if (reservation.generatedRequestId) {
    return;
  }
  const gear = gears.value.find((g) => g.id === reservation.gearId);
  if (!gear) return;
  const conflicts = findConflictingRequests(gear.id, reservation.start, reservation.end);
  if (conflicts.length > 0) {
    alert(`候补预约「${reservation.gearName}」可转正，但日期仍有冲突，请手动处理`);
    return;
  }
  const newRequest = {
    id: crypto.randomUUID(),
    gearId: gear.id,
    gearName: gear.name,
    owner: gear.owner,
    borrower: reservation.borrower,
    start: reservation.start,
    end: reservation.end,
    status: '待处理',
    reason: `候补转正（原候补原因：${reservation.reason}）`,
    damage: '',
    fromReservationId: reservation.id
  };
  requests.value = [newRequest, ...requests.value];
  alert(`候补预约「${reservation.gearName}」已自动转正，已生成借用申请`);
}

const showHealthProfile = ref(false);
const currentHealthGearId = ref('');
const timelineFilterContext = ref(null);
const tab = ref('装备库');
const category = ref('全部分类');
const requestFilter = ref('全部申请');
const form = ref({ name: '', category: '帐篷天幕', owner: '阿岚', available: iso(2), deposit: '100', status: '可借', notes: '', maintenanceCycleDays: 30, nextMaintenanceDate: iso(30), maintenanceReminderLevel: '标准' });
const editingGearId = ref(null);
const requestForm = ref({ gearId: '', borrower: '梁序', start: iso(2), end: iso(4), reason: '' });

const memberForm = ref({ nickname: '', phone: '', area: '', notes: '' });
const editingMemberId = ref(null);
const deleteWarning = ref('');

const maintenanceTypes = ['清洁', '维修', '补件', '检查'];
const maintenanceForm = ref({ gearId: '', date: iso(0), type: '清洁', description: '', handler: '' });
const maintenanceFilter = ref('全部装备');

const tripForm = ref({ destination: '', startDate: iso(7), members: [], notes: '' });
const editingTripId = ref(null);
const selectedTripId = ref(null);
const tripGears = ref([]);
const tripCategoryFilter = ref('全部分类');

const calendarViewMode = ref('按装备');
const calendarFilterValue = ref('全部');
const calendarWeekStart = ref(iso(0));
const conflictWarning = ref('');
const conflictDetails = ref([]);

const reservationShortcut = ref({ gearId: '', start: '', end: '' });

const sceneOptions = ['湖畔露营', '山地露营', '家庭亲子', '徒步露营', '沙滩露营', '冬季露营'];
const weatherOptions = ['晴朗', '多云', '小雨', '大风', '高温', '寒冷'];
const recommendScene = ref('湖畔露营');
const recommendWeather = ref('晴朗');
const recommendPeople = ref(2);
const recommendDays = ref(2);
const recommendationResult = ref({});
const gapList = ref([]);
const hasRecommended = ref(false);
const selectedRecommendGears = ref([]);
const recommendMembers = ref([currentUser.value]);
const recommendStart = ref(iso(2));
const recommendEnd = ref(iso(4));
const travelPlanWaitlistGears = ref([]);

const handoverFilter = ref('全部交接单');
const handoverTypeFilter = ref('全部类型');
const showHandoverModal = ref(false);
const handoverModalMode = ref('');
const currentHandoverId = ref(null);
const handoverForm = ref({
  type: '借出',
  requestId: '',
  gearId: '',
  gearName: '',
  owner: '',
  borrower: '',
  gearStatus: '',
  deposit: '',
  accessories: '',
  handoverNotes: '',
  damageRecord: '',
  deductAmount: '',
  deductReason: '',
  ownerConfirmed: false,
  borrowerConfirmed: false
});

const depositStatusList = ['全部状态', '待收取', '已收取', '部分扣除', '已扣除', '已退还', '异常'];
const depositFilter = ref('全部状态');
const depositMemberFilter = ref('全部成员');
const depositGearFilter = ref('全部装备');
const showDepositModal = ref(false);
const depositModalMode = ref('');
const currentDepositId = ref(null);
const depositForm = ref({
  requestId: '',
  gearId: '',
  gearName: '',
  owner: '',
  borrower: '',
  depositAmount: '',
  receivedAmount: '',
  deductedAmount: '',
  refundedAmount: '',
  deductReason: '',
  status: '待收取',
  notes: ''
});

onMounted(() => {
  const migrationResult = migrateOldDataToDefaultSpace();
  if (migrationResult.migrated && migrationResult.message) {
    migrationWarning.value = migrationResult.message;
  }

  storage.loadAllSpaces();
  if (spaces.value.length === 0) {
    const defaultSpace = createSpace('我的露营社群', '首个社群空间');
    switchToSpace(defaultSpace.id);
  }

  const data = getCurrentSpaceData();
  if (data && data.members.length > 0) {
    currentUser.value = data.members[0].nickname;
  }

  if (trips.value.length > 0 && !selectedTripId.value) {
    selectedTripId.value = trips.value[0].id;
  }

  nextTick(() => {
    reservationHelper.analyzeForReview();
  });
});

watch(currentSpaceId, (newId, oldId) => {
  if (oldId) saveSpaceData(oldId);
  if (newId) {
    ensureSpaceDataExists(newId);
    saveSpaceData(newId);
  }
}, { immediate: false });

watch(members, () => currentSpaceId.value && saveSpaceData(currentSpaceId.value), { deep: true });
watch(gears, () => currentSpaceId.value && saveSpaceData(currentSpaceId.value), { deep: true });
watch(requests, () => currentSpaceId.value && saveSpaceData(currentSpaceId.value), { deep: true });
watch(maintenanceRecords, () => currentSpaceId.value && saveSpaceData(currentSpaceId.value), { deep: true });
watch(trips, () => currentSpaceId.value && saveSpaceData(currentSpaceId.value), { deep: true });
watch(handoverRecords, () => currentSpaceId.value && saveSpaceData(currentSpaceId.value), { deep: true });
watch(depositRecords, () => currentSpaceId.value && saveSpaceData(currentSpaceId.value), { deep: true });
watch(inventoryLists, () => currentSpaceId.value && saveSpaceData(currentSpaceId.value), { deep: true });
watch(settlementRecords, () => currentSpaceId.value && saveSpaceData(currentSpaceId.value), { deep: true });
watch(reservations, () => currentSpaceId.value && saveSpaceData(currentSpaceId.value), { deep: true });
watch(eventLogs, () => currentSpaceId.value && saveSpaceData(currentSpaceId.value), { deep: true });

function createDepositRecord(requestId) {
  const req = requests.value.find((r) => r.id === requestId);
  if (!req) return null;
  const gear = gears.value.find((g) => g.id === req.gearId);
  return {
    id: crypto.randomUUID(),
    requestId: req.id,
    gearId: req.gearId,
    gearName: req.gearName,
    owner: req.owner,
    borrower: req.borrower,
    depositAmount: gear ? gear.deposit : '0',
    receivedAmount: '0',
    deductedAmount: '0',
    refundedAmount: '0',
    deductReason: '',
    status: '待收取',
    notes: '',
    createdAt: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString().slice(0, 10)
  };
}

function getDepositByRequest(requestId) {
  return depositRecords.value.find((d) => d.requestId === requestId);
}

function recalcDepositStatus(deposit) {
  const d = Number(deposit.depositAmount) || 0;
  const r = Number(deposit.receivedAmount) || 0;
  const ded = Number(deposit.deductedAmount) || 0;
  const ref = Number(deposit.refundedAmount) || 0;

  if (r === 0) return '待收取';
  if (r < d) return '异常';
  if (ded > 0 && ref > 0 && ded + ref === r) return ded < d ? '部分扣除' : '已扣除';
  if (ded > 0 && ref === 0 && ded === r) return ded < d ? '部分扣除' : '已扣除';
  if (ref > 0 && ded === 0 && ref === r) return '已退还';
  if (r === d && ded === 0 && ref === 0) return '已收取';
  if (ded + ref > r) return '异常';
  return '异常';
}

function updateDepositStatus(recordId) {
  const idx = depositRecords.value.findIndex((d) => d.id === recordId);
  if (idx === -1) return;
  const record = depositRecords.value[idx];
  const newStatus = recalcDepositStatus(record);
  if (record.status !== newStatus) {
    depositRecords.value[idx] = { ...record, status: newStatus, updatedAt: new Date().toISOString().slice(0, 10) };
  }
}

function openDepositModal(depositId, mode = 'view') {
  const deposit = depositRecords.value.find((d) => d.id === depositId);
  if (!deposit) return;
  depositForm.value = { ...deposit };
  currentDepositId.value = depositId;
  depositModalMode.value = mode;
  showDepositModal.value = true;
}

function closeDepositModal() {
  showDepositModal.value = false;
  depositForm.value = {
    requestId: '',
    gearId: '',
    gearName: '',
    owner: '',
    borrower: '',
    depositAmount: '',
    receivedAmount: '',
    deductedAmount: '',
    refundedAmount: '',
    deductReason: '',
    status: '待收取',
    notes: ''
  };
  currentDepositId.value = null;
}

function saveDepositRecord() {
  if (!currentDepositId.value) return;

  const depositCheck = validateAmount(depositForm.value.depositAmount);
  if (!depositCheck.valid) { alert(`押金金额：${depositCheck.message}`); return; }

  const receivedCheck = validateAmount(depositForm.value.receivedAmount);
  if (!receivedCheck.valid) { alert(`已收金额：${receivedCheck.message}`); return; }

  const dedCheck = validateAmount(depositForm.value.deductedAmount);
  if (!dedCheck.valid) { alert(`扣除金额：${dedCheck.message}`); return; }

  const refCheck = validateAmount(depositForm.value.refundedAmount);
  if (!refCheck.valid) { alert(`退还金额：${refCheck.message}`); return; }

  if (Number(depositForm.value.deductedAmount) > Number(depositForm.value.depositAmount)) {
    alert('扣除金额不能大于押金金额');
    return;
  }
  if (Number(depositForm.value.deductedAmount) + Number(depositForm.value.refundedAmount) > Number(depositForm.value.receivedAmount)) {
    alert('扣除金额与退还金额之和不能大于已收金额');
    return;
  }

  const oldDeposit = depositRecords.value.find((d) => d.id === currentDepositId.value);
  const beforeState = oldDeposit ? { ...oldDeposit } : null;
  const newDeposit = { ...depositForm.value, id: oldDeposit.id, createdAt: oldDeposit.createdAt, updatedAt: new Date().toISOString().slice(0, 10) };

  depositRecords.value = depositRecords.value.map((d) =>
    d.id === currentDepositId.value ? newDeposit : d
  );

  if (oldDeposit) {
    const deductDiff = Number(newDeposit.deductedAmount) - Number(beforeState.deductedAmount);
    const refundDiff = Number(newDeposit.refundedAmount) - Number(beforeState.refundedAmount);
    const receivedDiff = Number(newDeposit.receivedAmount) - Number(beforeState.receivedAmount);
    const actionNotes = [];
    let loggedSpecial = false;

    if (deductDiff > 0) {
      actionNotes.push(`扣除押金 ¥${deductDiff}`);
      logEvent({
        entityType: 'deposit',
        entityId: oldDeposit.id,
        entityName: oldDeposit.gearName,
        action: 'deduct',
        beforeState,
        afterState: newDeposit,
        relatedEntityType: 'gear',
        relatedEntityId: oldDeposit.gearId,
        relatedEntityName: oldDeposit.gearName,
        notes: `押金手动扣除 ¥${deductDiff}（${newDeposit.deductReason || '无原因'}）`
      });
      loggedSpecial = true;
    }
    if (refundDiff > 0) {
      actionNotes.push(`退还押金 ¥${refundDiff}`);
      logEvent({
        entityType: 'deposit',
        entityId: oldDeposit.id,
        entityName: oldDeposit.gearName,
        action: 'refund',
        beforeState,
        afterState: newDeposit,
        relatedEntityType: 'gear',
        relatedEntityId: oldDeposit.gearId,
        relatedEntityName: oldDeposit.gearName,
        notes: `押金手动退还 ¥${refundDiff}`
      });
      loggedSpecial = true;
    }
    if (receivedDiff > 0) {
      actionNotes.push(`收取押金 ¥${receivedDiff}`);
    }

    if (!loggedSpecial && (deductDiff !== 0 || refundDiff !== 0 || receivedDiff !== 0 ||
        beforeState.status !== newDeposit.status || beforeState.notes !== newDeposit.notes)) {
      logEvent({
        entityType: 'deposit',
        entityId: oldDeposit.id,
        entityName: oldDeposit.gearName,
        action: 'update',
        beforeState,
        afterState: newDeposit,
        relatedEntityType: 'gear',
        relatedEntityId: oldDeposit.gearId,
        relatedEntityName: oldDeposit.gearName,
        notes: actionNotes.length > 0 ? `押金记录调整：${actionNotes.join('、')}` : '更新押金记录'
      });
    }
  }

  updateDepositStatus(currentDepositId.value);
  closeDepositModal();
}

const depositGearOptions = computed(() => ['全部装备', ...new Set(depositRecords.value.map((r) => r.gearName).filter(Boolean))]);
const depositMemberOptions = computed(() => ['全部成员', ...members.value.map((m) => m.nickname)]);

const filteredDeposits = computed(() => {
  return depositRecords.value.filter((d) => {
    const statusMatch = depositFilter.value === '全部状态' || d.status === depositFilter.value;
    const memberMatch = depositMemberFilter.value === '全部成员'
      || d.borrower === depositMemberFilter.value
      || d.owner === depositMemberFilter.value;
    const gearMatch = depositGearFilter.value === '全部装备' || d.gearName === depositGearFilter.value;
    return statusMatch && memberMatch && gearMatch;
  });
});

const depositCount = computed(() => depositRecords.value.length);
const pendingDepositCount = computed(() => depositRecords.value.filter((d) => d.status === '待收取').length);
const totalDepositReceived = computed(() => depositRecords.value.reduce((sum, d) => sum + (Number(d.receivedAmount) || 0), 0));
const totalDepositDeducted = computed(() => depositRecords.value.reduce((sum, d) => sum + (Number(d.deductedAmount) || 0), 0));

function createBorrowHandover(requestId) {
  const req = requests.value.find((r) => r.id === requestId);
  if (!req) return null;
  const gear = gears.value.find((g) => g.id === req.gearId);
  return {
    id: crypto.randomUUID(),
    type: '借出',
    requestId: req.id,
    gearId: req.gearId,
    gearName: req.gearName,
    owner: req.owner,
    borrower: req.borrower,
    gearStatus: gear ? (gear.notes || '') : '',
    deposit: gear ? gear.deposit : '',
    accessories: '',
    handoverNotes: '',
    damageRecord: '',
    deductAmount: '',
    deductReason: '',
    ownerConfirmed: false,
    borrowerConfirmed: false,
    createdAt: new Date().toISOString().slice(0, 10)
  };
}

function createReturnHandover(requestId) {
  const req = requests.value.find((r) => r.id === requestId);
  if (!req) return null;
  const borrowHandover = handoverRecords.value.find((h) => h.requestId === requestId && h.type === '借出');
  const gear = gears.value.find((g) => g.id === req.gearId);
  return {
    id: crypto.randomUUID(),
    type: '归还',
    requestId: req.id,
    gearId: req.gearId,
    gearName: req.gearName,
    owner: req.owner,
    borrower: req.borrower,
    gearStatus: borrowHandover ? borrowHandover.gearStatus : (gear ? gear.notes : ''),
    deposit: borrowHandover ? borrowHandover.deposit : (gear ? gear.deposit : ''),
    accessories: borrowHandover ? borrowHandover.accessories : '',
    handoverNotes: '',
    damageRecord: '',
    deductAmount: '',
    deductReason: '',
    ownerConfirmed: false,
    borrowerConfirmed: false,
    createdAt: new Date().toISOString().slice(0, 10)
  };
}

function openBorrowHandoverModal(requestId) {
  const existing = handoverRecords.value.find((h) => h.requestId === requestId && h.type === '借出');
  if (existing) {
    handoverForm.value = { ...existing };
    currentHandoverId.value = existing.id;
  } else {
    const handover = createBorrowHandover(requestId);
    if (!handover) return;
    handoverForm.value = { ...handover };
    currentHandoverId.value = null;
  }
  handoverModalMode.value = '借出';
  showHandoverModal.value = true;
}

function openReturnHandoverModal(requestId) {
  const existing = handoverRecords.value.find((h) => h.requestId === requestId && h.type === '归还');
  if (existing) {
    handoverForm.value = { ...existing };
    currentHandoverId.value = existing.id;
  } else {
    const handover = createReturnHandover(requestId);
    if (!handover) return;
    handoverForm.value = { ...handover };
    currentHandoverId.value = null;
  }
  handoverModalMode.value = '归还';
  showHandoverModal.value = true;
}

function saveHandover() {
  if (!handoverForm.value.gearId) return;

  const depositCheck = validateAmount(handoverForm.value.deposit);
  if (!depositCheck.valid) { alert(`押金金额：${depositCheck.message}`); return; }

  if (handoverForm.value.type === '归还') {
    if (handoverForm.value.deductAmount !== '' && handoverForm.value.deductAmount !== null) {
      const dedCheck = validateAmount(handoverForm.value.deductAmount);
      if (!dedCheck.valid) { alert(`扣除金额：${dedCheck.message}`); return; }
      const depositAmt = Number(handoverForm.value.deposit) || 0;
      if (Number(handoverForm.value.deductAmount) > depositAmt) {
        alert('扣除金额不能大于押金金额');
        return;
      }
    }
  }

  const handoverType = handoverForm.value.type;
  const beforeState = currentHandoverId.value
    ? { ...handoverRecords.value.find((h) => h.id === currentHandoverId.value) }
    : null;

  if (currentHandoverId.value) {
    handoverRecords.value = handoverRecords.value.map((h) =>
      h.id === currentHandoverId.value ? { ...handoverForm.value } : h
    );
    logEvent({
      entityType: 'handover',
      entityId: currentHandoverId.value,
      entityName: handoverForm.value.gearName,
      action: 'update',
      beforeState,
      afterState: handoverForm.value,
      relatedEntityType: 'gear',
      relatedEntityId: handoverForm.value.gearId,
      relatedEntityName: handoverForm.value.gearName,
      notes: `更新${handoverType}交接单（借用人：${handoverForm.value.borrower}）`
    });
  } else {
    const newRecord = { ...handoverForm.value, id: crypto.randomUUID(), createdAt: new Date().toISOString().slice(0, 10) };
    handoverRecords.value = [newRecord, ...handoverRecords.value];
    currentHandoverId.value = newRecord.id;
    logEvent({
      entityType: 'handover',
      entityId: newRecord.id,
      entityName: newRecord.gearName,
      action: handoverType === '借出' ? 'borrow' : 'return',
      afterState: newRecord,
      relatedEntityType: 'gear',
      relatedEntityId: newRecord.gearId,
      relatedEntityName: newRecord.gearName,
      notes: `创建${handoverType}交接单（借用人：${newRecord.borrower}）`
    });
  }

  if (handoverForm.value.type === '归还' && handoverForm.value.requestId) {
    const deposit = getDepositByRequest(handoverForm.value.requestId);
    if (deposit) {
      const dedAmt = handoverForm.value.deductAmount !== '' && handoverForm.value.deductAmount !== null
        ? String(Number(handoverForm.value.deductAmount) || 0)
        : deposit.deductedAmount;
      const receivedAmt = Number(deposit.receivedAmount) || 0;
      const dedNum = Number(dedAmt) || 0;
      const refundAmt = receivedAmt - dedNum >= 0 ? String(receivedAmt - dedNum) : deposit.refundedAmount;

      const beforeDeposit = { ...deposit };
      const deductChanged = beforeDeposit.deductedAmount !== dedAmt || beforeDeposit.refundedAmount !== refundAmt;

      depositRecords.value = depositRecords.value.map((d) =>
        d.id === deposit.id
          ? {
              ...d,
              deductedAmount: dedAmt,
              deductReason: handoverForm.value.deductReason || d.deductReason,
              refundedAmount: refundAmt,
              updatedAt: new Date().toISOString().slice(0, 10)
            }
          : d
      );

      if (deductChanged && Number(dedAmt) > Number(beforeDeposit.deductedAmount)) {
        const updatedDeposit = depositRecords.value.find((d) => d.id === deposit.id);
        logEvent({
          entityType: 'deposit',
          entityId: deposit.id,
          entityName: deposit.gearName,
          action: 'deduct',
          beforeState: beforeDeposit,
          afterState: updatedDeposit,
          relatedEntityType: 'handover',
          relatedEntityId: currentHandoverId.value,
          relatedEntityName: handoverForm.value.gearName,
          notes: `归还交接中扣除押金 ¥${Number(dedAmt) - Number(beforeDeposit.deductedAmount)}（${handoverForm.value.deductReason || '无原因'}）`
        });
      }

      updateDepositStatus(deposit.id);
    }
  }

  checkHandoverCompletion(handoverForm.value.requestId);
}

function checkHandoverCompletion(requestId) {
  const borrowHandover = handoverRecords.value.find((h) => h.requestId === requestId && h.type === '借出');
  const returnHandover = handoverRecords.value.find((h) => h.requestId === requestId && h.type === '归还');

  if (borrowHandover && borrowHandover.ownerConfirmed && borrowHandover.borrowerConfirmed) {
    const req = requests.value.find((r) => r.id === requestId);
    if (req && req.status === '已同意') {
      const oldBorrow = handoverRecords.value.find((h) => h.id === borrowHandover.id);
      if (!oldBorrow?._completionLogged) {
        logEvent({
          entityType: 'handover',
          entityId: borrowHandover.id,
          entityName: borrowHandover.gearName,
          action: 'confirm',
          beforeState: borrowHandover,
          afterState: { ...borrowHandover, ownerConfirmed: true, borrowerConfirmed: true },
          relatedEntityType: 'request',
          relatedEntityId: requestId,
          relatedEntityName: borrowHandover.gearName,
          notes: `借出交接已由主人「${borrowHandover.owner}」和借用人「${borrowHandover.borrower}」双方确认`
        });
        handoverRecords.value = handoverRecords.value.map((h) =>
          h.id === borrowHandover.id ? { ...h, _completionLogged: true } : h
        );
      }
      gears.value = gears.value.map((gear) => gear.id === req.gearId ? { ...gear, status: '借出中' } : gear);
    }
    const deposit = getDepositByRequest(requestId);
    if (deposit) {
      const depositCheck = validateAmount(borrowHandover.deposit);
      if (!depositCheck.valid) {
        alert(`押金金额校验失败：${depositCheck.message}`);
        return;
      }
      const receivedAmt = String(Number(borrowHandover.deposit) || 0);
      const depositAmt = deposit.depositAmount || receivedAmt;
      if (Number(receivedAmt) !== Number(depositAmt)) {
        alert('已收金额必须等于押金金额');
        return;
      }
      const beforeDeposit = { ...deposit };
      const receivedChanged = beforeDeposit.receivedAmount !== receivedAmt;
      depositRecords.value = depositRecords.value.map((d) =>
        d.id === deposit.id
          ? {
              ...d,
              receivedAmount: receivedAmt,
              depositAmount: depositAmt,
              updatedAt: new Date().toISOString().slice(0, 10)
            }
          : d
      );
      if (receivedChanged && Number(receivedAmt) > 0) {
        const updatedDeposit = depositRecords.value.find((d) => d.id === deposit.id);
        logEvent({
          entityType: 'deposit',
          entityId: deposit.id,
          entityName: deposit.gearName,
          action: 'confirm',
          beforeState: beforeDeposit,
          afterState: updatedDeposit,
          relatedEntityType: 'handover',
          relatedEntityId: borrowHandover.id,
          relatedEntityName: borrowHandover.gearName,
          notes: `借出交接确认，已收取押金 ¥${receivedAmt}（借用人：${borrowHandover.borrower}）`
        });
      }
      updateDepositStatus(deposit.id);
    }
  }

  if (returnHandover && returnHandover.ownerConfirmed && returnHandover.borrowerConfirmed) {
    const req = requests.value.find((r) => r.id === requestId);
    if (req) {
      const oldReturn = handoverRecords.value.find((h) => h.id === returnHandover.id);
      if (!oldReturn?._completionLogged) {
        logEvent({
          entityType: 'handover',
          entityId: returnHandover.id,
          entityName: returnHandover.gearName,
          action: 'confirm',
          beforeState: returnHandover,
          afterState: { ...returnHandover, ownerConfirmed: true, borrowerConfirmed: true },
          relatedEntityType: 'request',
          relatedEntityId: requestId,
          relatedEntityName: returnHandover.gearName,
          notes: `归还交接已由主人「${returnHandover.owner}」和借用人「${returnHandover.borrower}」双方确认`
        });
        handoverRecords.value = handoverRecords.value.map((h) =>
          h.id === returnHandover.id ? { ...h, _completionLogged: true } : h
        );
      }
      requests.value = requests.value.map((item) =>
        item.id === requestId
          ? { ...item, status: '已归还', damage: returnHandover.damageRecord || '无' }
          : item
      );
      gears.value = gears.value.map((gear) =>
        gear.id === req.gearId
          ? { ...gear, status: '可借', damage: returnHandover.damageRecord || '无' }
          : gear
      );
      triggerReservationCheck();
    }
  }
}

function toggleHandoverConfirm(role) {
  if (role === 'owner') {
    handoverForm.value.ownerConfirmed = !handoverForm.value.ownerConfirmed;
  } else {
    handoverForm.value.borrowerConfirmed = !handoverForm.value.borrowerConfirmed;
  }
}

function closeHandoverModal() {
  showHandoverModal.value = false;
  handoverForm.value = {
    type: '借出',
    requestId: '',
    gearId: '',
    gearName: '',
    owner: '',
    borrower: '',
    gearStatus: '',
    deposit: '',
    accessories: '',
    handoverNotes: '',
    damageRecord: '',
    deductAmount: '',
    deductReason: '',
    ownerConfirmed: false,
    borrowerConfirmed: false
  };
  currentHandoverId.value = null;
}

const handoverStatusList = computed(() => ['全部交接单', '待确认', '已完成']);
const handoverTypeList = computed(() => ['全部类型', '借出', '归还']);

const filteredHandovers = computed(() => {
  return handoverRecords.value.filter((h) => {
    const typeMatch = handoverTypeFilter.value === '全部类型' || h.type === handoverTypeFilter.value;
    const isCompleted = h.ownerConfirmed && h.borrowerConfirmed;
    const statusMatch = handoverFilter.value === '全部交接单'
      || (handoverFilter.value === '待确认' && !isCompleted)
      || (handoverFilter.value === '已完成' && isCompleted);
    return typeMatch && statusMatch;
  });
});

const handoverCount = computed(() => handoverRecords.value.length);

function getHandoverStatus(handover) {
  if (handover.ownerConfirmed && handover.borrowerConfirmed) return '已完成';
  if (handover.ownerConfirmed || handover.borrowerConfirmed) return '部分确认';
  return '待确认';
}

function viewHandover(handoverId) {
  const handover = handoverRecords.value.find((h) => h.id === handoverId);
  if (!handover) return;
  handoverForm.value = { ...handover };
  currentHandoverId.value = handoverId;
  handoverModalMode.value = handover.type;
  showHandoverModal.value = true;
}

function findConflictingRequests(gearId, startDate, endDate, excludeId = null) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return requests.value.filter((req) => {
    if (excludeId && req.id === excludeId) return false;
    if (req.gearId !== gearId) return false;
    if (req.status !== '待处理' && req.status !== '已同意') return false;
    const reqStart = new Date(req.start);
    const reqEnd = new Date(req.end);
    return start <= reqEnd && end >= reqStart;
  });
}

const categories = computed(() => ['全部分类', ...new Set(gears.value.map((gear) => gear.category))]);
const filteredGears = computed(() => gears.value.filter((gear) => category.value === '全部分类' || gear.category === category.value));
const requestList = computed(() => requests.value.filter((item) => requestFilter.value === '全部申请' || item.status === requestFilter.value));
const myOut = computed(() => requests.value.filter((item) => item.owner === currentUser.value));
const myIn = computed(() => requests.value.filter((item) => item.borrower === currentUser.value));

const myGears = computed(() => gears.value.filter((gear) => gear.owner === currentUser.value));
const validMaintenanceRecords = computed(() =>
  maintenanceRecords.value.filter((r) => gears.value.some((g) => g.id === r.gearId))
);
const maintenanceGearOptions = computed(() => ['全部装备', ...new Set(validMaintenanceRecords.value.map((r) => r.gearName))]);
const filteredMaintenance = computed(() => {
  return maintenanceFilter.value === '全部装备'
    ? validMaintenanceRecords.value
    : validMaintenanceRecords.value.filter((r) => r.gearName === maintenanceFilter.value);
});
const lastMaintenanceByGear = computed(() => {
  const map = {};
  for (const record of validMaintenanceRecords.value) {
    if (!map[record.gearId] || record.date > map[record.gearId].date) {
      map[record.gearId] = record;
    }
  }
  return map;
});
const maintenanceCount = computed(() => validMaintenanceRecords.value.length);

const lastInventoryByGear = computed(() => {
  const map = {};
  for (const list of inventoryLists.value) {
    for (const item of list.items) {
      if (!item.gearId) continue;
      if (!map[item.gearId] || list.date > map[item.gearId].date) {
        map[item.gearId] = {
          inventoryId: list.id,
          inventoryName: list.name,
          date: list.date,
          type: list.type,
          checkStatus: item.checkStatus,
          missingAccessories: item.missingAccessories,
          notes: item.notes,
          checker: item.checker || list.checker
        };
      }
    }
  }
  return map;
});

const selectedTrip = computed(() => trips.value.find((t) => t.id === selectedTripId.value));
const pendingGears = computed(() => selectedTrip.value ? selectedTrip.value.gears.filter((g) => g.status === '待借') : []);
const waitingGears = computed(() => selectedTrip.value ? selectedTrip.value.gears.filter((g) => g.status === '待确认') : []);
const confirmedGears = computed(() => selectedTrip.value ? selectedTrip.value.gears.filter((g) => g.status === '已确认') : []);
const tripCategories = computed(() => ['全部分类', ...new Set(gears.value.map((gear) => gear.category))]);
const tripFilteredGears = computed(() => gears.value.filter((gear) => tripCategoryFilter.value === '全部分类' || gear.category === tripCategoryFilter.value));
const upcomingTrips = computed(() => trips.value.filter((t) => new Date(t.startDate) >= new Date(iso(0))));
const tripsCount = computed(() => trips.value.length);

const weekDates = computed(() => {
  const dates = [];
  const start = new Date(calendarWeekStart.value);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
});
const calendarGearOptions = computed(() => {
  const map = new Map();
  for (const r of requests.value) {
    if (!r.gearId) continue;
    if (r.status === '已拒绝' || r.status === '已归还') continue;
    if (!map.has(r.gearId)) {
      map.set(r.gearId, { gearId: r.gearId, gearName: r.gearName || '未知装备', owner: r.owner || '' });
    }
  }
  const items = Array.from(map.values()).map((g) => ({
    value: g.gearId,
    label: g.owner ? `${g.gearName}（${g.owner}）` : g.gearName
  }));
  return [{ value: '全部', label: '全部' }, ...items];
});
const calendarMemberOptions = computed(() => ['全部', ...members.value.map((m) => m.nickname)]);
const calendarRows = computed(() => {
  if (calendarViewMode.value === '按装备') {
    const map = new Map();
    const sourceReqs = requests.value.filter((r) => r.status !== '已拒绝' && r.status !== '已归还');
    for (const r of sourceReqs) {
      if (!r.gearId) continue;
      if (calendarFilterValue.value !== '全部' && r.gearId !== calendarFilterValue.value) continue;
      if (!map.has(r.gearId)) {
        const label = r.owner ? `${r.gearName || '未知装备'}（${r.owner}）` : (r.gearName || '未知装备');
        map.set(r.gearId, { key: r.gearId, label, type: 'gear' });
      }
    }
    return Array.from(map.values());
  } else {
    const memberNames = calendarFilterValue.value === '全部'
      ? members.value.map((m) => m.nickname)
      : [calendarFilterValue.value];
    return memberNames.map((name) => ({
      key: name,
      label: name,
      type: 'member'
    }));
  }
});
function getRequestsForCell(rowKey, rowType, dateStr) {
  const date = new Date(dateStr);
  return requests.value.filter((req) => {
    if (req.status === '已拒绝' || req.status === '已归还') return false;
    if (rowType === 'gear' && req.gearId !== rowKey) return false;
    if (rowType === 'member' && req.borrower !== rowKey) return false;
    const reqStart = new Date(req.start);
    const reqEnd = new Date(req.end);
    return date >= reqStart && date <= reqEnd;
  });
}
function shiftWeek(offset) {
  const d = new Date(calendarWeekStart.value);
  d.setDate(d.getDate() + offset * 7);
  calendarWeekStart.value = d.toISOString().slice(0, 10);
}
function resetWeekToToday() {
  calendarWeekStart.value = iso(0);
}

function isGearAvailable(gearId) {
  const gear = gears.value.find((g) => g.id === gearId);
  return gear ? gear.status === '可借' : false;
}

function getGearStatus(gearId) {
  const gear = gears.value.find((g) => g.id === gearId);
  return gear ? gear.status : '未知';
}

function getInventoryStatusLabel(status) {
  switch (status) {
    case '已盘点': return '✅ 已盘点';
    case '缺失': return '❌ 缺失';
    default: return '⭕ 待盘点';
  }
}

function toggleTripGearSelection(gearId) {
  const idx = tripGears.value.findIndex((g) => g.gearId === gearId);
  if (idx > -1) {
    tripGears.value.splice(idx, 1);
  } else {
    const gear = gears.value.find((g) => g.id === gearId);
    if (gear) {
      tripGears.value.push({
        gearId: gear.id,
        gearName: gear.name,
        owner: gear.owner,
        deposit: gear.deposit,
        status: '待借'
      });
    }
  }
}

function isGearSelected(gearId) {
  return tripGears.value.some((g) => g.gearId === gearId);
}

function saveTrip() {
  if (!tripForm.value.destination.trim()) return;
  if (tripForm.value.members.length === 0) {
    alert('请至少选择一位参与成员');
    return;
  }
  const newData = {
    destination: tripForm.value.destination.trim(),
    startDate: tripForm.value.startDate,
    members: [...tripForm.value.members],
    gears: [...tripGears.value],
    notes: tripForm.value.notes
  };

  if (editingTripId.value) {
    const oldTrip = trips.value.find((t) => t.id === editingTripId.value);
    const beforeState = oldTrip ? { ...oldTrip } : null;
    trips.value = trips.value.map((t) =>
      t.id === editingTripId.value ? { ...t, ...newData } : t
    );
    if (beforeState) {
      logEvent({
        entityType: 'trip',
        entityId: editingTripId.value,
        entityName: beforeState.destination,
        action: 'update',
        beforeState,
        afterState: { ...oldTrip, ...newData },
        notes: `更新出行计划「${newData.destination}」`
      });
    }
    if (selectedTripId.value === editingTripId.value) {
      selectedTripId.value = editingTripId.value;
    }
    editingTripId.value = null;
  } else {
    const newTrip = {
      id: crypto.randomUUID(),
      ...newData
    };
    trips.value = [newTrip, ...trips.value];
    selectedTripId.value = newTrip.id;
    logEvent({
      entityType: 'trip',
      entityId: newTrip.id,
      entityName: newTrip.destination,
      action: 'create',
      afterState: newTrip,
      notes: `创建出行计划「${newTrip.destination}」（${newTrip.members.length}人参加）`
    });
  }
  resetTripForm();
}

function resetTripForm() {
  tripForm.value = { destination: '', startDate: iso(7), members: [], notes: '' };
  tripGears.value = [];
  editingTripId.value = null;
}

function editTrip(trip) {
  editingTripId.value = trip.id;
  tripForm.value = {
    destination: trip.destination,
    startDate: trip.startDate,
    members: [...trip.members],
    notes: trip.notes || ''
  };
  tripGears.value = trip.gears.map((g) => ({ ...g }));
}

function cancelEditTrip() {
  resetTripForm();
}

function deleteTrip(trip) {
  if (!confirm(`确定删除出行计划「${trip.destination}」吗？`)) return;
  logEvent({
    entityType: 'trip',
    entityId: trip.id,
    entityName: trip.destination,
    action: 'delete',
    beforeState: trip,
    notes: `删除出行计划「${trip.destination}」（${trip.members.length}人）`
  });
  trips.value = trips.value.filter((t) => t.id !== trip.id);
  settlementRecords.value = cleanupDeletedTrip(settlementRecords.value, trip.id);
  if (selectedTripId.value === trip.id) {
    selectedTripId.value = trips.value.length > 0 ? trips.value[0].id : null;
  }
}

function selectTrip(tripId) {
  selectedTripId.value = tripId;
}

function updateTripGearStatus(gearId, status) {
  if (!selectedTrip.value) return;
  const oldGear = selectedTrip.value.gears.find((g) => g.gearId === gearId);
  const beforeState = oldGear ? { ...oldGear } : null;
  trips.value = trips.value.map((t) =>
    t.id === selectedTrip.value.id
      ? {
          ...t,
          gears: t.gears.map((g) => (g.gearId === gearId ? { ...g, status } : g))
        }
      : t
  );
  if (beforeState && beforeState.status !== status) {
    const gear = gears.value.find((g) => g.id === gearId);
    logEvent({
      entityType: 'trip',
      entityId: selectedTrip.value.id,
      entityName: selectedTrip.value.destination,
      action: 'update',
      beforeState: { gear: beforeState },
      afterState: { gear: { ...beforeState, status } },
      relatedEntityType: 'gear',
      relatedEntityId: gearId,
      relatedEntityName: gear?.name || beforeState.name,
      notes: `更新出行计划装备状态：${gear?.name || beforeState.name} 从「${beforeState.status}」改为「${status}」`
    });
  }
}

function removeTripGear(gearId) {
  if (!selectedTrip.value) return;
  if (!confirm('确定从清单中移除该装备吗？')) return;
  const oldGear = selectedTrip.value.gears.find((g) => g.gearId === gearId);
  trips.value = trips.value.map((t) =>
    t.id === selectedTrip.value.id
      ? {
          ...t,
          gears: t.gears.filter((g) => g.gearId !== gearId)
        }
      : t
  );
  if (oldGear) {
    const gear = gears.value.find((g) => g.id === gearId);
    logEvent({
      entityType: 'trip',
      entityId: selectedTrip.value.id,
      entityName: selectedTrip.value.destination,
      action: 'update',
      beforeState: { removedGear: oldGear },
      relatedEntityType: 'gear',
      relatedEntityId: gearId,
      relatedEntityName: gear?.name || oldGear.name,
      notes: `从出行计划中移除装备：${gear?.name || oldGear.name}`
    });
  }
}

function addGear() {
  if (!form.value.name.trim()) return;
  
  if (editingGearId.value) {
    const oldGear = gears.value.find((g) => g.id === editingGearId.value);
    if (!oldGear) return;
    const beforeState = { ...oldGear };
    const newGear = {
      ...oldGear,
      name: form.value.name.trim(),
      category: form.value.category,
      owner: form.value.owner,
      available: form.value.available,
      deposit: form.value.deposit,
      status: form.value.status,
      notes: form.value.notes,
      maintenanceCycleDays: form.value.maintenanceCycleDays,
      nextMaintenanceDate: form.value.nextMaintenanceDate,
      maintenanceReminderLevel: form.value.maintenanceReminderLevel
    };
    gears.value = gears.value.map((g) => (g.id === editingGearId.value ? newGear : g));
    
    const isRename = beforeState.name !== newGear.name;
    logEvent({
      entityType: 'gear',
      entityId: editingGearId.value,
      entityName: newGear.name,
      action: isRename ? 'rename' : 'update',
      beforeState,
      afterState: newGear,
      notes: isRename
        ? `装备「${beforeState.name}」改名为「${newGear.name}」`
        : `更新装备信息：${newGear.name}`
    });
    
    editingGearId.value = null;
  } else {
    const newGear = { id: crypto.randomUUID(), ...form.value, damage: '' };
    gears.value = [newGear, ...gears.value];
    logEvent({
      entityType: 'gear',
      entityId: newGear.id,
      entityName: newGear.name,
      action: 'create',
      afterState: newGear,
      notes: `登记新装备「${newGear.name}」（${newGear.category}）`
    });
  }
  
  form.value = { name: '', category: '帐篷天幕', owner: currentUser.value, available: iso(2), deposit: '100', status: '可借', notes: '', maintenanceCycleDays: 30, nextMaintenanceDate: iso(30), maintenanceReminderLevel: '标准' };
}

function editGear(gear) {
  editingGearId.value = gear.id;
  form.value = {
    name: gear.name,
    category: gear.category,
    owner: gear.owner,
    available: gear.available,
    deposit: gear.deposit,
    status: gear.status,
    notes: gear.notes,
    maintenanceCycleDays: gear.maintenanceCycleDays || 30,
    nextMaintenanceDate: gear.nextMaintenanceDate || iso(30),
    maintenanceReminderLevel: gear.maintenanceReminderLevel || '标准'
  };
}

function cancelEditGear() {
  editingGearId.value = null;
  form.value = { name: '', category: '帐篷天幕', owner: currentUser.value, available: iso(2), deposit: '100', status: '可借', notes: '', maintenanceCycleDays: 30, nextMaintenanceDate: iso(30), maintenanceReminderLevel: '标准' };
}

function deleteGear(gear) {
  const gearName = gear.name;
  const relatedRequests = requests.value.filter((r) => r.gearId === gear.id || r.gearName === gearName);
  const relatedHandovers = handoverRecords.value.filter((h) => h.gearId === gear.id || h.gearName === gearName);
  const relatedDeposits = depositRecords.value.filter((d) => d.gearId === gear.id || d.gearName === gearName);
  const relatedMaintenance = maintenanceRecords.value.filter((r) => r.gearId === gear.id);
  const relatedTrips = trips.value.filter((t) => t.gears.some((g) => g.gearId === gear.id));
  const relatedReservations = reservations.value.filter((r) => r.gearId === gear.id);
  const relatedInventoryItems = [];
  inventoryLists.value.forEach((inv) => {
    inv.items?.forEach((item) => {
      if (item.gearId === gear.id) relatedInventoryItems.push({ inventory: inv.name, item });
    });
  });

  const hasRelations = relatedRequests.length > 0 || relatedHandovers.length > 0
    || relatedDeposits.length > 0 || relatedMaintenance.length > 0
    || relatedTrips.length > 0 || relatedReservations.length > 0
    || relatedInventoryItems.length > 0;

  let confirmMessage = `确定删除装备「${gearName}」吗？`;
  if (hasRelations) {
    const parts = [];
    if (relatedRequests.length > 0) parts.push(`申请${relatedRequests.length}条`);
    if (relatedHandovers.length > 0) parts.push(`交接${relatedHandovers.length}条`);
    if (relatedDeposits.length > 0) parts.push(`押金${relatedDeposits.length}条`);
    if (relatedMaintenance.length > 0) parts.push(`保养${relatedMaintenance.length}条`);
    if (relatedTrips.length > 0) parts.push(`出行${relatedTrips.length}个`);
    if (relatedReservations.length > 0) parts.push(`候补${relatedReservations.length}条`);
    if (relatedInventoryItems.length > 0) parts.push(`盘点项${relatedInventoryItems.length}个`);
    confirmMessage = `装备「${gearName}」存在关联数据（${parts.join('、')}），删除后关联记录将保留但无法匹配。确定删除吗？`;
  }

  if (!confirm(confirmMessage)) return;

  const beforeState = { ...gear };
  gears.value = gears.value.filter((g) => g.id !== gear.id);

  logEvent({
    entityType: 'gear',
    entityId: gear.id,
    entityName: gearName,
    action: 'delete',
    beforeState,
    afterState: null,
    notes: hasRelations
      ? `删除装备「${gearName}」（存在关联数据）`
      : `删除装备「${gearName}」`
  });

  if (editingGearId.value === gear.id) {
    cancelEditGear();
  }
}

const editingDraftId = ref(null);

function applyGear() {
  const gear = gears.value.find((item) => item.id === requestForm.value.gearId);
  if (!gear || !requestForm.value.borrower) return;
  if (!requestForm.value.start || !requestForm.value.end) {
    alert('请选择借用起止日期');
    return;
  }
  if (new Date(requestForm.value.end) < new Date(requestForm.value.start)) {
    alert('归还日期不能早于借用日期');
    return;
  }
  const conflicts = findConflictingRequests(gear.id, requestForm.value.start, requestForm.value.end, editingDraftId.value);
  if (conflicts.length > 0) {
    conflictDetails.value = conflicts;
    conflictWarning.value = `该装备在所选日期范围内存在 ${conflicts.length} 条冲突记录，请调整日期后再提交。`;
    return;
  }
  conflictWarning.value = '';
  conflictDetails.value = [];

  if (editingDraftId.value) {
    const oldReq = requests.value.find((r) => r.id === editingDraftId.value);
    const beforeState = oldReq ? { ...oldReq } : null;
    const newReq = { ...oldReq, ...requestForm.value, gearId: gear.id, gearName: gear.name, owner: gear.owner, status: '待处理' };
    requests.value = requests.value.map((item) =>
      item.id === editingDraftId.value ? newReq : item
    );
    logEvent({
      entityType: 'request',
      entityId: editingDraftId.value,
      entityName: gear.name,
      action: 'create',
      beforeState,
      afterState: newReq,
      relatedEntityType: 'gear',
      relatedEntityId: gear.id,
      relatedEntityName: gear.name,
      notes: `草稿提交为借用申请（借用人：${requestForm.value.borrower}，${requestForm.value.start}~${requestForm.value.end}）`
    });
    editingDraftId.value = null;
    alert('草稿已提交');
  } else {
    const newReq = { id: crypto.randomUUID(), gearId: gear.id, gearName: gear.name, owner: gear.owner, status: '待处理', damage: '', ...requestForm.value };
    requests.value = [newReq, ...requests.value];
    logEvent({
      entityType: 'request',
      entityId: newReq.id,
      entityName: gear.name,
      action: 'create',
      afterState: newReq,
      relatedEntityType: 'gear',
      relatedEntityId: gear.id,
      relatedEntityName: gear.name,
      notes: `提交借用申请（借用人：${newReq.borrower}，${newReq.start}~${newReq.end}）`
    });
  }
  requestForm.value = { gearId: '', borrower: currentUser.value, start: iso(2), end: iso(4), reason: '' };
}

function saveDraft() {
  const gear = gears.value.find((item) => item.id === requestForm.value.gearId);
  if (!gear || !requestForm.value.borrower) return;
  if (editingDraftId.value) {
    const oldReq = requests.value.find((r) => r.id === editingDraftId.value);
    const beforeState = oldReq ? { ...oldReq } : null;
    requests.value = requests.value.map((item) =>
      item.id === editingDraftId.value
        ? { ...item, ...requestForm.value, gearId: gear.id, gearName: gear.name, owner: gear.owner }
        : item
    );
    if (beforeState) {
      logEvent({
        entityType: 'request',
        entityId: editingDraftId.value,
        entityName: gear.name,
        action: 'update',
        beforeState,
        afterState: { ...beforeState, ...requestForm.value, gearId: gear.id, gearName: gear.name, owner: gear.owner },
        relatedEntityType: 'gear',
        relatedEntityId: gear.id,
        relatedEntityName: gear.name,
        notes: `更新借用草稿（借用人：${requestForm.value.borrower}）`
      });
    }
    editingDraftId.value = null;
    alert('草稿已更新');
  } else {
    const newReq = { id: crypto.randomUUID(), gearId: gear.id, gearName: gear.name, owner: gear.owner, status: '草稿', damage: '', ...requestForm.value };
    requests.value = [newReq, ...requests.value];
    logEvent({
      entityType: 'request',
      entityId: newReq.id,
      entityName: gear.name,
      action: 'create',
      afterState: newReq,
      relatedEntityType: 'gear',
      relatedEntityId: gear.id,
      relatedEntityName: gear.name,
      notes: `保存借用草稿（借用人：${newReq.borrower}，${newReq.start}~${newReq.end}）`
    });
    alert('草稿已保存');
  }
  requestForm.value = { gearId: '', borrower: currentUser.value, start: iso(2), end: iso(4), reason: '' };
}

function cancelEditDraft() {
  editingDraftId.value = null;
  requestForm.value = { gearId: '', borrower: currentUser.value, start: iso(2), end: iso(4), reason: '' };
}

function dismissConflictWarning() {
  conflictWarning.value = '';
  conflictDetails.value = [];
}

function updateRequest(id, status) {
  const record = requests.value.find((item) => item.id === id);
  if (!record) return;
  const beforeState = { ...record };
  requests.value = requests.value.map((item) => item.id === id ? { ...item, status } : item);

  if (status === '已同意') {
    logEvent({
      entityType: 'request',
      entityId: record.id,
      entityName: record.gearName,
      action: 'approve',
      beforeState,
      afterState: { ...record, status },
      relatedEntityType: 'gear',
      relatedEntityId: record.gearId,
      relatedEntityName: record.gearName,
      notes: `借用人「${record.borrower}」的借用申请已同意`
    });
  } else if (status === '已拒绝') {
    logEvent({
      entityType: 'request',
      entityId: record.id,
      entityName: record.gearName,
      action: 'reject',
      beforeState,
      afterState: { ...record, status },
      relatedEntityType: 'gear',
      relatedEntityId: record.gearId,
      relatedEntityName: record.gearName,
      notes: `借用人「${record.borrower}」的借用申请已拒绝`
    });
  } else if (status === '已归还') {
    logEvent({
      entityType: 'request',
      entityId: record.id,
      entityName: record.gearName,
      action: 'complete',
      beforeState,
      afterState: { ...record, status },
      relatedEntityType: 'gear',
      relatedEntityId: record.gearId,
      relatedEntityName: record.gearName,
      notes: `借用人「${record.borrower}」已归还装备`
    });
  }

  if (record && status === '已同意') {
    gears.value = gears.value.map((gear) => gear.id === record.gearId ? { ...gear, status: '借出中' } : gear);
    const existingDeposit = getDepositByRequest(record.id);
    if (!existingDeposit) {
      const newDeposit = createDepositRecord(record.id);
      if (newDeposit) {
        depositRecords.value = [newDeposit, ...depositRecords.value];
        logEvent({
          entityType: 'deposit',
          entityId: newDeposit.id,
          entityName: newDeposit.gearName,
          action: 'create',
          afterState: newDeposit,
          relatedEntityType: 'request',
          relatedEntityId: record.id,
          relatedEntityName: record.gearName,
          notes: `为申请「${record.gearName} - ${record.borrower}」自动创建押金记录`
        });
      }
    }
  }
  if (record && (status === '已拒绝' || status === '已归还')) {
    triggerReservationCheck();
  }
}

function submitDraft(id) {
  const record = requests.value.find((item) => item.id === id);
  if (!record) return;
  const gear = gears.value.find((g) => g.id === record.gearId);
  if (!gear || gear.status !== '可借') {
    alert('该装备当前不可借，无法提交申请');
    return;
  }
  if (!record.start || !record.end) {
    alert('请先编辑草稿，补充借用起止日期');
    return;
  }
  if (new Date(record.end) < new Date(record.start)) {
    alert('归还日期不能早于借用日期');
    return;
  }
  const conflicts = findConflictingRequests(gear.id, record.start, record.end, id);
  if (conflicts.length > 0) {
    alert(`该装备在所选日期范围内存在 ${conflicts.length} 条冲突记录，请调整日期后再提交。`);
    return;
  }
  updateRequest(id, '待处理');
}

function editDraft(id) {
  const record = requests.value.find((item) => item.id === id);
  if (!record) return;
  editingDraftId.value = id;
  requestForm.value = {
    gearId: record.gearId,
    borrower: record.borrower,
    start: record.start,
    end: record.end,
    reason: record.reason
  };
  tab.value = '申请列表';
}

function deleteRequest(id) {
  const record = requests.value.find((item) => item.id === id);
  if (!record) return;
  if (!confirm(`确定删除${record.status === '草稿' ? '草稿' : '申请'}「${record.gearName}」吗？`)) return;
  logEvent({
    entityType: 'request',
    entityId: record.id,
    entityName: record.gearName,
    action: 'delete',
    beforeState: record,
    relatedEntityType: 'gear',
    relatedEntityId: record.gearId,
    relatedEntityName: record.gearName,
    notes: `删除${record.status === '草稿' ? '草稿' : '申请'}（借用人：${record.borrower}）`
  });
  requests.value = requests.value.filter((item) => item.id !== id);
  if (editingDraftId.value === id) {
    editingDraftId.value = null;
    requestForm.value = { gearId: '', borrower: currentUser.value, start: iso(2), end: iso(4), reason: '' };
  }
}

function getBorrowHandover(requestId) {
  return handoverRecords.value.find((h) => h.requestId === requestId && h.type === '借出');
}

function getReturnHandover(requestId) {
  return handoverRecords.value.find((h) => h.requestId === requestId && h.type === '归还');
}

function isHandoverCompleted(requestId, type) {
  const handover = handoverRecords.value.find((h) => h.requestId === requestId && h.type === type);
  return handover && handover.ownerConfirmed && handover.borrowerConfirmed;
}

function saveMember() {
  if (!memberForm.value.nickname.trim()) return;
  if (editingMemberId.value) {
    const oldMember = members.value.find((m) => m.id === editingMemberId.value);
    if (!oldMember) return;
    const oldNickname = oldMember.nickname;
    const newNickname = memberForm.value.nickname.trim();
    const newMember = {
      ...oldMember,
      nickname: newNickname,
      phone: memberForm.value.phone,
      area: memberForm.value.area,
      notes: memberForm.value.notes
    };
    members.value = members.value.map((m) =>
      m.id === editingMemberId.value ? newMember : m
    );

    const isRename = oldNickname !== newNickname;
    if (isRename) {
      logEvent({
        entityType: 'member',
        entityId: oldMember.id,
        entityName: newNickname,
        action: 'rename',
        beforeState: oldMember,
        afterState: newMember,
        notes: `成员「${oldNickname}」改名为「${newNickname}」，已同步更新关联数据`
      });
      gears.value = gears.value.map((g) => g.owner === oldNickname ? { ...g, owner: newNickname } : g);
      requests.value = requests.value.map((r) => ({
        ...r,
        owner: r.owner === oldNickname ? newNickname : r.owner,
        borrower: r.borrower === oldNickname ? newNickname : r.borrower
      }));
      maintenanceRecords.value = maintenanceRecords.value.map((r) => ({
        ...r,
        owner: r.owner === oldNickname ? newNickname : r.owner,
        handler: r.handler === oldNickname ? newNickname : r.handler
      }));
      trips.value = trips.value.map((t) => ({
        ...t,
        members: t.members.map((m) => m === oldNickname ? newNickname : m),
        gears: t.gears.map((g) => g.owner === oldNickname ? { ...g, owner: newNickname } : g)
      }));
      settlementRecords.value = propagateMemberRename(settlementRecords.value, oldNickname, newNickname);
      if (currentUser.value === oldNickname) currentUser.value = newNickname;
      if (form.value.owner === oldNickname) form.value.owner = newNickname;
      if (requestForm.value.borrower === oldNickname) requestForm.value.borrower = newNickname;
    } else {
      const hasChange = oldMember.phone !== newMember.phone || oldMember.area !== newMember.area || oldMember.notes !== newMember.notes;
      if (hasChange) {
        logEvent({
          entityType: 'member',
          entityId: oldMember.id,
          entityName: newNickname,
          action: 'update',
          beforeState: oldMember,
          afterState: newMember
        });
      }
    }
    editingMemberId.value = null;
  } else {
    const newMember = {
      id: crypto.randomUUID(),
      nickname: memberForm.value.nickname.trim(),
      phone: memberForm.value.phone,
      area: memberForm.value.area,
      notes: memberForm.value.notes
    };
    members.value = [newMember, ...members.value];
    logEvent({
      entityType: 'member',
      entityId: newMember.id,
      entityName: newMember.nickname,
      action: 'create',
      afterState: newMember
    });
  }
  memberForm.value = { nickname: '', phone: '', area: '', notes: '' };
}

function editMember(member) {
  editingMemberId.value = member.id;
  memberForm.value = { nickname: member.nickname, phone: member.phone, area: member.area, notes: member.notes };
}

function cancelEditMember() {
  editingMemberId.value = null;
  memberForm.value = { nickname: '', phone: '', area: '', notes: '' };
}

function deleteMember(member) {
  const nickname = member.nickname;
  const gearCount = gears.value.filter((g) => g.owner === nickname).length;
  const borrowCount = requests.value.filter((r) => r.borrower === nickname).length;
  const ownCount = requests.value.filter((r) => r.owner === nickname).length;
  const maintenanceOwnerCount = maintenanceRecords.value.filter((r) => r.owner === nickname).length;
  const maintenanceHandlerCount = maintenanceRecords.value.filter((r) => r.handler === nickname).length;
  const tripMemberCount = trips.value.filter((t) => t.members.includes(nickname)).length;
  const tripGearOwnerCount = trips.value.filter((t) => t.gears.some((g) => g.owner === nickname)).length;
  const settlementMemberCount = settlementRecords.value.filter((s) => s.members.some((sm) => sm.nickname === nickname)).length;
  const settlementPayerCount = settlementRecords.value.filter((s) => (s.extraExpenses || []).some((e) => e.paidBy === nickname)).length;
  if (gearCount > 0 || borrowCount > 0 || ownCount > 0 || maintenanceOwnerCount > 0 || maintenanceHandlerCount > 0 || tripMemberCount > 0 || tripGearOwnerCount > 0 || settlementMemberCount > 0 || settlementPayerCount > 0) {
    const reasons = [];
    if (gearCount > 0) reasons.push(`${gearCount}件登记装备`);
    if (ownCount > 0) reasons.push(`${ownCount}条作为出借人的申请`);
    if (borrowCount > 0) reasons.push(`${borrowCount}条作为借用人的申请`);
    if (maintenanceOwnerCount > 0) reasons.push(`${maintenanceOwnerCount}条装备保养记录`);
    if (maintenanceHandlerCount > 0) reasons.push(`${maintenanceHandlerCount}条作为处理人的保养记录`);
    if (tripMemberCount > 0) reasons.push(`${tripMemberCount}个出行计划的参与成员`);
    if (tripGearOwnerCount > 0) reasons.push(`${tripGearOwnerCount}个出行计划的装备主人`);
    if (settlementMemberCount > 0) reasons.push(`${settlementMemberCount}份结算单的参与成员`);
    if (settlementPayerCount > 0) reasons.push(`${settlementPayerCount}份结算单的费用垫付人`);
    deleteWarning.value = `无法删除「${nickname}」：该成员关联了${reasons.join('、')}，请先处理关联数据。`;
    return;
  }
  logEvent({
    entityType: 'member',
    entityId: member.id,
    entityName: nickname,
    action: 'delete',
    beforeState: member,
    notes: '删除成员'
  });
  members.value = members.value.filter((m) => m.id !== member.id);
  if (currentUser.value === nickname && members.value.length > 0) {
    currentUser.value = members.value[0].nickname;
  }
  deleteWarning.value = '';
}

function dismissWarning() {
  deleteWarning.value = '';
}

function addMaintenance() {
  const gear = gears.value.find((g) => g.id === maintenanceForm.value.gearId);
  if (!gear) return;
  if (gear.owner !== currentUser.value) {
    alert('仅装备主人可登记保养记录');
    return;
  }
  const handler = maintenanceForm.value.handler.trim() || currentUser.value;
  const newRecord = {
    id: crypto.randomUUID(),
    gearId: gear.id,
    gearName: gear.name,
    owner: gear.owner,
    date: maintenanceForm.value.date,
    type: maintenanceForm.value.type,
    description: maintenanceForm.value.description,
    handler
  };
  maintenanceRecords.value = [newRecord, ...maintenanceRecords.value];
  logEvent({
    entityType: 'maintenance',
    entityId: newRecord.id,
    entityName: newRecord.gearName,
    action: 'create',
    afterState: newRecord,
    relatedEntityType: 'gear',
    relatedEntityId: gear.id,
    relatedEntityName: gear.name,
    notes: `登记保养记录「${newRecord.type}」：${newRecord.description || '无描述'}`
  });
  maintenanceForm.value = { gearId: '', date: iso(0), type: '清洁', description: '', handler: '' };
}

function handleCreateMaintenanceFromProfile({ gearId, type }) {
  const gear = gears.value.find((g) => g.id === gearId);
  if (!gear) return;
  if (gear.owner !== currentUser.value) {
    alert('仅装备主人可登记保养记录');
    return;
  }
  const cycle = Number(gear.maintenanceCycleDays) || 30;
  const nextDate = iso(cycle);
  const handler = currentUser.value;
  const description = `根据保养计划执行的${type}保养，周期${cycle}天。`;

  const newRecord = {
    id: crypto.randomUUID(),
    gearId: gear.id,
    gearName: gear.name,
    owner: gear.owner,
    date: iso(0),
    type: type || '检查',
    description,
    handler
  };
  maintenanceRecords.value = [newRecord, ...maintenanceRecords.value];
  logEvent({
    entityType: 'maintenance',
    entityId: newRecord.id,
    entityName: newRecord.gearName,
    action: 'create',
    afterState: newRecord,
    relatedEntityType: 'gear',
    relatedEntityId: gear.id,
    relatedEntityName: gear.name,
    notes: `按保养计划自动创建「${newRecord.type}」记录，周期${cycle}天`
  });

  const beforeGear = { ...gear };
  gears.value = gears.value.map((g) =>
    g.id === gear.id
      ? { ...g, nextMaintenanceDate: nextDate }
      : g
  );
  logEvent({
    entityType: 'gear',
    entityId: gear.id,
    entityName: gear.name,
    action: 'update',
    beforeState: beforeGear,
    afterState: { ...gear, nextMaintenanceDate: nextDate },
    notes: `更新装备下次保养日期为 ${nextDate}`
  });

  alert(`已为「${gear.name}」创建保养记录，下次保养日期自动更新为 ${nextDate}`);
}

function handleProcessAbnormalAction({ action, item, inventoryId, inventoryName }) {
  if (!action || !item) return;

  if (action.type === '保养记录') {
    const gear = gears.value.find((g) => g.id === item.gearId);
    if (!gear) return;

    const recordId = crypto.randomUUID();
    const description = action.description
      ? `盘点异常处理：${action.description}（来源：${inventoryName}）`
      : `盘点异常触发的保养（来源：${inventoryName}）`;

    const newRecord = {
      id: recordId,
      gearId: gear.id,
      gearName: gear.name,
      owner: gear.owner,
      date: new Date().toISOString().slice(0, 10),
      type: '检查',
      description,
      handler: action.handler || currentUser.value
    };
    maintenanceRecords.value = [newRecord, ...maintenanceRecords.value];
    logEvent({
      entityType: 'maintenance',
      entityId: recordId,
      entityName: gear.name,
      action: 'create',
      afterState: newRecord,
      relatedEntityType: 'inventory',
      relatedEntityId: inventoryId,
      relatedEntityName: inventoryName,
      notes: `盘点「${inventoryName}」异常处理触发保养记录`
    });

    const cycle = Number(gear.maintenanceCycleDays) || 30;
    const beforeGear = { ...gear };
    gears.value = gears.value.map((g) =>
      g.id === gear.id
        ? { ...g, nextMaintenanceDate: iso(cycle) }
        : g
    );
    logEvent({
      entityType: 'gear',
      entityId: gear.id,
      entityName: gear.name,
      action: 'update',
      beforeState: beforeGear,
      afterState: { ...gear, nextMaintenanceDate: iso(cycle) },
      relatedEntityType: 'inventory',
      relatedEntityId: inventoryId,
      relatedEntityName: inventoryName,
      notes: `盘点后更新装备下次保养日期`
    });

    inventoryLists.value = inventoryLists.value.map((list) => {
      if (list.id !== inventoryId) return list;
      return {
        ...list,
        items: list.items.map((i) => {
          if (i.id !== item.id) return i;
          return {
            ...i,
            abnormalActions: (i.abnormalActions || []).map((a) =>
              a.id === action.id ? { ...a, relatedRecordId: recordId } : a
            )
          };
        })
      };
    });

    alert(`已为「${gear.name}」创建保养记录，下次保养日期已更新`);
  }

  if (action.type === '装备损耗') {
    const gear = gears.value.find((g) => g.id === item.gearId);
    if (!gear) return;
    const damageText = action.description || '盘点发现损耗';
    const existingDamage = (gear.damage || '').trim();
    const newDamage = existingDamage ? `${existingDamage}；${damageText}` : damageText;
    const beforeGear = { ...gear };
    gears.value = gears.value.map((g) =>
      g.id === gear.id
        ? { ...g, damage: newDamage }
        : g
    );
    logEvent({
      entityType: 'gear',
      entityId: gear.id,
      entityName: gear.name,
      action: 'update',
      beforeState: beforeGear,
      afterState: { ...gear, damage: newDamage },
      relatedEntityType: 'inventory',
      relatedEntityId: inventoryId,
      relatedEntityName: inventoryName,
      notes: `盘点「${inventoryName}」发现装备损耗：${damageText}`
    });
  }
}

function deleteMaintenance(id) {
  if (!confirm('确定删除该保养记录？')) return;
  const record = maintenanceRecords.value.find((r) => r.id === id);
  if (record) {
    logEvent({
      entityType: 'maintenance',
      entityId: record.id,
      entityName: record.gearName,
      action: 'delete',
      beforeState: record,
      relatedEntityType: 'gear',
      relatedEntityId: record.gearId,
      relatedEntityName: record.gearName,
      notes: `删除保养记录「${record.type}」：${record.description || '无描述'}`
    });
  }
  maintenanceRecords.value = maintenanceRecords.value.filter((r) => r.id !== id);
}

const recommendCategories = ['帐篷天幕', '炊具', '照明', '桌椅收纳', '安全急救'];

function getCategoryRequirements(scene, people, days, weather) {
  const tentCount = Math.ceil(people / 3);
  const lightCount = Math.max(1, Math.ceil(people / 2));
  const tableCount = Math.ceil(people / 4);
  const chairCount = people;
  const cookingCount = Math.max(1, Math.ceil(people / 3));
  const firstAidCount = 1;
  const storageCount = Math.max(1, Math.ceil(people / 3));

  const base = {
    '帐篷天幕': tentCount,
    '炊具': cookingCount,
    '照明': lightCount,
    '桌椅收纳': tableCount + chairCount + storageCount,
    '安全急救': firstAidCount
  };

  if (scene === '山地露营' || scene === '徒步露营') {
    base['安全急救'] = Math.max(2, firstAidCount + 1);
  }
  if (scene === '家庭亲子') {
    base['桌椅收纳'] += 2;
    base['安全急救'] += 1;
  }
  if (scene === '沙滩露营') {
    base['帐篷天幕'] += 1;
    base['照明'] += 1;
  }
  if (scene === '冬季露营') {
    base['炊具'] += 1;
    base['照明'] += 1;
  }
  if (days >= 3) {
    base['炊具'] += 1;
    base['照明'] += 1;
  }
  if (people >= 5) {
    base['桌椅收纳'] += 2;
  }

  if (weather === '小雨') {
    base['帐篷天幕'] += 1;
    base['安全急救'] += 1;
  }
  if (weather === '大风') {
    base['帐篷天幕'] += 1;
    base['桌椅收纳'] += 1;
  }
  if (weather === '高温') {
    base['照明'] += 1;
    base['安全急救'] += 1;
  }
  if (weather === '寒冷') {
    base['炊具'] += 1;
    base['安全急救'] += 1;
  }

  return base;
}

function scoreGearForRecommendation(gear, start, end) {
  let score = 0;
  const isBorrowable = gear.status === '可借';
  if (isBorrowable) score += 50;

  const conflicts = findConflictingRequests(gear.id, start, end);
  const conflictCount = conflicts.length;
  if (conflictCount === 0) score += 30;
  else score -= Math.min(conflictCount * 10, 20);

  const reservationCount = reservationHelper.getGearReservationCount(gear.id);
  score -= Math.min(reservationCount * 5, 15);

  const hasNotes = gear.notes && gear.notes.trim().length > 0;
  if (hasNotes) score += 5;

  return score;
}

function generateRecommendation() {
  const start = recommendStart.value;
  const end = recommendEnd.value;
  const requirements = getCategoryRequirements(
    recommendScene.value,
    recommendPeople.value,
    recommendDays.value,
    recommendWeather.value
  );
  const result = {};
  const gaps = [];

  for (const category of recommendCategories) {
    const needed = requirements[category] || 0;
    const categoryGears = gears.value.filter((g) => g.category === category);
    const scoredGears = categoryGears
      .map((gear) => ({
        gear,
        score: scoreGearForRecommendation(gear, start, end)
      }))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.gear);

    const recommended = scoredGears.slice(0, needed);
    const borrowableCount = categoryGears.filter((g) => g.status === '可借').length;
    const shortfall = needed - recommended.filter((g) => g.status === '可借').length;

    result[category] = {
      needed,
      available: borrowableCount,
      totalInCategory: categoryGears.length,
      recommended,
      shortfall: Math.max(0, shortfall),
      waitlistCandidates: scoredGears.slice(needed).filter((g) => g.status !== '可借' || findConflictingRequests(g.id, start, end).length > 0)
    };

    if (shortfall > 0) {
      gaps.push({
        category,
        needed,
        available: borrowableCount,
        shortfall,
        waitlistEligible: scoredGears.filter((g) => g.status !== '可借').length
      });
    }
  }

  recommendationResult.value = result;
  gapList.value = gaps;
  hasRecommended.value = true;
  selectedRecommendGears.value = [];
  travelPlanWaitlistGears.value = [];
  travelPlanResult.value = null;

  for (const category of recommendCategories) {
    for (const gear of result[category].recommended) {
      selectedRecommendGears.value.push(gear.id);
    }
  }

  refreshRecommendAvailability();
}

function isRecommendGearSelected(gearId) {
  return selectedRecommendGears.value.includes(gearId);
}

function toggleRecommendGearSelection(gearId) {
  const idx = selectedRecommendGears.value.findIndex((id) => id === gearId);
  if (idx > -1) {
    selectedRecommendGears.value.splice(idx, 1);
  } else {
    selectedRecommendGears.value.push(gearId);
  }
}

function getSelectedRecommendGearsCount() {
  return selectedRecommendGears.value.length;
}

function toggleRecommendMember(nickname) {
  const idx = recommendMembers.value.indexOf(nickname);
  if (idx > -1) {
    recommendMembers.value.splice(idx, 1);
  } else {
    recommendMembers.value.push(nickname);
  }
}

function addRecommendationToRequests() {
  if (selectedRecommendGears.value.length === 0) {
    alert('请至少选择一件装备');
    return;
  }
  const members = getEffectiveMembers();
  if (members.length === 0) {
    alert('请选择至少一位借用人');
    return;
  }
  if (!recommendStart.value || !recommendEnd.value) {
    alert('请选择借用起止日期');
    return;
  }
  if (new Date(recommendEnd.value) < new Date(recommendStart.value)) {
    alert('归还日期不能早于借用日期');
    return;
  }

  const primaryBorrower = members[0];
  let addedCount = 0;
  let skippedCount = 0;

  for (const gearId of selectedRecommendGears.value) {
    const gear = gears.value.find((g) => g.id === gearId);
    if (!gear || gear.status !== '可借') {
      skippedCount++;
      continue;
    }

    const conflicts = findConflictingRequests(gear.id, recommendStart.value, recommendEnd.value);
    if (conflicts.length > 0) {
      skippedCount++;
      continue;
    }

    requests.value = [{
      id: crypto.randomUUID(),
      gearId: gear.id,
      gearName: gear.name,
      owner: gear.owner,
      borrower: primaryBorrower,
      start: recommendStart.value,
      end: recommendEnd.value,
      status: '草稿',
      damage: '',
      reason: `${recommendScene.value}·${recommendWeather.value}·${recommendPeople.value}人·${recommendDays.value}天 套装推荐`
    }, ...requests.value];
    addedCount++;
  }

  if (addedCount > 0) {
    const skipMsg = skippedCount > 0 ? `，跳过 ${skippedCount} 件不可借或冲突装备` : '';
    alert(`已成功保存 ${addedCount} 条借用申请草稿${skipMsg}，请前往申请列表提交`);
    tab.value = '申请列表';
  } else {
    alert('没有可添加的可借装备，建议使用「一键生成出行方案」自动加入候补预约');
  }
}

const recommendAvailabilityMap = ref({});

function getRecommendGearAvailability(gearId, start, end) {
  const gear = gears.value.find((g) => g.id === gearId);
  if (!gear) return { status: 'unavailable', conflicts: [], reason: '装备不存在' };
  if (gear.status !== '可借') return { status: 'unavailable', conflicts: [], reason: gear.status };
  if (!start || !end) return { status: 'available', conflicts: [], reason: '' };
  const conflicts = findConflictingRequests(gearId, start, end);
  if (conflicts.length > 0) return { status: 'conflict', conflicts, reason: '日期冲突' };
  return { status: 'available', conflicts: [], reason: '' };
}

function refreshRecommendAvailability() {
  if (!hasRecommended.value) return;
  const map = {};
  for (const category of recommendCategories) {
    const recGears = recommendationResult.value[category]?.recommended || [];
    for (const gear of recGears) {
      map[gear.id] = getRecommendGearAvailability(gear.id, recommendStart.value, recommendEnd.value);
    }
  }
  recommendAvailabilityMap.value = map;
}

const travelPlanResult = ref(null);

function getEffectiveMembers() {
  if (recommendMembers.value && recommendMembers.value.length > 0) {
    return recommendMembers.value;
  }
  return currentUser.value ? [currentUser.value] : [];
}

function generateTravelPlanFromRecommendation() {
  if (selectedRecommendGears.value.length === 0) {
    alert('请至少选择一件装备');
    return;
  }
  const members = getEffectiveMembers();
  if (members.length === 0) {
    alert('请选择至少一位出行成员');
    return;
  }
  if (!recommendStart.value || !recommendEnd.value) {
    alert('请选择借用起止日期');
    return;
  }
  if (new Date(recommendEnd.value) < new Date(recommendStart.value)) {
    alert('归还日期不能早于借用日期');
    return;
  }

  const primaryBorrower = members[0];
  const planGears = [];
  const planRequests = [];
  const planReservations = [];
  const waitlistGears = [];
  const duplicateTracker = new Map();

  for (const gearId of selectedRecommendGears.value) {
    const gear = gears.value.find((g) => g.id === gearId);
    if (!gear) continue;

    const nameKey = `${gear.name}::${gear.owner}`;
    if (duplicateTracker.has(nameKey)) {
      const existing = duplicateTracker.get(nameKey);
      if (existing.gearId !== gearId) continue;
    }
    duplicateTracker.set(nameKey, { gearId });

    const avail = getRecommendGearAvailability(gearId, recommendStart.value, recommendEnd.value);
    const queuePosition = avail.status !== 'available'
      ? reservationHelper.getQueueForGear(gearId).length + 1
      : 0;

    const planGearItem = {
      gearId: gear.id,
      gearName: gear.name,
      owner: gear.owner,
      deposit: gear.deposit,
      status: avail.status === 'available' ? '待借' : '待确认',
      availability: avail.status,
      conflictReason: avail.reason,
      borrower: primaryBorrower,
      queuePosition,
      members: [...members]
    };

    if (avail.status === 'available') {
      planGearItem.status = '待借';
      const requestId = crypto.randomUUID();
      planRequests.push({
        id: requestId,
        gearId: gear.id,
        gearName: gear.name,
        owner: gear.owner,
        borrower: primaryBorrower,
        start: recommendStart.value,
        end: recommendEnd.value,
        status: '草稿',
        damage: '',
        reason: `${recommendScene.value}·${recommendWeather.value}·${recommendPeople.value}人·${recommendDays.value}天 出行方案`,
        tripId: ''
      });
      planGearItem.requestId = requestId;
    } else if (avail.status === 'conflict') {
      planGearItem.status = '待确认';
      planGearItem.conflictDetails = avail.conflicts.map((c) => ({
        borrower: c.borrower,
        start: c.start,
        end: c.end,
        status: c.status
      }));
      const newRes = reservationHelper.addReservation({
        gearId: gear.id,
        borrower: primaryBorrower,
        start: recommendStart.value,
        end: recommendEnd.value,
        reason: '日期冲突',
        notes: `来自出行方案：${recommendScene.value}`
      });
      if (newRes) {
        planReservations.push(newRes);
        planGearItem.reservationId = newRes.id;
      }
      waitlistGears.push({
        gearId: gear.id,
        gearName: gear.name,
        owner: gear.owner,
        reason: '日期冲突',
        queuePosition,
        conflicts: avail.conflicts
      });
    } else {
      planGearItem.status = '待确认';
      const newRes = reservationHelper.addReservation({
        gearId: gear.id,
        borrower: primaryBorrower,
        start: recommendStart.value,
        end: recommendEnd.value,
        reason: avail.reason === '借出中' ? '装备借出中' : `装备${avail.reason}`,
        notes: `来自出行方案：${recommendScene.value}`
      });
      if (newRes) {
        planReservations.push(newRes);
        planGearItem.reservationId = newRes.id;
      }
      waitlistGears.push({
        gearId: gear.id,
        gearName: gear.name,
        owner: gear.owner,
        reason: avail.reason,
        queuePosition
      });
    }

    planGears.push(planGearItem);
  }

  const tripId = crypto.randomUUID();
  const newTrip = {
    id: tripId,
    destination: `${recommendScene.value}出行方案`,
    startDate: recommendStart.value,
    endDate: recommendEnd.value,
    members: [...members],
    gears: planGears,
    notes: `${recommendScene.value}·${recommendWeather.value}·${recommendPeople.value}人·${recommendDays.value}天，由装备推荐一键生成`,
    planSource: 'recommendation',
    weather: recommendWeather.value,
    waitlistGears
  };

  for (const req of planRequests) {
    req.tripId = tripId;
  }

  trips.value = [newTrip, ...trips.value];

  for (const req of planRequests) {
    requests.value = [req, ...requests.value];
  }

  for (const res of planReservations) {
    reservations.value = [res, ...reservations.value];
  }

  travelPlanWaitlistGears.value = waitlistGears;

  const availableCount = planGears.filter((g) => g.availability === 'available').length;
  const conflictCount = planGears.filter((g) => g.availability === 'conflict').length;
  const unavailableCount = planGears.filter((g) => g.availability === 'unavailable').length;
  const totalDeposit = planGears.reduce((sum, g) => sum + (parseFloat(g.deposit) || 0), 0);

  travelPlanResult.value = {
    tripId: newTrip.id,
    destination: newTrip.destination,
    startDate: newTrip.startDate,
    endDate: newTrip.endDate,
    members: [...members],
    totalGears: planGears.length,
    availableCount,
    conflictCount,
    unavailableCount,
    requestCount: planRequests.length,
    reservationCount: planReservations.length,
    waitlistCount: waitlistGears.length,
    totalDeposit: totalDeposit.toFixed(2),
    weather: recommendWeather.value
  };

  selectedTripId.value = newTrip.id;
  triggerReservationCheck();
}

function goToTravelPlan() {
  if (travelPlanResult.value) {
    tab.value = '出行清单';
  }
}

function goToRequestsFromPlan() {
  tab.value = '申请列表';
}

function goToReservationsFromPlan() {
  tab.value = '预约排程';
}

function dismissTravelPlanResult() {
  travelPlanResult.value = null;
}

watch([recommendStart, recommendEnd, hasRecommended], () => {
  refreshRecommendAvailability();
});

watch(currentUser, (newVal) => {
  if (newVal && (!recommendMembers.value || recommendMembers.value.length === 0)) {
    recommendMembers.value = [newVal];
  }
});

function dismissMigrationWarning() {
  migrationWarning.value = '';
}

function dismissDataErrorWarning() {
  dataErrorWarning.value = '';
}

function openHealthProfile(gearId) {
  currentHealthGearId.value = gearId;
  showHealthProfile.value = true;
}

function closeHealthProfile() {
  showHealthProfile.value = false;
  currentHealthGearId.value = '';
}

function navigateToTimeline(filter) {
  timelineFilterContext.value = filter ? { ...filter } : null;
  tab.value = '操作时间线';
}

function clearTimelineContext() {
  timelineFilterContext.value = null;
}

function viewGearTimeline(gearId) {
  closeHealthProfile();
  navigateToTimeline({
    gearId
  });
}

function viewMemberTimeline(memberName) {
  navigateToTimeline({
    memberName
  });
}

function viewSettlementTimeline(settlementId, settlementName) {
  navigateToTimeline({
    entityType: 'settlement',
    entityId: settlementId,
    entityName: settlementName || ''
  });
}

function viewReservationTimeline(reservationId, gearName) {
  navigateToTimeline({
    entityType: 'reservation',
    entityId: reservationId,
    entityName: gearName || ''
  });
}

function handleReservationPanelUpdate(newList) {
  reservations.value = newList;
}

function handleReservationPanelCreateRequest(request) {
  if (!request) return;
  requests.value = [request, ...requests.value];
  alert(`候补转正成功，已生成借用申请：${request.gearName}`);
}

function addReservationFromShortcut() {
  if (!reservationShortcut.value.gearId) {
    alert('请选择装备');
    return;
  }
  if (!reservationShortcut.value.start || !reservationShortcut.value.end) {
    alert('请选择借用日期');
    return;
  }
  if (new Date(reservationShortcut.value.end) < new Date(reservationShortcut.value.start)) {
    alert('归还日期不能早于借用日期');
    return;
  }
  const newRes = reservationHelper.addReservation({
    gearId: reservationShortcut.value.gearId,
    borrower: currentUser.value,
    start: reservationShortcut.value.start,
    end: reservationShortcut.value.end,
    reason: '装备借出中'
  });
  if (newRes) {
    reservations.value = [newRes, ...reservations.value];
    reservationShortcut.value = { gearId: '', start: '', end: '' };
    alert('已加入候补队列');
    tab.value = '预约排程';
  }
}

function getReservationsForCell(rowKey, rowType, dateStr) {
  const date = new Date(dateStr);
  return reservations.value.filter((res) => {
    if (res.status !== '候补中' && res.status !== '已转正' && res.status !== '审核跳过') return false;
    if (rowType === 'gear' && res.gearId !== rowKey) return false;
    if (rowType === 'member' && res.borrower !== rowKey) return false;
    const resStart = new Date(res.start);
    const resEnd = new Date(res.end);
    return date >= resStart && date <= resEnd;
  });
}

function getCalendarCellHighlight(rowKey, rowType, dateStr) {
  const reviewItems = reservationHelper.reviewItems || [];
  const date = new Date(dateStr);
  const items = reviewItems.filter((item) => {
    const res = item.reservation;
    if (!res) return false;
    if (res.generatedRequestId) return false;
    if (rowType === 'gear' && res.gearId !== rowKey) return false;
    if (rowType === 'member' && res.borrower !== rowKey) return false;
    const resStart = new Date(res.start);
    const resEnd = new Date(res.end);
    return date >= resStart && date <= resEnd;
  });

  if (items.length === 0) return null;

  const hasSkipped = items.some(i => i.reservation.status === '审核跳过');
  const hasHighPriority = items.some(i => i.reservation.priorityScore >= 80);
  const hasBlocker = items.some(i => i.activationBlockers && i.activationBlockers.length > 0);
  const hasWarning = items.some(i => i.warnings && i.warnings.length > 0);
  const canActivate = items.some(i => i.canActivate);

  return {
    count: items.length,
    hasSkipped,
    hasHighPriority,
    hasBlocker,
    hasWarning,
    canActivate,
    maxPriority: Math.max(...items.map(i => i.reservation.priorityScore || 0))
  };
}

function getCalendarHighlightTooltip(rowKey, rowType, dateStr) {
  const highlight = getCalendarCellHighlight(rowKey, rowType, dateStr);
  if (!highlight) return '';

  const statuses = [];
  if (highlight.canActivate) statuses.push('可直接转正');
  if (highlight.hasWarning) statuses.push('存在警告');
  if (highlight.hasBlocker) statuses.push('无法转正');
  if (highlight.hasSkipped) statuses.push('含已跳过');

  return `${highlight.count} 项候补待审核 | ${statuses.join('、')} | 最高优先级 ${highlight.maxPriority}`;
}

function handleWrapUpSelectTrip(tripId) {
  wrapUpSelectedTripId.value = tripId;
  tripWrapUp.selectTrip(tripId);
  wrapUpEditingInventoryId.value = null;
  wrapUpEditingSettlementId.value = null;
}

function handleWrapUpReturn(handoverId) {
  const handover = handoverRecords.value.find((h) => h.id === handoverId);
  if (!handover) return;
  const req = requests.value.find((r) => r.id === handover.requestId);
  if (req) {
    req.status = '已归还';
    req.returnDate = new Date().toISOString().slice(0, 10);
    logEvent({
      entityType: 'request',
      entityId: req.id,
      entityName: req.gearName,
      action: 'mark_returned',
      beforeState: { status: req.status },
      afterState: { status: '已归还', returnDate: req.returnDate },
      sourcePage: '出行收尾',
      notes: '从出行收尾向导标记归还'
    });
  }
  const returnHandover = {
    id: crypto.randomUUID(),
    type: '归还',
    requestId: handover.requestId,
    gearId: handover.gearId,
    gearName: handover.gearName,
    owner: handover.owner,
    borrower: handover.borrower,
    gearStatus: '完好',
    deposit: handover.deposit || '',
    accessories: '',
    handoverNotes: '从向导归还',
    damageRecord: '',
    deductAmount: '',
    deductReason: '',
    ownerConfirmed: true,
    borrowerConfirmed: true,
    returnedAt: new Date().toISOString(),
    createdAt: new Date().toISOString().slice(0, 10)
  };
  handoverRecords.value = [...handoverRecords.value, returnHandover];
  logEvent({
    entityType: 'handover',
    entityId: returnHandover.id,
    entityName: `${handover.gearName} - 归还`,
    action: 'create',
    afterState: returnHandover,
    sourcePage: '出行收尾',
    notes: '从出行收尾向导创建归还交接单'
  });
  alert(`${handover.gearName} 已标记归还`);
}

function handleWrapUpCreateInventory(tripId) {
  const trip = trips.value.find((t) => t.id === tripId);
  if (!trip) return;
  const tripGears = trip.gears || [];
  if (tripGears.length === 0) {
    alert('该出行没有装备，无需盘点');
    return;
  }
  const newList = {
    id: crypto.randomUUID(),
    name: `${trip.destination} - 出行后盘点`,
    type: '出行后',
    date: new Date().toISOString().slice(0, 10),
    tripId: tripId,
    status: '盘点中',
    items: tripGears.map((tg) => ({
      id: crypto.randomUUID(),
      gearId: tg.gearId,
      gearName: tg.gearName,
      category: tg.category || '',
      owner: tg.owner || '',
      user: tg.user || tg.owner || '',
      planCount: tg.count || 1,
      actualCount: '',
      checkStatus: '待盘点',
      checkNotes: '',
      hasAbnormal: false,
      abnormalActions: []
    })),
    createdAt: new Date().toISOString().slice(0, 10),
    createdBy: currentUser.value,
    notes: '从出行收尾向导创建'
  };
  inventoryLists.value = [newList, ...inventoryLists.value];
  wrapUpEditingInventoryId.value = newList.id;
  logEvent({
    entityType: 'inventory',
    entityId: newList.id,
    entityName: newList.name,
    action: 'create',
    afterState: newList,
    sourcePage: '出行收尾',
    notes: '从出行收尾向导创建盘点单',
    relatedEntityType: 'trip',
    relatedEntityId: tripId,
    relatedEntityName: trip.destination
  });
}

function handleWrapUpOpenInventory(inventoryId) {
  wrapUpEditingInventoryId.value = inventoryId;
  tab.value = '装备盘点';
}

function handleWrapUpConfirmDeduct(abnormalAction) {
  if (!confirm(`确认将「${abnormalAction.gearName}」的 ${abnormalAction.amount} 元盘点异常转为押金扣除？`)) {
    return;
  }
  const result = applyAbnormalDeductionToDeposit(abnormalAction, depositRecords.value, requests.value);
  if (result.type === 'create') {
    depositRecords.value = [...depositRecords.value, result.deposit];
    logEvent({
      entityType: 'deposit',
      entityId: result.deposit.id,
      entityName: `${result.deposit.gearName} - ${result.deposit.borrower}`,
      action: 'create',
      afterState: result.deposit,
      sourcePage: '出行收尾',
      notes: `从盘点异常转换：${result.action.description}`,
      relatedEntityType: 'inventory',
      relatedEntityId: result.action.inventoryId,
      relatedEntityName: result.action.inventoryName
    });
  } else {
    const idx = depositRecords.value.findIndex((d) => d.id === result.deposit.id);
    if (idx !== -1) {
      const beforeState = { ...depositRecords.value[idx] };
      depositRecords.value[idx] = result.deposit;
      logEvent({
        entityType: 'deposit',
        entityId: result.deposit.id,
        entityName: `${result.deposit.gearName} - ${result.deposit.borrower}`,
        action: 'update',
        beforeState,
        afterState: result.deposit,
        sourcePage: '出行收尾',
        notes: `从盘点异常增加扣除：${result.action.amount} 元 - ${result.action.description}`,
        relatedEntityType: 'inventory',
        relatedEntityId: result.action.inventoryId,
        relatedEntityName: result.action.inventoryName
      });
    }
  }
  const inventoryList = inventoryLists.value.find((l) => l.id === abnormalAction.inventoryId);
  if (inventoryList) {
    for (const item of inventoryList.items) {
      const actionIdx = (item.abnormalActions || []).findIndex((a) => a.id === abnormalAction.id);
      if (actionIdx !== -1) {
        item.abnormalActions[actionIdx].status = '已处理';
        item.abnormalActions[actionIdx].handledAt = new Date().toISOString().slice(0, 10);
      }
    }
    inventoryLists.value = [...inventoryLists.value];
  }
  alert('已确认押金扣除');
}

function handleWrapUpOpenDeposit(depositId) {
  tab.value = '押金台账';
}

function handleWrapUpCreateSettlement(tripId) {
  const trip = trips.value.find((t) => t.id === tripId);
  if (!trip) return;
  const existingSettlement = settlementRecords.value.find((s) => s.tripId === tripId);
  if (existingSettlement) {
    if (!confirm(`该出行已有结算单，是否从押金、盘点等数据源刷新？`)) {
      return;
    }
    handleWrapUpRefreshSettlement(existingSettlement.id);
    return;
  }
  const tripMembers = trip.members || [];
  const tripGears = trip.gears || [];
  const tripRequestIds = requests.value
    .filter((r) => r.tripId === tripId)
    .map((r) => r.id);
  const tripDeposits = depositRecords.value.filter(
    (d) => d.requestId && tripRequestIds.includes(d.requestId)
  );
  const newSettlement = {
    id: crypto.randomUUID(),
    tripId: tripId,
    tripName: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    status: '草稿',
    totalDeposit: '0',
    totalReceived: '0',
    totalDeducted: '0',
    totalRefunded: '0',
    totalExpenses: '0',
    totalPerMember: '0',
    totalPaid: '0',
    totalUnpaid: '0',
    members: tripMembers.map((m) => ({
      nickname: typeof m === 'string' ? m : m.nickname,
      phone: typeof m === 'object' ? m.phone : '',
      depositItems: [],
      extraExpenses: [],
      depositTotal: '0',
      depositReceived: '0',
      depositDeducted: '0',
      depositRefundable: '0',
      expenseShare: '0',
      totalOwed: '0',
      paidAmount: '0',
      paymentStatus: '未支付',
      notes: ''
    })),
    extraExpenses: [],
    inventoryDeductions: [],
    createdAt: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString().slice(0, 10),
    createdBy: currentUser.value,
    notes: '从出行收尾向导创建'
  };
  let linked = { ...newSettlement };
  if (tripDeposits.length > 0) {
    linked = linkDepositsToSettlement(linked, tripDeposits, tripMembers, tripGears, tripRequestIds);
  }
  const tripInventories = inventoryLists.value.filter(
    (l) => l.tripId === tripId && l.type === '出行后'
  );
  if (tripInventories.length > 0) {
    let deductions = [];
    for (const list of tripInventories) {
      for (const item of list.items) {
        for (const action of item.abnormalActions || []) {
          if (action.type === '押金扣除') {
            deductions.push({
              actionId: action.id,
              inventoryId: list.id,
              inventoryName: list.name,
              itemId: item.id,
              gearId: item.gearId,
              gearName: item.gearName,
              borrower: action.borrower || item.owner,
              amount: action.amount,
              description: action.description,
              status: action.status
            });
          }
        }
      }
    }
    if (deductions.length > 0) {
      linked.inventoryDeductions = deductions;
      for (const ded of deductions) {
        const member = linked.members.find((m) => m.nickname === ded.borrower);
        if (member) {
          member.depositItems.push({
            depositId: `inv-${ded.actionId}`,
            gearId: ded.gearId,
            gearName: ded.gearName,
            depositAmount: '0',
            receivedAmount: '0',
            deductedAmount: ded.amount,
            actualDeduct: ded.status === '已处理' ? ded.amount : '0',
            refundedAmount: '0',
            refundable: '0',
            source: 'inventory',
            pending: ded.status !== '已处理',
            notes: ded.description || ''
          });
        }
      }
    }
  }
  const calculated = calculateSettlement(linked);
  settlementRecords.value = [calculated, ...settlementRecords.value];
  wrapUpEditingSettlementId.value = calculated.id;
  logEvent({
    entityType: 'settlement',
    entityId: calculated.id,
    entityName: calculated.tripName,
    action: 'create',
    afterState: calculated,
    sourcePage: '出行收尾',
    notes: '从出行收尾向导创建结算单',
    relatedEntityType: 'trip',
    relatedEntityId: tripId,
    relatedEntityName: trip.destination
  });
}

function handleWrapUpOpenSettlement(settlementId) {
  wrapUpEditingSettlementId.value = settlementId;
  tab.value = '费用结算';
}

function handleWrapUpRefreshSettlement(settlementId) {
  const settlement = settlementRecords.value.find((s) => s.id === settlementId);
  if (!settlement) return;
  const trip = trips.value.find((t) => t.id === settlement.tripId);
  const tripMembers = trip ? (trip.members || []) : [];
  const tripGears = trip ? (trip.gears || []) : [];
  const tripRequestIds = requests.value
    .filter((r) => r.tripId === settlement.tripId)
    .map((r) => r.id);
  const tripDeposits = depositRecords.value.filter(
    (d) => d.requestId && tripRequestIds.includes(d.requestId)
  );
  const tripInventories = inventoryLists.value.filter(
    (l) => l.tripId === settlement.tripId && l.type === '出行后'
  );
  let updated = { ...settlement };
  if (tripDeposits.length > 0) {
    updated = linkDepositsToSettlement(updated, tripDeposits, tripMembers, tripGears, tripRequestIds);
  }
  if (tripInventories.length > 0) {
    let deductions = [];
    for (const list of tripInventories) {
      for (const item of list.items) {
        for (const action of item.abnormalActions || []) {
          if (action.type === '押金扣除') {
            deductions.push({
              actionId: action.id,
              inventoryId: list.id,
              inventoryName: list.name,
              itemId: item.id,
              gearId: item.gearId,
              gearName: item.gearName,
              borrower: action.borrower || item.owner,
              amount: action.amount,
              description: action.description,
              status: action.status
            });
          }
        }
      }
    }
    updated.inventoryDeductions = deductions;
    for (const ded of deductions) {
      const member = updated.members.find((m) => m.nickname === ded.borrower);
      if (member) {
        const existingIdx = member.depositItems.findIndex(
          (d) => d.depositId === `inv-${ded.actionId}`
        );
        if (existingIdx === -1) {
          member.depositItems.push({
            depositId: `inv-${ded.actionId}`,
            gearId: ded.gearId,
            gearName: ded.gearName,
            depositAmount: '0',
            receivedAmount: '0',
            deductedAmount: ded.amount,
            actualDeduct: ded.status === '已处理' ? ded.amount : '0',
            refundedAmount: '0',
            refundable: '0',
            source: 'inventory',
            pending: ded.status !== '已处理',
            notes: ded.description || ''
          });
        } else {
          member.depositItems[existingIdx] = {
            ...member.depositItems[existingIdx],
            deductedAmount: ded.amount,
            actualDeduct: ded.status === '已处理' ? ded.amount : '0',
            pending: ded.status !== '已处理'
          };
        }
      }
    }
  }
  const calculated = calculateSettlement(updated);
  calculated.updatedAt = new Date().toISOString().slice(0, 10);
  const idx = settlementRecords.value.findIndex((s) => s.id === settlementId);
  if (idx !== -1) {
    const beforeState = { ...settlementRecords.value[idx] };
    settlementRecords.value[idx] = calculated;
    logEvent({
      entityType: 'settlement',
      entityId: calculated.id,
      entityName: calculated.tripName,
      action: 'refresh',
      beforeState,
      afterState: calculated,
      sourcePage: '出行收尾',
      notes: '从出行收尾向导刷新结算单，同步了押金和盘点数据'
    });
  }
  alert('结算单已刷新');
}

function handleWrapUpFinalizeSettlement(settlementId) {
  const settlement = settlementRecords.value.find((s) => s.id === settlementId);
  if (!settlement) return;
  const stats = getSettlementStats(settlement);
  if (stats && stats.unpaidMembers > 0) {
    alert(`还有 ${stats.unpaidMembers} 位成员未付款，无法完成结算`);
    return;
  }
  if (!confirm('确认所有款项已结清，将结算单标记为"已结算"？此操作不可撤销。')) {
    return;
  }
  const idx = settlementRecords.value.findIndex((s) => s.id === settlementId);
  if (idx !== -1) {
    const beforeState = { ...settlementRecords.value[idx] };
    settlementRecords.value[idx] = {
      ...settlementRecords.value[idx],
      status: '已结算',
      updatedAt: new Date().toISOString().slice(0, 10)
    };
    logEvent({
      entityType: 'settlement',
      entityId: settlementId,
      entityName: settlementRecords.value[idx].tripName,
      action: 'finalize',
      beforeState,
      afterState: settlementRecords.value[idx],
      sourcePage: '出行收尾',
      notes: '从出行收尾向导完成结算，标记为已结算'
    });
    alert('🎉 出行结算已完成！');
  }
}
</script>

<template>
  <main>
    <div v-if="migrationWarning" class="migration-warning">
      <span>📦 {{ migrationWarning }}</span>
      <button class="ghost small" @click="dismissMigrationWarning">知道了</button>
    </div>
    <div v-if="dataErrorWarning" class="error-warning">
      <span>⚠️ {{ dataErrorWarning }}</span>
      <div class="warning-actions">
        <button class="ghost small" @click="resetSpaceData(currentSpaceId)">重置当前空间</button>
        <button class="ghost small" @click="dismissDataErrorWarning">关闭</button>
      </div>
    </div>

    <div v-if="pendingReviewNotification" class="review-notification">
      <div class="review-notification-content">
        <span class="review-notification-icon">🔍</span>
        <div class="review-notification-info">
          <strong>有 {{ pendingReviewNotification.total }} 项候补可转正审核</strong>
          <div class="review-notification-details">
            <span v-if="pendingReviewNotification.canActivate > 0" class="detail-tag ok">
              {{ pendingReviewNotification.canActivate }} 项可直接转正
            </span>
            <span v-if="pendingReviewNotification.hasWarning > 0" class="detail-tag warning">
              {{ pendingReviewNotification.hasWarning }} 项存在警告
            </span>
            <span v-if="pendingReviewNotification.blocked > 0" class="detail-tag blocked">
              {{ pendingReviewNotification.blocked }} 项被阻止
            </span>
          </div>
        </div>
      </div>
      <div class="review-notification-actions">
        <button class="primary small" @click="navigateToReview">前往审核</button>
        <button class="ghost small" @click="dismissReviewNotification">关闭</button>
      </div>
    </div>

    <header class="hero">
      <div>
        <p>露营装备共享社群</p>
        <h1>装备借用工作台</h1>
        <div class="space-switcher">
          <div class="space-current" @click="toggleSpaceMenu">
            <span class="space-icon">🏕</span>
            <span class="space-name">{{ currentSpace?.name || '加载中...' }}</span>
            <span v-if="currentSpace?.description" class="space-desc muted">· {{ currentSpace.description }}</span>
            <span class="space-arrow">▼</span>
          </div>
          <div v-if="showSpaceMenu" class="space-menu" @click.stop>
            <div class="space-menu-header">
              <strong>切换社群空间</strong>
              <div class="space-menu-header-actions">
                <button class="ghost small" @click="openCloneFromTemplateModal">📋 从模板</button>
                <button class="ghost small" @click="openCreateSpaceModal">+ 新建</button>
              </div>
            </div>
            <div class="space-menu-list">
              <div
                v-for="space in spaces"
                :key="space.id"
                :class="['space-menu-item', { active: space.id === currentSpaceId }]"
                @click="switchSpace(space.id)"
              >
                <div class="space-menu-info">
                  <span class="space-menu-name">{{ space.name }}</span>
                  <span v-if="space.description" class="muted space-menu-desc">{{ space.description }}</span>
                </div>
                <div class="space-menu-actions">
                  <button class="ghost small" @click.stop="openEditSpaceModal(space)">编辑</button>
                  <button v-if="spaces.length > 1" class="ghost small danger" @click.stop="deleteSpace(space.id)">删除</button>
                </div>
              </div>
            </div>
            <div class="space-menu-divider"></div>
            <div class="space-menu-template-section">
              <div class="space-menu-template-header">
                <strong>空间模板</strong>
                <div class="space-menu-header-actions">
                  <button class="ghost small" @click="openSaveTemplateModal">💾 存模板</button>
                  <button class="ghost small" @click="openTemplateListModal">📋 管理</button>
                </div>
              </div>
              <p class="muted" style="font-size: 12px; margin: 4px 0 0;">将当前空间配置保存为模板，快速复用到新空间</p>
            </div>
            <div class="space-menu-footer muted">
              共 {{ spaces.length }} 个空间 · 数据各自独立
            </div>
          </div>
        </div>
      </div>
      <label>
        当前成员
        <select v-model="currentUser">
          <option v-for="member in members" :key="member.id">{{ member.nickname }}</option>
        </select>
      </label>
    </header>

    <nav class="tabs">
      <button v-for="item in ['装备库','装备推荐','申请列表','预约排程','借用日历','交接确认单','押金台账','保养记录','出行清单','装备盘点','费用结算','出行收尾','成员资料','我的借出','我的借入','操作时间线','数据导入导出']" :key="item" :class="{ active: tab === item }" @click="tab = item">{{ item }}</button>
    </nav>

    <section class="metrics">
      <article><strong>{{ gears.length }}</strong><span>登记装备</span></article>
      <article><strong>{{ gears.filter((item) => item.status === '可借').length }}</strong><span>当前可借</span></article>
      <article><strong>{{ requests.filter((item) => item.status === '待处理').length }}</strong><span>待处理申请</span></article>
      <article><strong>{{ handoverCount }}</strong><span>交接记录</span></article>
      <article><strong>{{ depositCount }}</strong><span>押金记录</span></article>
      <article><strong>{{ pendingDepositCount }}</strong><span>待收押金</span></article>
      <article><strong>¥{{ totalDepositDeducted }}</strong><span>累计扣除</span></article>
      <article><strong>{{ maintenanceCount }}</strong><span>保养记录</span></article>
      <article><strong>{{ tripsCount }}</strong><span>出行计划</span></article>
      <article><strong>{{ inventoryLists.length }}</strong><span>盘点单</span></article>
      <article><strong>{{ members.length }}</strong><span>社群成员</span></article>
      <article><strong>{{ settlementRecords.length }}</strong><span>费用结算</span></article>
      <article><strong>{{ reservations.filter(r => r.status === '候补中').length }}</strong><span>候补中</span></article>
    </section>

    <section v-if="tab === '装备库'" class="layout">
      <form class="panel" @submit.prevent="addGear">
        <h2>{{ editingGearId ? '编辑装备' : '登记装备' }}</h2>
        <input v-model="form.name" placeholder="装备名称" />
        <select v-model="form.category">
          <option>帐篷天幕</option>
          <option>炊具</option>
          <option>照明</option>
          <option>桌椅收纳</option>
          <option>安全急救</option>
        </select>
        <select v-model="form.owner">
          <option v-for="member in members" :key="member.id">{{ member.nickname }}</option>
        </select>
        <div class="split">
          <input v-model="form.available" type="date" />
          <input v-model="form.deposit" placeholder="押金" />
        </div>
        <div class="form-section">
          <h4 style="margin: 0 0 8px; color: #3a3730; font-size: 14px;">🔧 保养计划</h4>
          <div class="split">
            <div>
              <label class="muted" style="font-size: 12px;">保养周期（天）</label>
              <input v-model.number="form.maintenanceCycleDays" type="number" min="1" placeholder="30" />
            </div>
            <div>
              <label class="muted" style="font-size: 12px;">下次保养日期</label>
              <input v-model="form.nextMaintenanceDate" type="date" />
            </div>
          </div>
          <div>
            <label class="muted" style="font-size: 12px;">提醒级别</label>
            <select v-model="form.maintenanceReminderLevel">
              <option value="宽松">宽松（提前7天提醒）</option>
              <option value="标准">标准（提前14天提醒）</option>
              <option value="严格">严格（提前30天提醒）</option>
            </select>
          </div>
        </div>
        <textarea v-model="form.notes" placeholder="使用注意事项"></textarea>
        <div class="split">
          <button>{{ editingGearId ? '保存修改' : '保存装备' }}</button>
          <button v-if="editingGearId" type="button" class="ghost" @click="cancelEditGear">取消</button>
        </div>
      </form>

      <div class="panel wide">
        <div class="toolbar">
          <h2>装备库</h2>
          <select v-model="category">
            <option v-for="item in categories" :key="item">{{ item }}</option>
          </select>
        </div>
        <div class="cards">
          <article v-for="gear in filteredGears" :key="gear.id" class="gear-card">
            <strong>{{ gear.name }}</strong>
            <span>{{ gear.category }} · {{ gear.owner }}</span>
            <p>{{ gear.status }} · 可借日期{{ gear.available }} · 押金{{ gear.deposit }}</p>
            <small>{{ gear.notes }}</small>
            <div v-if="healthInfoMap[gear.id]?.maintenancePlanStatus"
                 :class="['maintenance-badge', {
                   'plan-overdue': healthInfoMap[gear.id].maintenancePlanStatus.status === 'overdue',
                   'plan-upcoming': healthInfoMap[gear.id].maintenancePlanStatus.status === 'upcoming'
                 }]"
                 style="margin-top: 10px; padding: 8px 10px; background: #edf1e8; border-radius: 6px; font-size: 12px;">
              <span style="color: #2f4a2c; font-weight: 600;">📅 保养计划：</span>
              <span>{{ healthInfoMap[gear.id].maintenancePlanStatus.nextDate }} · {{ healthInfoMap[gear.id].maintenancePlanStatus.label }}</span>
              <div style="margin-top: 4px; color: #63705d;">
                周期：{{ healthInfoMap[gear.id].maintenancePlanStatus.cycle }}天 · 提醒：{{ healthInfoMap[gear.id].maintenancePlanStatus.reminderLevel }}
              </div>
            </div>
            <div v-if="lastMaintenanceByGear[gear.id]" class="maintenance-badge" style="margin-top: 8px; padding: 8px 10px; background: #f5f3e8; border-radius: 6px; font-size: 12px;">
              <span style="color: #6b5a2a; font-weight: 600;">最近保养：</span>
              <span>{{ lastMaintenanceByGear[gear.id].date }} · {{ lastMaintenanceByGear[gear.id].type }}</span>
              <div v-if="lastMaintenanceByGear[gear.id].description" style="margin-top: 4px; color: #63705d;">
                {{ lastMaintenanceByGear[gear.id].description }}
              </div>
            </div>
            <div v-if="lastInventoryByGear[gear.id]" class="inventory-badge" style="margin-top: 8px; padding: 8px 10px; background: #f0f4ff; border-radius: 6px; font-size: 12px;">
              <span style="color: #2c5a8a; font-weight: 600;">最近盘点：</span>
              <span>{{ lastInventoryByGear[gear.id].date }} · {{ lastInventoryByGear[gear.id].type }}</span>
              <span :class="['inventory-status-tag', lastInventoryByGear[gear.id].checkStatus]" style="margin-left: 6px;">
                {{ getInventoryStatusLabel(lastInventoryByGear[gear.id].checkStatus) }}
              </span>
              <div v-if="lastInventoryByGear[gear.id].checker" style="margin-top: 4px; color: #5a7a4f;">
                👤 盘点人：{{ lastInventoryByGear[gear.id].checker }}
              </div>
              <div v-if="lastInventoryByGear[gear.id].missingAccessories" style="margin-top: 4px; color: #b02a2a;">
                缺失配件：{{ lastInventoryByGear[gear.id].missingAccessories }}
              </div>
              <div v-if="lastInventoryByGear[gear.id].notes" style="margin-top: 4px; color: #63705d;">
                备注：{{ lastInventoryByGear[gear.id].notes }}
              </div>
            </div>
            <button
              class="ghost small health-profile-btn"
              style="margin-top: 10px; width: 100%;"
              @click="openHealthProfile(gear.id)"
            >
              📋 查看装备健康档案
            </button>
            <div class="actions" style="margin-top: 8px; display: flex; gap: 8px;">
              <button class="ghost small" style="flex: 1;" @click="editGear(gear)">编辑</button>
              <button class="ghost small danger" style="flex: 1;" @click="deleteGear(gear)">删除</button>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section v-if="tab === '装备推荐'" class="layout">
      <form class="panel" @submit.prevent="generateRecommendation">
        <h2>套装推荐条件</h2>
        <label class="muted">露营场景</label>
        <select v-model="recommendScene">
          <option v-for="scene in sceneOptions" :key="scene">{{ scene }}</option>
        </select>
        <label class="muted">天气状况</label>
        <select v-model="recommendWeather">
          <option v-for="weather in weatherOptions" :key="weather">{{ weather }}</option>
        </select>
        <label class="muted">参与人数</label>
        <input v-model.number="recommendPeople" type="number" min="1" max="20" />
        <label class="muted">露营天数</label>
        <input v-model.number="recommendDays" type="number" min="1" max="30" />
        <label class="muted">出行成员</label>
        <div class="member-select">
          <label v-for="member in members" :key="member.id" class="member-chip">
            <input type="checkbox" :checked="recommendMembers.includes(member.nickname)" @change="toggleRecommendMember(member.nickname)" />
            <span>{{ member.nickname }}</span>
          </label>
        </div>
        <small class="muted member-hint">主借用人为第一位选中成员</small>
        <label class="muted">借用起止日期</label>
        <div class="split">
          <input v-model="recommendStart" type="date" />
          <input v-model="recommendEnd" type="date" />
        </div>
        <button>生成推荐</button>
        <small class="muted">系统将根据场景、天气、人数、天数智能推荐装备，并优先匹配日期不冲突的装备。</small>
      </form>

      <div class="panel wide">
        <div v-if="!hasRecommended" class="recommend-empty">
          <div class="recommend-empty-icon">🏕</div>
          <h3>还没有生成推荐</h3>
          <p class="muted">填写左侧的露营条件，点击「生成推荐」按钮，系统将为你匹配最合适的装备套装。</p>
        </div>

        <div v-else>
          <div class="toolbar">
            <h2>推荐结果</h2>
            <div class="recommend-summary">
              <span class="muted">已选 {{ getSelectedRecommendGearsCount() }} 件</span>
              <button class="ghost small" @click="generateRecommendation">重新推荐</button>
              <button @click="addRecommendationToRequests" :disabled="getSelectedRecommendGearsCount() === 0">一键带入申请</button>
              <button class="plan-btn" @click="generateTravelPlanFromRecommendation" :disabled="getSelectedRecommendGearsCount() === 0">一键生成出行方案</button>
            </div>
          </div>

          <div v-if="travelPlanResult" class="travel-plan-result">
            <div class="travel-plan-header">
              <strong>✅ 出行方案已生成</strong>
              <button class="ghost small" @click="dismissTravelPlanResult">关闭</button>
            </div>
            <div class="travel-plan-body">
              <div class="travel-plan-info">
                <span>📋 {{ travelPlanResult.destination }}</span>
                <span>🌤 {{ travelPlanResult.weather }}</span>
                <span>📅 {{ travelPlanResult.startDate }} ~ {{ travelPlanResult.endDate }}</span>
                <span>👥 {{ travelPlanResult.members.join('、') }}</span>
                <span>🎒 共 {{ travelPlanResult.totalGears }} 件装备</span>
                <span>💰 预计押金 ¥{{ travelPlanResult.totalDeposit }}</span>
              </div>
              <div class="travel-plan-stats">
                <div class="plan-stat available">
                  <span class="plan-stat-value">{{ travelPlanResult.availableCount }}</span>
                  <span class="plan-stat-label">可借</span>
                </div>
                <div class="plan-stat conflict">
                  <span class="plan-stat-value">{{ travelPlanResult.conflictCount }}</span>
                  <span class="plan-stat-label">日期冲突</span>
                </div>
                <div class="plan-stat unavailable">
                  <span class="plan-stat-value">{{ travelPlanResult.unavailableCount }}</span>
                  <span class="plan-stat-label">不可借</span>
                </div>
                <div class="plan-stat requests">
                  <span class="plan-stat-value">{{ travelPlanResult.requestCount }}</span>
                  <span class="plan-stat-label">申请草稿</span>
                </div>
                <div class="plan-stat reservations">
                  <span class="plan-stat-value">{{ travelPlanResult.waitlistCount }}</span>
                  <span class="plan-stat-label">候补排队</span>
                </div>
              </div>

              <div v-if="travelPlanWaitlistGears.length > 0" class="waitlist-section">
                <div class="waitlist-header">
                  <strong>📝 候补清单</strong>
                  <span class="muted">以下装备已自动加入候补预约队列</span>
                </div>
                <div class="waitlist-list">
                  <div v-for="item in travelPlanWaitlistGears" :key="item.gearId" class="waitlist-item">
                    <span class="waitlist-gear">{{ item.gearName }}</span>
                    <span class="waitlist-owner muted">{{ item.owner }}</span>
                    <span class="waitlist-reason">{{ item.reason }}</span>
                    <span class="waitlist-position">#{{ item.queuePosition }}</span>
                  </div>
                </div>
              </div>

              <div class="travel-plan-actions">
                <button @click="goToTravelPlan">查看出行清单</button>
                <button v-if="travelPlanResult.requestCount > 0" class="ghost" @click="goToRequestsFromPlan">前往申请列表</button>
                <button v-if="travelPlanResult.waitlistCount > 0" class="ghost" @click="goToReservationsFromPlan">前往预约排程</button>
              </div>
            </div>
          </div>

          <div v-if="gapList.length > 0" class="gap-section">
            <div class="gap-header">
              <strong>⚠️ 缺口清单</strong>
              <span class="muted">以下分类装备数量不足，请提前准备或外购</span>
            </div>
            <div class="gap-list">
              <div v-for="gap in gapList" :key="gap.category" class="gap-item">
                <span class="gap-category">{{ gap.category }}</span>
                <span class="gap-detail">需要 {{ gap.needed }} 件，现有可用 {{ gap.available }} 件，缺 {{ gap.shortfall }} 件</span>
              </div>
            </div>
          </div>

          <div class="recommend-categories">
            <div v-for="category in recommendCategories" :key="category" class="recommend-category">
              <div class="recommend-category-header">
                <h3>{{ category }}</h3>
                <span class="category-meta">
                  需要 {{ recommendationResult[category]?.needed || 0 }} 件 ·
                  可用 {{ recommendationResult[category]?.available || 0 }} 件 ·
                  已选 {{ recommendationResult[category]?.recommended?.filter(g => isRecommendGearSelected(g.id))?.length || 0 }} 件
                </span>
              </div>

              <div v-if="recommendationResult[category]?.recommended?.length === 0" class="muted no-gear-warning">
                该分类暂无可用装备
              </div>

              <div v-else class="recommend-gear-list">
                <label
                  v-for="gear in recommendationResult[category].recommended"
                  :key="gear.id"
                  :class="['recommend-gear-item', { selected: isRecommendGearSelected(gear.id) }, recommendAvailabilityMap[gear.id]?.status || '']"
                >
                  <input type="checkbox" :checked="isRecommendGearSelected(gear.id)" @change="toggleRecommendGearSelection(gear.id)" />
                  <div class="gear-info">
                    <span class="gear-name">{{ gear.name }}</span>
                    <span class="gear-meta">装备主人：{{ gear.owner }} · 押金：¥{{ gear.deposit }}</span>
                    <span v-if="gear.notes" class="gear-notes">{{ gear.notes }}</span>
                  </div>
                  <span v-if="recommendAvailabilityMap[gear.id]" :class="['avail-badge', recommendAvailabilityMap[gear.id].status]">
                    <template v-if="recommendAvailabilityMap[gear.id].status === 'available'">✓ 可借</template>
                    <template v-else-if="recommendAvailabilityMap[gear.id].status === 'conflict'">⚠ {{ recommendAvailabilityMap[gear.id].reason }}</template>
                    <template v-else>✗ {{ recommendAvailabilityMap[gear.id].reason }}</template>
                  </span>
                  <span v-if="recommendAvailabilityMap[gear.id]?.status === 'conflict' || recommendAvailabilityMap[gear.id]?.status === 'unavailable'" class="reserve-hint" @click.prevent @click="tab = '预约排程'">
                    候补预约 →
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="tab === '申请列表'" class="layout">
      <form class="panel" @submit.prevent="applyGear">
        <h2>{{ editingDraftId ? '编辑草稿' : '发起借用' }}</h2>
        <select v-model="requestForm.gearId">
          <option value="">选择装备</option>
          <option v-for="gear in gears.filter((item) => item.status === '可借')" :key="gear.id" :value="gear.id">{{ gear.name }}</option>
        </select>
        <select v-model="requestForm.borrower">
          <option v-for="member in members" :key="member.id">{{ member.nickname }}</option>
        </select>
        <div class="split">
          <input v-model="requestForm.start" type="date" />
          <input v-model="requestForm.end" type="date" />
        </div>
        <textarea v-model="requestForm.reason" placeholder="借用说明"></textarea>
        <div class="split">
          <button>{{ editingDraftId ? '保存并提交' : '提交申请' }}</button>
          <button type="button" class="ghost" @click.prevent="saveDraft">保存草稿</button>
        </div>
        <button v-if="editingDraftId" type="button" class="ghost" @click="cancelEditDraft">取消编辑</button>

        <div class="reservation-shortcut">
          <label class="muted" style="margin-top: 12px; border-top: 1px dashed #d0d8c5; padding-top: 12px;">
            不可借或已被占用的装备？提交候补预约
          </label>
          <select v-model="reservationShortcut.gearId" style="margin-top: 4px;">
            <option value="">选择不可借装备</option>
            <option v-for="gear in gears.filter((g) => g.status !== '可借')" :key="gear.id" :value="gear.id">
              {{ gear.name }}（{{ gear.owner }}）· {{ gear.status }}
            </option>
          </select>
          <div class="split" style="margin-top: 4px;">
            <input v-model="reservationShortcut.start" type="date" />
            <input v-model="reservationShortcut.end" type="date" />
          </div>
          <button type="button" class="ghost" style="width: 100%; margin-top: 4px;" @click="addReservationFromShortcut">加入候补</button>
        </div>

        <div v-if="conflictWarning" class="conflict-warning">
          <div class="conflict-header">
            <strong>⚠️ {{ conflictWarning }}</strong>
            <button type="button" class="ghost small" @click="dismissConflictWarning">关闭</button>
          </div>
          <div class="conflict-list">
            <div v-for="c in conflictDetails" :key="c.id" class="conflict-item">
              <div><strong>{{ c.gearName }}</strong></div>
              <div class="conflict-meta">借用人：{{ c.borrower }} · {{ c.start }} 至 {{ c.end }}</div>
              <div class="conflict-status" :class="c.status">{{ c.status }}</div>
              <div v-if="c.reason" class="conflict-reason">{{ c.reason }}</div>
            </div>
          </div>
        </div>
      </form>
      <div class="panel wide">
        <div class="toolbar">
          <h2>申请流转</h2>
          <select v-model="requestFilter">
            <option>全部申请</option>
            <option>草稿</option>
            <option>待处理</option>
            <option>已同意</option>
            <option>已拒绝</option>
            <option>已归还</option>
          </select>
        </div>
        <div class="requestList">
          <article v-for="item in requestList" :key="item.id" :class="item.status === '草稿' ? 'draft-card' : ''">
            <div>
              <strong>{{ item.gearName }}</strong>
              <span>{{ item.borrower }}申请 · {{ item.start }}至{{ item.end }}</span>
            </div>
            <p>
              <span :class="['status-tag', item.status]">{{ item.status }}</span>
               · 装备主人{{ item.owner }} · {{ item.reason }}
            </p>
            <div class="actions" v-if="item.status === '草稿'">
              <button @click="submitDraft(item.id)">提交申请</button>
              <button class="ghost small" @click="editDraft(item.id)">编辑</button>
              <button class="ghost small danger" @click="deleteRequest(item.id)">删除</button>
            </div>
            <div class="actions" v-if="item.status === '待处理'">
              <button @click="updateRequest(item.id, '已同意')">同意</button>
              <button class="ghost" @click="updateRequest(item.id, '已拒绝')">拒绝</button>
            </div>
            <div class="actions" v-if="item.status === '已同意' || item.status === '借出中'">
              <button class="ghost small" @click="openBorrowHandoverModal(item.id)">
                {{ isHandoverCompleted(item.id, '借出') ? '查看借出单' : '借出交接单' }}
              </button>
              <button v-if="isHandoverCompleted(item.id, '借出')" @click="openReturnHandoverModal(item.id)">
                {{ getReturnHandover(item.id) ? (isHandoverCompleted(item.id, '归还') ? '查看归还单' : '继续归还') : '登记归还' }}
              </button>
            </div>
            <div class="actions" v-if="item.status === '已归还'">
              <button class="ghost small" @click="openBorrowHandoverModal(item.id)">借出交接单</button>
              <button class="ghost small" @click="openReturnHandoverModal(item.id)">归还交接单</button>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section v-if="tab === '预约排程'">
      <ReservationPanel
        :reservations="reservations"
        :gears="gears"
        :requests="requests"
        :handovers="handoverRecords"
        :members="members"
        :current-user="currentUser"
        :health-info-map="healthInfoMap"
        @update:reservations="handleReservationPanelUpdate"
        @create-request="handleReservationPanelCreateRequest"
        @log-event="logEvent"
        @view-timeline="(filter) => navigateToTimeline(filter)"
      />
    </section>

    <section v-if="tab === '借用日历'" class="panel calendar-panel">
      <div class="calendar-toolbar">
        <div class="calendar-title-group">
          <h2>借用日历</h2>
          <div class="week-nav">
            <button class="ghost small" @click="shiftWeek(-1)">← 上周</button>
            <button class="ghost small" @click="resetWeekToToday">本周</button>
            <button class="ghost small" @click="shiftWeek(1)">下周 →</button>
          </div>
        </div>
        <div class="calendar-filters">
          <label>
            查看方式
            <select v-model="calendarViewMode" @change="calendarFilterValue = '全部'">
              <option>按装备</option>
              <option>按成员</option>
            </select>
          </label>
          <label>
            {{ calendarViewMode === '按装备' ? '装备筛选' : '成员筛选' }}
            <select v-model="calendarFilterValue">
              <template v-if="calendarViewMode === '按装备'">
                <option v-for="opt in calendarGearOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </template>
              <template v-else>
                <option v-for="opt in calendarMemberOptions" :key="opt">{{ opt }}</option>
              </template>
            </select>
          </label>
        </div>
      </div>

      <div v-if="calendarRows.length === 0" class="calendar-empty muted" style="padding: 40px; text-align: center;">
        当前筛选条件下暂无借用记录
      </div>

      <div v-else class="calendar-grid">
        <div class="calendar-header-row">
          <div class="calendar-corner">{{ calendarViewMode === '按装备' ? '装备 / 日期' : '成员 / 日期' }}</div>
          <div v-for="date in weekDates" :key="date" :class="['calendar-date-header', { today: date === iso(0) }]">
            <div class="date-label">{{ date.slice(5) }}</div>
            <div class="weekday-label">{{ ['周日','周一','周二','周三','周四','周五','周六'][new Date(date).getDay()] }}</div>
          </div>
        </div>

        <div v-for="row in calendarRows" :key="row.key" class="calendar-data-row">
          <div class="calendar-row-label">
            <strong>{{ row.label }}</strong>
          </div>
          <div
            v-for="date in weekDates"
            :key="date"
            :class="['calendar-cell', {
              today: date === iso(0),
              'has-review-highlight': getCalendarCellHighlight(row.key, row.type, date)
            }]"
          >
            <div
              v-if="getCalendarCellHighlight(row.key, row.type, date)"
              :class="['review-highlight-indicator', {
                'high-priority': getCalendarCellHighlight(row.key, row.type, date).hasHighPriority,
                'has-skipped': getCalendarCellHighlight(row.key, row.type, date).hasSkipped,
                'has-blocker': getCalendarCellHighlight(row.key, row.type, date).hasBlocker,
                'has-warning': getCalendarCellHighlight(row.key, row.type, date).hasWarning,
                'can-activate': getCalendarCellHighlight(row.key, row.type, date).canActivate
              }]"
              :title="getCalendarHighlightTooltip(row.key, row.type, date)"
            >
              {{ getCalendarCellHighlight(row.key, row.type, date).count }}
            </div>
            <div class="cell-requests">
              <div
                v-for="req in getRequestsForCell(row.key, row.type, date)"
                :key="req.id"
                :class="['cal-request', req.status]"
                :title="`${req.gearName} | ${req.borrower}借 | ${req.start}~${req.end} | ${req.status}`"
              >
                <div class="cal-req-name">{{ row.type === 'gear' ? req.borrower : req.gearName }}</div>
                <div class="cal-req-status">{{ req.status }}</div>
              </div>
              <div
                v-for="res in getReservationsForCell(row.key, row.type, date)"
                :key="'res-' + res.id"
                :class="['cal-request', 'reservation', res.status]"
                :title="`候补 | ${res.gearName} | ${res.borrower} | ${res.start}~${res.end} | ${res.status}`"
              >
                <div class="cal-req-name">{{ row.type === 'gear' ? res.borrower : res.gearName }}</div>
                <div class="cal-req-status">{{ res.status === '审核跳过' ? '审核跳过' : '候补' }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="calendar-legend">
        <span class="legend-item"><span class="legend-dot 待处理"></span>待处理</span>
        <span class="legend-item"><span class="legend-dot 已同意"></span>已同意</span>
        <span class="legend-item"><span class="legend-dot 借出中"></span>借出中</span>
        <span class="legend-item"><span class="legend-dot reservation"></span>候补预约</span>
        <span class="legend-item"><span class="legend-dot 审核跳过"></span>审核跳过</span>
        <span class="legend-item"><span class="legend-dot" style="background:#2d7a3e;"></span>可转正</span>
        <span class="legend-item"><span class="legend-dot" style="background:#d97706;"></span>有警告</span>
        <span class="legend-item"><span class="legend-dot" style="background:#b02a2a;"></span>高优先级</span>
        <span class="legend-item"><span class="legend-dot" style="background:#9ca3af;"></span>无法转正</span>
      </div>
    </section>

    <section v-if="tab === '交接确认单'" class="panel">
      <div class="toolbar">
        <h2>交接确认单</h2>
        <div class="filter-group">
          <select v-model="handoverTypeFilter">
            <option v-for="opt in handoverTypeList" :key="opt">{{ opt }}</option>
          </select>
          <select v-model="handoverFilter">
            <option v-for="opt in handoverStatusList" :key="opt">{{ opt }}</option>
          </select>
        </div>
      </div>
      <div v-if="filteredHandovers.length === 0" class="muted" style="padding: 40px; text-align: center;">暂无交接记录，可在申请列表中生成交接单</div>
      <div v-else class="handover-list">
        <article v-for="handover in filteredHandovers" :key="handover.id" class="handover-card" @click="viewHandover(handover.id)">
          <div class="handover-header">
            <strong>{{ handover.gearName }}</strong>
            <span :class="['handover-type-badge', handover.type]">{{ handover.type }}</span>
          </div>
          <div class="handover-meta">
            <span>出借人：{{ handover.owner }}</span>
            <span>借用人：{{ handover.borrower }}</span>
            <span>日期：{{ handover.createdAt }}</span>
          </div>
          <div class="handover-status-row">
            <span :class="['status-badge', getHandoverStatus(handover)]">{{ getHandoverStatus(handover) }}</span>
            <div class="confirm-states">
              <span :class="['confirm-state', { confirmed: handover.ownerConfirmed }]">
                {{ handover.ownerConfirmed ? '✓' : '○' }} 出借人
              </span>
              <span :class="['confirm-state', { confirmed: handover.borrowerConfirmed }]">
                {{ handover.borrowerConfirmed ? '✓' : '○' }} 借用人
              </span>
            </div>
          </div>
          <p v-if="handover.damageRecord" class="damage-note">损耗：{{ handover.damageRecord }}</p>
        </article>
      </div>
    </section>

    <section v-if="tab === '押金台账'" class="panel">
      <div class="toolbar">
        <h2>押金台账</h2>
        <div class="filter-group">
          <select v-model="depositMemberFilter">
            <option v-for="opt in depositMemberOptions" :key="opt">{{ opt }}</option>
          </select>
          <select v-model="depositGearFilter">
            <option v-for="opt in depositGearOptions" :key="opt">{{ opt }}</option>
          </select>
          <select v-model="depositFilter">
            <option v-for="opt in depositStatusList" :key="opt">{{ opt }}</option>
          </select>
        </div>
      </div>
      <div class="deposit-summary">
        <div class="deposit-summary-item">
          <span class="deposit-summary-label">押金记录总数</span>
          <span class="deposit-summary-value">{{ depositCount }}</span>
        </div>
        <div class="deposit-summary-item">
          <span class="deposit-summary-label">待收取</span>
          <span class="deposit-summary-value pending">{{ pendingDepositCount }}</span>
        </div>
        <div class="deposit-summary-item">
          <span class="deposit-summary-label">累计已收</span>
          <span class="deposit-summary-value received">¥{{ totalDepositReceived }}</span>
        </div>
        <div class="deposit-summary-item">
          <span class="deposit-summary-label">累计扣除</span>
          <span class="deposit-summary-value deducted">¥{{ totalDepositDeducted }}</span>
        </div>
      </div>
      <div v-if="filteredDeposits.length === 0" class="muted" style="padding: 40px; text-align: center;">暂无押金记录，借用申请被同意后将自动生成押金台账</div>
      <div v-else class="deposit-list">
        <article v-for="deposit in filteredDeposits" :key="deposit.id" class="deposit-card" @click="openDepositModal(deposit.id, 'view')">
          <div class="deposit-header">
            <strong>{{ deposit.gearName }}</strong>
            <span :class="['deposit-status-badge', deposit.status]">{{ deposit.status }}</span>
          </div>
          <div class="deposit-meta">
            <span>出借人：{{ deposit.owner }}</span>
            <span>借用人：{{ deposit.borrower }}</span>
            <span>创建日期：{{ deposit.createdAt }}</span>
          </div>
          <div class="deposit-amounts">
            <div class="amount-item">
              <span class="amount-label">押金应收</span>
              <span class="amount-value">¥{{ deposit.depositAmount || 0 }}</span>
            </div>
            <div class="amount-item">
              <span class="amount-label">已收</span>
              <span class="amount-value received">¥{{ deposit.receivedAmount || 0 }}</span>
            </div>
            <div class="amount-item">
              <span class="amount-label">扣除</span>
              <span class="amount-value deducted">¥{{ deposit.deductedAmount || 0 }}</span>
            </div>
            <div class="amount-item">
              <span class="amount-label">退还</span>
              <span class="amount-value refunded">¥{{ deposit.refundedAmount || 0 }}</span>
            </div>
          </div>
          <p v-if="deposit.deductReason" class="deduct-reason">扣除原因：{{ deposit.deductReason }}</p>
          <p v-if="deposit.notes" class="deposit-notes">备注：{{ deposit.notes }}</p>
          <div class="deposit-actions" @click.stop>
            <button class="ghost small" @click="openDepositModal(deposit.id, 'edit')">编辑</button>
          </div>
        </article>
      </div>
    </section>

    <section v-if="tab === '保养记录'" class="layout">
      <form class="panel" @submit.prevent="addMaintenance">
        <h2>登记保养</h2>
        <select v-model="maintenanceForm.gearId">
          <option value="">选择装备</option>
          <option v-for="gear in myGears" :key="gear.id" :value="gear.id">{{ gear.name }}</option>
        </select>
        <input v-model="maintenanceForm.date" type="date" />
        <select v-model="maintenanceForm.type">
          <option v-for="t in maintenanceTypes" :key="t">{{ t }}</option>
        </select>
        <input v-model="maintenanceForm.handler" placeholder="处理人（默认为当前成员）" />
        <textarea v-model="maintenanceForm.description" placeholder="保养说明（清洁部位、维修内容、补充零件、检查结果等）"></textarea>
        <button>保存记录</button>
        <small v-if="myGears.length === 0" class="muted">当前成员名下暂无装备，无法登记保养记录。</small>
      </form>

      <div class="panel wide">
        <div class="toolbar">
          <h2>保养记录</h2>
          <select v-model="maintenanceFilter">
            <option v-for="opt in maintenanceGearOptions" :key="opt">{{ opt }}</option>
          </select>
        </div>
        <div v-if="filteredMaintenance.length === 0" class="muted" style="padding: 20px; text-align: center;">暂无保养记录</div>
        <div v-else class="requestList">
          <article v-for="record in filteredMaintenance" :key="record.id">
            <div>
              <strong>{{ record.gearName }}</strong>
              <span>{{ record.date }} · {{ record.type }} · 处理人 {{ record.handler }}</span>
            </div>
            <p>装备主人：{{ record.owner }}</p>
            <p v-if="record.description" style="margin-top: 6px;">{{ record.description }}</p>
            <div class="actions" v-if="record.owner === currentUser">
              <button class="ghost small danger" @click="deleteMaintenance(record.id)">删除</button>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section v-if="tab === '成员资料'" class="layout">
      <form class="panel" @submit.prevent="saveMember">
        <h2>{{ editingMemberId ? '编辑成员' : '添加成员' }}</h2>
        <input v-model="memberForm.nickname" placeholder="昵称" />
        <input v-model="memberForm.phone" placeholder="联系电话" />
        <input v-model="memberForm.area" placeholder="常用露营区域" />
        <textarea v-model="memberForm.notes" placeholder="备注"></textarea>
        <div class="split">
          <button>{{ editingMemberId ? '保存修改' : '添加成员' }}</button>
          <button v-if="editingMemberId" type="button" class="ghost" @click="cancelEditMember">取消</button>
        </div>
      </form>

      <div class="panel wide">
        <div class="toolbar">
          <h2>成员列表</h2>
          <span class="muted">共 {{ members.length }} 人</span>
        </div>

        <div v-if="deleteWarning" class="warning">
          <span>{{ deleteWarning }}</span>
          <button class="ghost small" @click="dismissWarning">关闭</button>
        </div>

        <div class="memberList">
          <article v-for="member in members" :key="member.id" class="member-card">
            <div class="member-info">
              <strong>{{ member.nickname }}</strong>
              <span v-if="member.phone">📞 {{ member.phone }}</span>
              <span v-if="member.area">🏕 {{ member.area }}</span>
              <small v-if="member.notes">{{ member.notes }}</small>
            </div>
            <div class="actions">
              <button class="ghost small" @click="editMember(member)">编辑</button>
              <button class="ghost small danger" @click="deleteMember(member)">删除</button>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section v-if="tab === '出行清单'" class="layout">
      <form class="panel" @submit.prevent="saveTrip">
        <h2>{{ editingTripId ? '编辑出行计划' : '创建出行计划' }}</h2>
        <input v-model="tripForm.destination" placeholder="目的地" />
        <input v-model="tripForm.startDate" type="date" />
        <div class="member-checkboxes">
          <label class="muted">参与成员</label>
          <div class="checkbox-list">
            <label v-for="member in members" :key="member.id" class="checkbox-item">
              <input type="checkbox" :value="member.nickname" v-model="tripForm.members" />
              <span>{{ member.nickname }}</span>
            </label>
          </div>
        </div>
        <div class="gear-select-section">
          <label class="muted">勾选要带的装备</label>
          <select v-model="tripCategoryFilter" style="margin-bottom: 8px;">
            <option v-for="cat in tripCategories" :key="cat">{{ cat }}</option>
          </select>
          <div class="gear-checklist">
            <label v-for="gear in tripFilteredGears" :key="gear.id" class="gear-checkbox-item">
              <input type="checkbox" :checked="isGearSelected(gear.id)" @change="toggleTripGearSelection(gear.id)" />
              <div class="gear-info">
                <span class="gear-name">{{ gear.name }}</span>
                <span class="gear-meta">{{ gear.category }} · {{ gear.owner }}</span>
                <span :class="['gear-status', gear.status === '可借' ? 'available' : 'unavailable']">{{ gear.status }}</span>
              </div>
            </label>
          </div>
        </div>
        <textarea v-model="tripForm.notes" placeholder="备注信息"></textarea>
        <div class="split">
          <button>{{ editingTripId ? '保存修改' : '创建计划' }}</button>
          <button v-if="editingTripId" type="button" class="ghost" @click="cancelEditTrip">取消</button>
        </div>
        <small class="muted">已选 {{ tripGears.length }} 件装备</small>
      </form>

      <div class="panel wide">
        <div class="toolbar">
          <h2>出行计划列表</h2>
          <span class="muted">共 {{ trips.length }} 个计划</span>
        </div>

        <div v-if="trips.length === 0" class="muted" style="padding: 20px; text-align: center;">暂无出行计划，创建一个吧！</div>

        <div v-else class="trip-layout">
          <div class="trip-list">
            <article
              v-for="trip in trips"
              :key="trip.id"
              :class="['trip-card', { active: selectedTripId === trip.id }]"
              @click="selectTrip(trip.id)"
            >
              <div class="trip-header">
                <strong>{{ trip.destination }}</strong>
                <span class="trip-date">🗓 {{ trip.startDate }}</span>
              </div>
              <div class="trip-meta">
                <span>👥 {{ trip.members.join('、') }}</span>
                <span>🎒 {{ trip.gears.length }} 件装备</span>
              </div>
              <div class="trip-actions" @click.stop>
                <button class="ghost small" @click="editTrip(trip)">编辑</button>
                <button class="ghost small danger" @click="deleteTrip(trip)">删除</button>
              </div>
            </article>
          </div>

          <div v-if="selectedTrip" class="trip-detail">
            <div class="trip-detail-header">
              <h3>{{ selectedTrip?.destination }}</h3>
              <span class="muted">出发日期：{{ selectedTrip?.startDate }}</span>
              <span class="muted">参与成员：{{ selectedTrip?.members?.join('、') }}</span>
              <p v-if="selectedTrip?.notes" class="trip-notes">{{ selectedTrip?.notes }}</p>
            </div>

            <div class="trip-gear-sections">
              <div class="gear-section">
                <div class="section-header">
                  <h4>待借清单 ({{ pendingGears.length }})</h4>
                </div>
                <div v-if="pendingGears.length === 0" class="muted" style="padding: 12px; text-align: center;">暂无待借装备</div>
                <div v-else class="gear-list">
                  <article v-for="gear in pendingGears" :key="gear.gearId" class="gear-list-item">
                    <div class="gear-list-info">
                      <strong>{{ gear.gearName }}</strong>
                      <span>装备主人：{{ gear.owner }} · 押金：{{ gear.deposit }}</span>
                      <span :class="['availability-badge', isGearAvailable(gear.gearId) ? 'available' : 'unavailable']">
                        {{ isGearAvailable(gear.gearId) ? '✓ 当前可借' : '✗ ' + getGearStatus(gear.gearId) }}
                      </span>
                    </div>
                    <div class="gear-list-actions">
                      <button class="ghost small" @click="updateTripGearStatus(gear.gearId, '已确认')">确认已借</button>
                      <button class="ghost small danger" @click="removeTripGear(gear.gearId)">移除</button>
                    </div>
                  </article>
                </div>
              </div>

              <div class="gear-section">
                <div class="section-header">
                  <h4>待确认候补 ({{ waitingGears.length }})</h4>
                </div>
                <div v-if="waitingGears.length === 0" class="muted" style="padding: 12px; text-align: center;">暂无待确认候补装备</div>
                <div v-else class="gear-list">
                  <article v-for="gear in waitingGears" :key="gear.gearId" class="gear-list-item waiting">
                    <div class="gear-list-info">
                      <strong>{{ gear.gearName }}</strong>
                      <span>装备主人：{{ gear.owner }} · 押金：{{ gear.deposit }}</span>
                      <span class="availability-badge unavailable">
                        候补原因：{{ gear.conflictReason || '待确认' }}
                      </span>
                      <span v-if="gear.queuePosition" class="availability-badge conflict">
                        候补顺位 #{{ gear.queuePosition }}
                      </span>
                    </div>
                    <div class="gear-list-actions">
                      <button class="ghost small" @click="tab = '预约排程'">查看预约</button>
                      <button class="ghost small" @click="updateTripGearStatus(gear.gearId, '待借')">改为待借</button>
                      <button class="ghost small danger" @click="removeTripGear(gear.gearId)">移除</button>
                    </div>
                  </article>
                </div>
              </div>

              <div class="gear-section">
                <div class="section-header">
                  <h4>已确认清单 ({{ confirmedGears.length }})</h4>
                </div>
                <div v-if="confirmedGears.length === 0" class="muted" style="padding: 12px; text-align: center;">暂无已确认装备</div>
                <div v-else class="gear-list">
                  <article v-for="gear in confirmedGears" :key="gear.gearId" class="gear-list-item confirmed">
                    <div class="gear-list-info">
                      <strong>{{ gear.gearName }}</strong>
                      <span>装备主人：{{ gear.owner }} · 押金：{{ gear.deposit }}</span>
                      <span :class="['availability-badge', isGearAvailable(gear.gearId) ? 'available' : 'unavailable']">
                        {{ isGearAvailable(gear.gearId) ? '✓ 当前可借' : '✗ ' + getGearStatus(gear.gearId) }}
                      </span>
                    </div>
                    <div class="gear-list-actions">
                      <button class="ghost small" @click="updateTripGearStatus(gear.gearId, '待借')">改为待借</button>
                      <button class="ghost small danger" @click="removeTripGear(gear.gearId)">移除</button>
                    </div>
                  </article>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="muted" style="padding: 40px; text-align: center;">选择左侧计划查看详情</div>
        </div>
      </div>
    </section>

    <InventoryPanel
      v-if="tab === '装备盘点'"
      :inventory-lists="inventoryLists"
      :gears="gears"
      :trips="trips"
      :members="members"
      :current-user="currentUser"
      :open-inventory-id="wrapUpEditingInventoryId"
      @update:inventory-lists="val => inventoryLists = val"
      @process-abnormal-action="handleProcessAbnormalAction"
      @log-event="logEvent"
    />

    <SettlementPanel
      v-if="tab === '费用结算'"
      :settlement-records="settlementRecords"
      :trips="trips"
      :members="members"
      :deposit-records="depositRecords"
      :gears="gears"
      :requests="requests"
      :inventory-lists="inventoryLists"
      :current-user="currentUser"
      :open-settlement-id="wrapUpEditingSettlementId"
      @update:settlement-records="val => settlementRecords = val"
      @log-event="logEvent"
      @view-timeline="(filter) => navigateToTimeline(filter)"
    />

    <TripWrapUpWizard
      v-if="tab === '出行收尾'"
      :trips="trips"
      :trip-wrap-up="tripWrapUp"
      :selected-trip-id="wrapUpSelectedTripId"
      :editing-inventory-id="wrapUpEditingInventoryId"
      :editing-settlement-id="wrapUpEditingSettlementId"
      :current-user="currentUser"
      @select-trip="handleWrapUpSelectTrip"
      @handle-return="handleWrapUpReturn"
      @create-inventory="handleWrapUpCreateInventory"
      @open-inventory="handleWrapUpOpenInventory"
      @confirm-deduct="handleWrapUpConfirmDeduct"
      @open-deposit="handleWrapUpOpenDeposit"
      @create-settlement="handleWrapUpCreateSettlement"
      @open-settlement="handleWrapUpOpenSettlement"
      @refresh-settlement="handleWrapUpRefreshSettlement"
      @finalize-settlement="handleWrapUpFinalizeSettlement"
    />

    <EventTimeline
      v-if="tab === '操作时间线'"
      :event-logs="eventLogs"
      :members="members"
      :gears="gears"
      :current-user="currentUser"
      :initial-filter="timelineFilterContext"
      @clear-context="clearTimelineContext"
    />

    <section v-if="tab === '我的借出' || tab === '我的借入'" class="panel">
      <h2>{{ tab }}</h2>
      <div class="requestList">
        <article v-for="item in (tab === '我的借出' ? myOut : myIn)" :key="item.id">
          <strong>{{ item.gearName }}</strong>
          <span>{{ item.status }} · {{ item.borrower }} · {{ item.start }}至{{ item.end }}</span>
          <p>损耗记录：{{ item.damage || '暂无' }}</p>
        </article>
      </div>
    </section>

    <DataImportExport
      v-if="tab === '数据导入导出'"
      :spaceData="getCurrentSpaceData() || {}"
      :spaceInfo="currentSpace"
      @imported="handleDataImported"
      @log-event="logEvent"
    />

    <div v-if="showTemplateModal" class="template-modal-overlay" @click.self="closeTemplateModal">
      <div class="template-modal-container">
        <div class="template-modal-header">
          <h2 v-if="templateModalMode === 'save'">💾 保存为模板</h2>
          <h2 v-else-if="templateModalMode === 'clone'">📋 从模板创建空间</h2>
          <h2 v-else>📋 模板管理</h2>
          <button class="ghost small" @click="closeTemplateModal">✕ 关闭</button>
        </div>

        <div v-if="templateModalMode === 'save'" class="template-modal-body">
          <p class="template-modal-desc">将当前空间「{{ currentSpace?.name }}」的配置保存为模板，以便快速创建相似配置的新空间。</p>
          <label class="template-label">模板名称</label>
          <input v-model="templateForm.name" placeholder="输入模板名称" />
          <label class="template-label">选择要包含的数据</label>
          <div class="template-checkboxes">
            <label v-for="(label, key) in TEMPLATE_ENTITY_LABELS" :key="key" class="template-checkbox">
              <input type="checkbox" v-model="templateForm.selectedEntities" :value="key" />
              <span>{{ label }}</span>
              <small class="muted">({{ (getCurrentSpaceData()?.[key] || []).length }})</small>
            </label>
          </div>
          <div class="template-modal-actions">
            <button @click="saveTemplateAction">保存模板</button>
            <button class="ghost" @click="closeTemplateModal">取消</button>
          </div>
        </div>

        <div v-if="templateModalMode === 'clone'" class="template-modal-body">
          <p class="template-modal-desc">选择模板并配置克隆选项，创建一个具有相同配置的新空间。所有 ID 将重新生成，不会影响原空间数据。</p>

          <label class="template-label">新空间名称</label>
          <input v-model="spaceForm.name" placeholder="输入新空间名称" />
          <label class="template-label">空间描述（可选）</label>
          <input v-model="spaceForm.description" placeholder="简要描述" />

          <label class="template-label">选择模板</label>
          <select v-model="cloneForm.templateId">
            <option v-for="tmpl in templateList" :key="tmpl.id" :value="tmpl.id">{{ tmpl.name }}（来自「{{ tmpl.sourceSpaceName }}」，{{ tmpl.createdAt }}）</option>
          </select>

          <div v-if="cloneForm.templateId" class="template-info-box">
            <p v-if="templateList.find(t => t.id === cloneForm.templateId)">
              <strong>模板内容：</strong>{{ getTemplateEntitySummary(templateList.find(t => t.id === cloneForm.templateId)) }}
            </p>
          </div>

          <label class="template-label">配置项复制</label>
          <div class="template-checkboxes">
            <label class="template-checkbox">
              <input type="checkbox" v-model="cloneForm.copyMembers" />
              <span>成员列表</span>
            </label>
            <label class="template-checkbox">
              <input type="checkbox" v-model="cloneForm.copyGears" />
              <span>装备配置</span>
            </label>
            <label class="template-checkbox">
              <input type="checkbox" v-model="cloneForm.copyMaintenanceRecords" />
              <span>保养记录</span>
            </label>
            <label class="template-checkbox">
              <input type="checkbox" v-model="cloneForm.copyDepositRules" />
              <span>押金规则</span>
            </label>
          </div>

          <label class="template-label">业务流水处理</label>
          <div class="template-checkboxes">
            <label class="template-checkbox">
              <input type="checkbox" v-model="cloneForm.clearBusinessFlow" />
              <span>清空业务流水（出行、申请、交接、盘点、结算、候补、日志）</span>
            </label>
            <label v-if="!cloneForm.clearBusinessFlow" class="template-checkbox" style="margin-left: 20px;">
              <input type="checkbox" v-model="cloneForm.copyExampleTrips" />
              <span>复制示例出行</span>
            </label>
          </div>

          <div class="template-clone-note">
            <p>💡 克隆说明：</p>
            <ul>
              <li>所有 ID 将重新生成，与原空间完全独立</li>
              <li>装备状态将重置为「可借」，损耗记录清空</li>
              <li>押金记录重置为「待收取」，金额信息保留</li>
              <li>出行装备状态重置为「待借」</li>
              <li>盘点项状态重置为「待盘点」</li>
            </ul>
          </div>

          <div class="template-modal-actions">
            <button @click="cloneFromTemplateAction">创建空间</button>
            <button class="ghost" @click="closeTemplateModal">取消</button>
          </div>
        </div>

        <div v-if="templateModalMode === 'list'" class="template-modal-body">
          <p class="template-modal-desc">管理已保存的空间模板。模板可快速复用成熟空间的成员和装备配置。</p>

          <div v-if="templateList.length === 0" class="template-empty">
            <p>暂无模板</p>
            <p class="muted">在空间菜单中点击「存模板」将当前空间保存为模板</p>
          </div>

          <div v-else class="template-list">
            <div v-for="tmpl in templateList" :key="tmpl.id" class="template-list-item">
              <div class="template-list-info">
                <strong>{{ tmpl.name }}</strong>
                <span class="muted">来源：{{ tmpl.sourceSpaceName || '未知' }} · {{ tmpl.createdAt }}</span>
                <p class="template-list-summary">{{ getTemplateEntitySummary(tmpl) }}</p>
              </div>
              <div class="template-list-actions">
                <button class="ghost small" @click="cloneForm.templateId = tmpl.id; templateModalMode = 'clone'; spaceForm = { name: '', description: '' }">克隆到新空间</button>
                <button class="ghost small danger" @click="deleteTemplateAction(tmpl.id)">删除</button>
              </div>
            </div>
          </div>

          <div class="template-modal-actions">
            <button class="ghost" @click="closeTemplateModal">关闭</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showHealthProfile" class="health-modal-overlay" @click.self="closeHealthProfile">
      <div class="health-modal-container">
        <EquipmentHealthProfile
          :gearId="currentHealthGearId"
          :gears="gears"
          :requests="requests"
          :handovers="handoverRecords"
          :maintenanceRecords="maintenanceRecords"
          :depositRecords="depositRecords"
          :inventory-lists="inventoryLists"
          @close="closeHealthProfile"
          @create-maintenance="handleCreateMaintenanceFromProfile"
          @view-timeline="viewGearTimeline"
        />
      </div>
    </div>
  </main>
</template>

<style>
.template-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(42, 38, 30, 0.6);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 24px 16px;
  overflow-y: auto;
  animation: fadeIn 0.2s ease;
}

.template-modal-container {
  width: 100%;
  max-width: 640px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  animation: slideUp 0.3s ease;
  margin-bottom: 40px;
}

.template-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #ece8d8;
}

.template-modal-header h2 {
  margin: 0;
  font-size: 18px;
  color: #2f4a2c;
}

.template-modal-body {
  padding: 20px 24px;
}

.template-modal-desc {
  color: #666;
  font-size: 13px;
  margin: 0 0 16px;
  line-height: 1.6;
}

.template-label {
  display: block;
  font-size: 13px;
  color: #555;
  font-weight: 600;
  margin: 16px 0 8px;
}

.template-checkboxes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.template-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #444;
  cursor: pointer;
  padding: 8px 10px;
  border-radius: 6px;
  background: #f7f9f5;
  transition: background 0.15s;
}

.template-checkbox:hover {
  background: #eef2e9;
}

.template-checkbox input {
  cursor: pointer;
}

.template-checkbox small {
  color: #999;
  font-size: 11px;
}

.template-info-box {
  margin-top: 8px;
  padding: 10px 12px;
  background: #f0f4ed;
  border-radius: 8px;
  font-size: 12px;
  color: #3a3730;
}

.template-info-box p {
  margin: 0;
}

.template-clone-note {
  margin-top: 16px;
  padding: 12px;
  background: #fffdf5;
  border: 1px solid #f0e5c0;
  border-radius: 8px;
  font-size: 12px;
  color: #6b5a2a;
}

.template-clone-note p {
  margin: 0 0 6px;
  font-weight: 600;
}

.template-clone-note ul {
  margin: 0;
  padding-left: 18px;
}

.template-clone-note li {
  margin-bottom: 3px;
  line-height: 1.5;
}

.template-modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #ece8d8;
}

.template-modal-actions button {
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.template-modal-actions button:not(.ghost) {
  background: #2f4a2c;
  color: #fff;
}

.template-modal-actions button:not(.ghost):hover {
  background: #3d5c37;
}

.template-empty {
  text-align: center;
  padding: 32px 0;
  color: #999;
}

.template-empty p:first-child {
  font-size: 16px;
  color: #666;
  margin-bottom: 6px;
}

.template-list-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 14px 0;
  border-bottom: 1px solid #f0ede4;
  gap: 12px;
}

.template-list-item:last-child {
  border-bottom: none;
}

.template-list-info {
  flex: 1;
}

.template-list-info strong {
  display: block;
  font-size: 14px;
  color: #2f4a2c;
  margin-bottom: 2px;
}

.template-list-info .muted {
  display: block;
  font-size: 11px;
}

.template-list-summary {
  margin: 4px 0 0;
  font-size: 12px;
  color: #63705d;
}

.template-list-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  align-items: flex-start;
}

.space-menu-divider {
  border-top: 1px solid #ece8d8;
  margin: 8px 0;
}

.space-menu-template-section {
  padding: 8px 0 4px;
}

.space-menu-template-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.space-menu-header-actions {
  display: flex;
  gap: 4px;
}

.health-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(42, 38, 30, 0.6);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 24px 16px;
  overflow-y: auto;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.health-modal-container {
  width: 100%;
  max-width: 1000px;
  animation: slideUp 0.3s ease;
  margin-bottom: 40px;
}

.gear-card {
  position: relative;
}

.maintenance-badge.plan-overdue {
  background: #fff6f4 !important;
  border: 1px solid #f5c8bf;
}

.maintenance-badge.plan-overdue span:first-child {
  color: #b02a2a !important;
}

.maintenance-badge.plan-upcoming {
  background: #fffaf2 !important;
  border: 1px solid #f0d5b0;
}

.maintenance-badge.plan-upcoming span:first-child {
  color: #8a5a2a !important;
}

.form-section {
  margin: 12px 0;
  padding: 12px;
  background: #faf9f4;
  border-radius: 8px;
  border: 1px solid #ece8d8;
}

.health-profile-btn {
  background: linear-gradient(135deg, #f0efe8, #e6e4d8);
  border: 1px solid #d4d0c4;
  color: #4a4638;
  transition: all 0.15s ease;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.health-profile-btn:hover {
  background: linear-gradient(135deg, #e6e4d8, #dcd8c8);
  border-color: #c4bfae;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(60, 50, 30, 0.08);
}

.cal-request.reservation {
  background: #fdf3e0;
  border-left: 3px solid #c58a2b;
}

.cal-request.reservation.已转正 {
  background: #e0f0e0;
  border-left: 3px solid #2f7a3a;
}

.cal-request.reservation .cal-req-status {
  color: #8a6d1b;
  font-size: 11px;
  font-weight: 600;
}

.legend-dot.reservation {
  background: #c58a2b;
  border: none;
  opacity: 0.8;
}

.reservation-shortcut {
  margin-top: 8px;
}

.reservation-shortcut select,
.reservation-shortcut input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d0d8c5;
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 8px;
  box-sizing: border-box;
  font-family: inherit;
}

.plan-btn {
  padding: 8px 16px;
  background: linear-gradient(135deg, #2f4a2c, #3d6b38);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s;
  font-family: inherit;
}

.plan-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #3d6b38, #4a7d44);
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(47, 74, 44, 0.3);
}

.plan-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.travel-plan-result {
  margin: 16px 0;
  padding: 16px;
  background: linear-gradient(135deg, #f0f7ee, #e6f0e2);
  border: 1px solid #c4ddb8;
  border-radius: 12px;
  animation: slideUp 0.3s ease;
}

.travel-plan-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  color: #2f4a2c;
  font-size: 16px;
}

.travel-plan-info {
  display: flex;
  gap: 16px;
  font-size: 14px;
  color: #3a5a36;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.travel-plan-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.plan-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 14px;
  border-radius: 8px;
  min-width: 64px;
}

.plan-stat.available {
  background: #d4edda;
  color: #155724;
}

.plan-stat.conflict {
  background: #fff3cd;
  color: #856404;
}

.plan-stat.unavailable {
  background: #f8d7da;
  color: #721c24;
}

.plan-stat.requests {
  background: #d1ecf1;
  color: #0c5460;
}

.plan-stat.reservations {
  background: #e2d5f1;
  color: #5b3a8c;
}

.plan-stat-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
}

.plan-stat-label {
  font-size: 11px;
  margin-top: 2px;
  opacity: 0.85;
}

.travel-plan-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.travel-plan-actions button {
  padding: 8px 16px;
  background: #2f4a2c;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.2s;
  font-family: inherit;
}

.travel-plan-actions button:hover {
  background: #3d5c37;
}

.travel-plan-actions button.ghost {
  background: transparent;
  color: #2f4a2c;
  border: 1px solid #c4ddb8;
}

.travel-plan-actions button.ghost:hover {
  background: #e6f0e2;
}

.avail-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  margin-left: 8px;
  flex-shrink: 0;
  align-self: center;
}

.avail-badge.available {
  background: #d4edda;
  color: #155724;
}

.avail-badge.conflict {
  background: #fff3cd;
  color: #856404;
}

.avail-badge.unavailable {
  background: #f8d7da;
  color: #721c24;
}

.recommend-gear-item.conflict {
  border-left: 3px solid #c58a2b;
}

.recommend-gear-item.unavailable {
  border-left: 3px solid #b02a2a;
  opacity: 0.85;
}

.reserve-hint {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  color: #5b3a8c;
  background: #e2d5f1;
  border-radius: 4px;
  cursor: pointer;
  margin-left: 4px;
  flex-shrink: 0;
  align-self: center;
  transition: background 0.15s;
  text-decoration: none;
}

.reserve-hint:hover {
  background: #d1c0e8;
  text-decoration: underline;
}

.member-select {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 4px;
}

.member-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #f5f9f0;
  border: 1px solid #d0d8c5;
  border-radius: 16px;
  cursor: pointer;
  font-size: 13px;
  color: #3a4a35;
  transition: all 0.15s;
  user-select: none;
}

.member-chip:hover {
  background: #e6f0e2;
  border-color: #b5c9a8;
}

.member-chip input[type="checkbox"] {
  margin: 0;
  width: 14px;
  height: 14px;
  accent-color: #4a7d44;
}

.member-hint {
  margin-top: -4px;
  margin-bottom: 12px;
  display: block;
  font-size: 11px;
}

.waitlist-section {
  margin: 14px 0;
  padding: 12px;
  background: #f9f5ff;
  border: 1px solid #d9c8f0;
  border-radius: 8px;
}

.waitlist-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  color: #5b3a8c;
  font-size: 14px;
}

.waitlist-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.waitlist-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: #fff;
  border-radius: 6px;
  font-size: 13px;
}

.waitlist-gear {
  font-weight: 600;
  color: #3a2c5a;
  min-width: 100px;
}

.waitlist-owner {
  font-size: 12px;
  min-width: 60px;
}

.waitlist-reason {
  flex: 1;
  font-size: 12px;
  color: #6b5b8a;
}

.waitlist-position {
  padding: 2px 8px;
  background: #e2d5f1;
  color: #5b3a8c;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}

.review-notification {
  background: linear-gradient(135deg, #2f4a2c 0%, #3d6b38 100%);
  color: #fff;
  padding: 14px 20px;
  border-radius: 10px;
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  animation: slideDown 0.3s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.review-notification-content {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.review-notification-icon {
  font-size: 24px;
}

.review-notification-info strong {
  font-size: 15px;
  display: block;
  margin-bottom: 4px;
}

.review-notification-details {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-tag {
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
}

.detail-tag.ok {
  background: rgba(255, 255, 255, 0.2);
}

.detail-tag.warning {
  background: rgba(197, 138, 43, 0.4);
}

.detail-tag.blocked {
  background: rgba(176, 42, 42, 0.4);
}

.review-notification-actions {
  display: flex;
  gap: 8px;
}

.review-notification-actions .primary {
  background: #fff;
  color: #2f4a2c;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.review-notification-actions .primary:hover {
  background: #f0f4e8;
  transform: translateY(-1px);
}

.review-notification-actions .ghost {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.review-notification-actions .ghost:hover {
  background: rgba(255, 255, 255, 0.25);
}

.primary.small {
  padding: 6px 12px;
  font-size: 13px;
}

.ghost.small {
  padding: 6px 12px;
  font-size: 13px;
}

.calendar-cell.has-review-highlight {
  position: relative;
  background: linear-gradient(135deg, #f9fbf6 0%, #f0f4e8 100%);
}

.review-highlight-indicator {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #c58a2b;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  animation: pulse 2s infinite;
}

.review-highlight-indicator.has-skipped {
  background: #8a6d1b;
}

.review-highlight-indicator.can-activate {
  background: #2d7a3e;
}

.review-highlight-indicator.has-warning {
  background: #d97706;
}

.review-highlight-indicator.has-blocker {
  background: #9ca3af;
  animation: none;
}

.review-highlight-indicator.high-priority {
  background: #b02a2a;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
  }
}

.cal-request.reservation.审核跳过 {
  background: #fdf8e8;
  border-left: 3px solid #8a6d1b;
}

.cal-request.reservation.审核跳过 .cal-req-status {
  color: #8a6d1b;
}

.legend-dot.审核跳过 {
  background: #8a6d1b;
  border: none;
  opacity: 0.8;
}

.legend-dot.review-highlight {
  background: #c58a2b;
  border: none;
  position: relative;
}

.legend-dot.review-highlight::after {
  content: '!';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}
</style>
