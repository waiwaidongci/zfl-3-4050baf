<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import DataImportExport from './components/DataImportExport.vue';
import EquipmentHealthProfile from './components/EquipmentHealthProfile.vue';
import InventoryPanel from './components/InventoryPanel.vue';
import SettlementPanel from './components/SettlementPanel.vue';
import ReservationPanel from './components/ReservationPanel.vue';
import { propagateMemberRename, cleanupDeletedTrip } from './utils/settlementTransform.js';
import { useReservation } from './composables/useReservation.js';
import { computeQueuePositions, expireOutdatedReservations, recalcAllPriorities } from './utils/reservationTransform.js';
import { buildAllHealthInfoMap } from './composables/useEquipmentHealth.js';
import {
  safeParseJSON,
  SPACE_LIST_KEY,
  CURRENT_SPACE_KEY,
  SPACE_DATA_PREFIX,
  hasOldData,
  iso,
  useSpaceStorage
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
    { id: crypto.randomUUID(), name: '双人轻量帐', category: '帐篷天幕', owner: ownerName, available: iso(1), deposit: '200', status: '可借', notes: '含地钉和防潮垫', damage: '' },
    { id: crypto.randomUUID(), name: '炉头套装', category: '炊具', owner: stoveOwner, available: iso(0), deposit: '80', status: '借出中', notes: '需自备气罐', damage: '' },
    { id: crypto.randomUUID(), name: '营地灯三件组', category: '照明', owner: lampOwner, available: iso(3), deposit: '50', status: '可借', notes: '满电交接', damage: '' }
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
      damage: req.damage || ''
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
    gears = rawGears ? safeParseJSON(rawGears, null) : null;
    if (!gears || !Array.isArray(gears)) {
      warnings.push('装备数据格式异常，已使用默认值');
      gears = defaultGears;
    } else {
      gears = gears.filter((g) => g && typeof g === 'object' && g.name);
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

  const msg = warnings.length > 0
    ? `已迁移旧数据到「默认社群」。${warnings.join('；')}。如数据异常，可在空间设置中重置。`
    : '已成功迁移旧数据到「默认社群」空间。';

  return { migrated: true, message: msg, spaceId: defaultSpaceId };
}

function saveSpaceData(spaceId) {
  saveSpace(spaceId);
}

function importSpaceData(spaceId, importedData) {
  const success = importIntoSpace(spaceId, importedData);
  if (!success) return false;
  const firstMember = spaceData.value[spaceId]?.members?.[0];
  if (firstMember && firstMember.nickname) {
    currentUser.value = firstMember.nickname;
  }
  return true;
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
  resetSpace(spaceId);
  if (currentSpaceId.value === spaceId) {
    const data = getCurrentSpaceData();
    if (data && data.members.length > 0) {
      currentUser.value = data.members[0].nickname;
    }
  }
  alert('空间数据已重置');
}

function handleDataImported(importedData) {
  if (!currentSpaceId.value) return;
  const success = importSpaceData(currentSpaceId.value, importedData);
  if (success) {
    console.log('数据导入成功');
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
    updateSpace(editingSpaceId.value, spaceForm.value.name, spaceForm.value.description);
  }
  closeSpaceModal();
}

function toggleSpaceMenu() {
  showSpaceMenu.value = !showSpaceMenu.value;
}

function closeSpaceMenu() {
  showSpaceMenu.value = false;
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

const currentUser = ref('阿岚');

const healthInfoMap = computed(() =>
  buildAllHealthInfoMap({
    gears: gears.value,
    requests: requests.value,
    handovers: handoverRecords.value,
    maintenanceRecords: maintenanceRecords.value,
    depositRecords: depositRecords.value
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

function triggerReservationCheck() {
  const result = reservationHelper.checkAndActivate();
  if (result.list) {
    reservations.value = result.list;
  }
  if (result.activated.length > 0) {
    for (const resId of result.activated) {
      const res = reservations.value.find((r) => r.id === resId);
      if (res) {
        handleReservationActivated(res);
      }
    }
  }
}

function handleReservationActivated(reservation) {
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
    damage: ''
  };
  requests.value = [newRequest, ...requests.value];
  alert(`候补预约「${reservation.gearName}」已自动转正，已生成借用申请`);
}

const showHealthProfile = ref(false);
const currentHealthGearId = ref('');
const tab = ref('装备库');
const category = ref('全部分类');
const requestFilter = ref('全部申请');
const form = ref({ name: '', category: '帐篷天幕', owner: '阿岚', available: iso(2), deposit: '100', status: '可借', notes: '' });
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
const recommendScene = ref('湖畔露营');
const recommendPeople = ref(2);
const recommendDays = ref(2);
const recommendationResult = ref({});
const gapList = ref([]);
const hasRecommended = ref(false);
const selectedRecommendGears = ref([]);
const recommendBorrower = ref(currentUser.value);
const recommendStart = ref(iso(2));
const recommendEnd = ref(iso(4));

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

  depositRecords.value = depositRecords.value.map((d) =>
    d.id === currentDepositId.value
      ? { ...depositForm.value, id: d.id, createdAt: d.createdAt, updatedAt: new Date().toISOString().slice(0, 10) }
      : d
  );
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

  if (currentHandoverId.value) {
    handoverRecords.value = handoverRecords.value.map((h) =>
      h.id === currentHandoverId.value ? { ...handoverForm.value } : h
    );
  } else {
    const newRecord = { ...handoverForm.value, id: crypto.randomUUID(), createdAt: new Date().toISOString().slice(0, 10) };
    handoverRecords.value = [newRecord, ...handoverRecords.value];
    currentHandoverId.value = newRecord.id;
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
      updateDepositStatus(deposit.id);
    }
  }

  if (returnHandover && returnHandover.ownerConfirmed && returnHandover.borrowerConfirmed) {
    const req = requests.value.find((r) => r.id === requestId);
    if (req) {
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
  if (editingTripId.value) {
    trips.value = trips.value.map((t) =>
      t.id === editingTripId.value
        ? {
            ...t,
            destination: tripForm.value.destination.trim(),
            startDate: tripForm.value.startDate,
            members: [...tripForm.value.members],
            gears: [...tripGears.value],
            notes: tripForm.value.notes
          }
        : t
    );
    if (selectedTripId.value === editingTripId.value) {
      selectedTripId.value = editingTripId.value;
    }
    editingTripId.value = null;
  } else {
    const newTrip = {
      id: crypto.randomUUID(),
      destination: tripForm.value.destination.trim(),
      startDate: tripForm.value.startDate,
      members: [...tripForm.value.members],
      gears: [...tripGears.value],
      notes: tripForm.value.notes
    };
    trips.value = [newTrip, ...trips.value];
    selectedTripId.value = newTrip.id;
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
  trips.value = trips.value.map((t) =>
    t.id === selectedTrip.value.id
      ? {
          ...t,
          gears: t.gears.map((g) => (g.gearId === gearId ? { ...g, status } : g))
        }
      : t
  );
}

function removeTripGear(gearId) {
  if (!selectedTrip.value) return;
  if (!confirm('确定从清单中移除该装备吗？')) return;
  trips.value = trips.value.map((t) =>
    t.id === selectedTrip.value.id
      ? {
          ...t,
          gears: t.gears.filter((g) => g.gearId !== gearId)
        }
      : t
  );
}

function addGear() {
  if (!form.value.name.trim()) return;
  gears.value = [{ id: crypto.randomUUID(), ...form.value, damage: '' }, ...gears.value];
  form.value = { name: '', category: '帐篷天幕', owner: currentUser.value, available: iso(2), deposit: '100', status: '可借', notes: '' };
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
    requests.value = requests.value.map((item) =>
      item.id === editingDraftId.value
        ? { ...item, ...requestForm.value, gearId: gear.id, gearName: gear.name, owner: gear.owner, status: '待处理' }
        : item
    );
    editingDraftId.value = null;
    alert('草稿已提交');
  } else {
    requests.value = [{ id: crypto.randomUUID(), gearId: gear.id, gearName: gear.name, owner: gear.owner, status: '待处理', damage: '', ...requestForm.value }, ...requests.value];
  }
  requestForm.value = { gearId: '', borrower: currentUser.value, start: iso(2), end: iso(4), reason: '' };
}

function saveDraft() {
  const gear = gears.value.find((item) => item.id === requestForm.value.gearId);
  if (!gear || !requestForm.value.borrower) return;
  if (editingDraftId.value) {
    requests.value = requests.value.map((item) =>
      item.id === editingDraftId.value
        ? { ...item, ...requestForm.value, gearId: gear.id, gearName: gear.name, owner: gear.owner }
        : item
    );
    editingDraftId.value = null;
    alert('草稿已更新');
  } else {
    requests.value = [{ id: crypto.randomUUID(), gearId: gear.id, gearName: gear.name, owner: gear.owner, status: '草稿', damage: '', ...requestForm.value }, ...requests.value];
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
  requests.value = requests.value.map((item) => item.id === id ? { ...item, status } : item);
  if (record && status === '已同意') {
    gears.value = gears.value.map((gear) => gear.id === record.gearId ? { ...gear, status: '借出中' } : gear);
    const existingDeposit = getDepositByRequest(record.id);
    if (!existingDeposit) {
      const newDeposit = createDepositRecord(record.id);
      if (newDeposit) {
        depositRecords.value = [newDeposit, ...depositRecords.value];
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
    const oldNickname = oldMember ? oldMember.nickname : '';
    const newNickname = memberForm.value.nickname.trim();
    members.value = members.value.map((m) =>
      m.id === editingMemberId.value
        ? { ...m, nickname: newNickname, phone: memberForm.value.phone, area: memberForm.value.area, notes: memberForm.value.notes }
        : m
    );
    if (oldNickname !== newNickname) {
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
    }
    editingMemberId.value = null;
  } else {
    members.value = [{ id: crypto.randomUUID(), nickname: memberForm.value.nickname.trim(), phone: memberForm.value.phone, area: memberForm.value.area, notes: memberForm.value.notes }, ...members.value];
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
  maintenanceRecords.value = [{
    id: crypto.randomUUID(),
    gearId: gear.id,
    gearName: gear.name,
    owner: gear.owner,
    date: maintenanceForm.value.date,
    type: maintenanceForm.value.type,
    description: maintenanceForm.value.description,
    handler
  }, ...maintenanceRecords.value];
  maintenanceForm.value = { gearId: '', date: iso(0), type: '清洁', description: '', handler: '' };
}

function deleteMaintenance(id) {
  if (!confirm('确定删除该保养记录？')) return;
  maintenanceRecords.value = maintenanceRecords.value.filter((r) => r.id !== id);
}

const recommendCategories = ['帐篷天幕', '炊具', '照明', '桌椅收纳', '安全急救'];

function getCategoryRequirements(scene, people, days) {
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

  return base;
}

function generateRecommendation() {
  const availableGears = gears.value.filter((g) => g.status === '可借');
  const requirements = getCategoryRequirements(recommendScene.value, recommendPeople.value, recommendDays.value);
  const result = {};
  const gaps = [];

  for (const category of recommendCategories) {
    const needed = requirements[category] || 0;
    const categoryGears = availableGears.filter((g) => g.category === category);
    const recommended = categoryGears.slice(0, needed);
    const shortfall = needed - recommended.length;

    result[category] = {
      needed,
      available: categoryGears.length,
      recommended,
      shortfall
    };

    if (shortfall > 0) {
      gaps.push({
        category,
        needed,
        available: categoryGears.length,
        shortfall
      });
    }
  }

  recommendationResult.value = result;
  gapList.value = gaps;
  hasRecommended.value = true;
  selectedRecommendGears.value = [];

  for (const category of recommendCategories) {
    for (const gear of result[category].recommended) {
      selectedRecommendGears.value.push(gear.id);
    }
  }
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

function addRecommendationToRequests() {
  if (selectedRecommendGears.value.length === 0) {
    alert('请至少选择一件装备');
    return;
  }
  if (!recommendBorrower.value) {
    alert('请选择借用人');
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

  let addedCount = 0;
  for (const gearId of selectedRecommendGears.value) {
    const gear = gears.value.find((g) => g.id === gearId);
    if (!gear || gear.status !== '可借') continue;

    const conflicts = findConflictingRequests(gear.id, recommendStart.value, recommendEnd.value);
    if (conflicts.length > 0) {
      alert(`装备「${gear.name}」在所选日期范围内存在冲突，已跳过`);
      continue;
    }

    requests.value = [{
      id: crypto.randomUUID(),
      gearId: gear.id,
      gearName: gear.name,
      owner: gear.owner,
      borrower: recommendBorrower.value,
      start: recommendStart.value,
      end: recommendEnd.value,
      status: '草稿',
      damage: '',
      reason: `${recommendScene.value}·${recommendPeople.value}人·${recommendDays.value}天 套装推荐`
    }, ...requests.value];
    addedCount++;
  }

  if (addedCount > 0) {
    alert(`已成功保存 ${addedCount} 条借用申请草稿，请前往申请列表提交`);
    tab.value = '申请列表';
  } else {
    alert('没有可添加的装备');
  }
}

watch(currentUser, (newVal) => {
  recommendBorrower.value = newVal;
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

function handleReservationPanelUpdate(newList) {
  reservations.value = newList;
}

function handleReservationPanelActivate(reservation) {
  handleReservationActivated(reservation);
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
    if (res.status !== '候补中' && res.status !== '已转正') return false;
    if (rowType === 'gear' && res.gearId !== rowKey) return false;
    if (rowType === 'member' && res.borrower !== rowKey) return false;
    const resStart = new Date(res.start);
    const resEnd = new Date(res.end);
    return date >= resStart && date <= resEnd;
  });
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
              <button class="ghost small" @click="openCreateSpaceModal">+ 新建</button>
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
      <button v-for="item in ['装备库','装备推荐','申请列表','预约排程','借用日历','交接确认单','押金台账','保养记录','出行清单','装备盘点','费用结算','成员资料','我的借出','我的借入','数据导入导出']" :key="item" :class="{ active: tab === item }" @click="tab = item">{{ item }}</button>
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
        <h2>登记装备</h2>
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
        <textarea v-model="form.notes" placeholder="使用注意事项"></textarea>
        <button>保存装备</button>
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
            <div v-if="lastMaintenanceByGear[gear.id]" class="maintenance-badge" style="margin-top: 10px; padding: 8px 10px; background: #edf1e8; border-radius: 6px; font-size: 12px;">
              <span style="color: #2f4a2c; font-weight: 600;">最近保养：</span>
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
        <label class="muted">参与人数</label>
        <input v-model.number="recommendPeople" type="number" min="1" max="20" />
        <label class="muted">露营天数</label>
        <input v-model.number="recommendDays" type="number" min="1" max="30" />
        <label class="muted">借用人</label>
        <select v-model="recommendBorrower">
          <option v-for="member in members" :key="member.id">{{ member.nickname }}</option>
        </select>
        <label class="muted">借用起止日期</label>
        <div class="split">
          <input v-model="recommendStart" type="date" />
          <input v-model="recommendEnd" type="date" />
        </div>
        <button>生成推荐</button>
        <small class="muted">系统将根据场景、人数、天数智能推荐装备，并自动避开借出中装备。</small>
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
                  :class="['recommend-gear-item', { selected: isRecommendGearSelected(gear.id) }]"
                >
                  <input type="checkbox" :checked="isRecommendGearSelected(gear.id)" @change="toggleRecommendGearSelection(gear.id)" />
                  <div class="gear-info">
                    <span class="gear-name">{{ gear.name }}</span>
                    <span class="gear-meta">装备主人：{{ gear.owner }} · 押金：¥{{ gear.deposit }}</span>
                    <span v-if="gear.notes" class="gear-notes">{{ gear.notes }}</span>
                  </div>
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
        @activate="handleReservationPanelActivate"
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
          <div v-for="date in weekDates" :key="date" :class="['calendar-cell', { today: date === iso(0) }]">
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
                <div class="cal-req-status">候补</div>
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
      @update:inventory-lists="val => inventoryLists = val"
    />

    <SettlementPanel
      v-if="tab === '费用结算'"
      :settlement-records="settlementRecords"
      :trips="trips"
      :members="members"
      :deposit-records="depositRecords"
      :gears="gears"
      :requests="requests"
      :current-user="currentUser"
      @update:settlement-records="val => settlementRecords = val"
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
    />

    <div v-if="showHealthProfile" class="health-modal-overlay" @click.self="closeHealthProfile">
      <div class="health-modal-container">
        <EquipmentHealthProfile
          :gearId="currentHealthGearId"
          :gears="gears"
          :requests="requests"
          :handovers="handoverRecords"
          :maintenanceRecords="maintenanceRecords"
          :depositRecords="depositRecords"
          @close="closeHealthProfile"
        />
      </div>
    </div>
  </main>
</template>

<style>
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
</style>
