<script setup>
import { computed, onMounted, ref, watch } from 'vue';

const today = new Date();
const iso = (offset = 0) => {
  const date = new Date(today);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

const defaultMembers = [
  { id: crypto.randomUUID(), nickname: '阿岚', phone: '', area: '', notes: '' },
  { id: crypto.randomUUID(), nickname: '梁序', phone: '', area: '', notes: '' },
  { id: crypto.randomUUID(), nickname: '小北', phone: '', area: '', notes: '' },
  { id: crypto.randomUUID(), nickname: '陈默', phone: '', area: '', notes: '' }
];

const members = ref(defaultMembers);
const currentUser = ref('阿岚');
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

const gears = ref([
  { id: crypto.randomUUID(), name: '双人轻量帐', category: '帐篷天幕', owner: '阿岚', available: iso(1), deposit: '200', status: '可借', notes: '含地钉和防潮垫', damage: '' },
  { id: crypto.randomUUID(), name: '炉头套装', category: '炊具', owner: '梁序', available: iso(0), deposit: '80', status: '借出中', notes: '需自备气罐', damage: '' },
  { id: crypto.randomUUID(), name: '营地灯三件组', category: '照明', owner: '小北', available: iso(3), deposit: '50', status: '可借', notes: '满电交接', damage: '' }
]);

const requests = ref([
  { id: crypto.randomUUID(), gearId: gears.value[1].id, gearName: '炉头套装', owner: '梁序', borrower: '阿岚', start: iso(-1), end: iso(2), status: '已同意', reason: '周末湖边露营', damage: '' },
  { id: crypto.randomUUID(), gearId: gears.value[2].id, gearName: '营地灯三件组', owner: '小北', borrower: '陈默', start: iso(3), end: iso(5), status: '待处理', reason: '夜钓备用', damage: '' }
]);

function findGearForMaintenance(record, gearList = gears.value) {
  return gearList.find((gear) => gear.id === record.gearId)
    || gearList.find((gear) => gear.name === record.gearName && gear.owner === record.owner);
}

function normalizeMaintenanceRecords(records, gearList = gears.value) {
  return records
    .map((record) => {
      const gear = findGearForMaintenance(record, gearList);
      return gear ? { ...record, gearId: gear.id, gearName: gear.name, owner: gear.owner } : null;
    })
    .filter(Boolean);
}

function createDefaultMaintenanceRecords(gearList = gears.value) {
  const findGear = (name, owner) => gearList.find((gear) => gear.name === name && gear.owner === owner);
  const tent = findGear('双人轻量帐', '阿岚');
  const stove = findGear('炉头套装', '梁序');
  return [
    tent && { id: crypto.randomUUID(), gearId: tent.id, gearName: tent.name, owner: tent.owner, date: iso(-7), type: '清洁', description: '内外帐全面擦拭，通风晾干', handler: '阿岚' },
    tent && { id: crypto.randomUUID(), gearId: tent.id, gearName: tent.name, owner: tent.owner, date: iso(-20), type: '检查', description: '检查地钉和防风绳，状态良好', handler: '阿岚' },
    stove && { id: crypto.randomUUID(), gearId: stove.id, gearName: stove.name, owner: stove.owner, date: iso(-3), type: '补件', description: '更换了新的密封圈和点火电极', handler: '梁序' }
  ].filter(Boolean);
}

const maintenanceRecords = ref(createDefaultMaintenanceRecords());

function createDefaultTrips(gearList = gears.value, memberList = members.value) {
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

const trips = ref(createDefaultTrips());

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

const handoverRecords = ref([]);

const depositStatusList = ['全部状态', '待收取', '已收取', '部分扣除', '已扣除', '已退还', '异常'];
const depositFilter = ref('全部状态');
const depositMemberFilter = ref('全部成员');
const depositGearFilter = ref('全部装备');
const depositRecords = ref([]);
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

function validateAmount(value, allowZero = true) {
  if (value === '' || value === null || value === undefined) return { valid: false, message: '金额不能为空' };
  const num = Number(value);
  if (isNaN(num)) return { valid: false, message: '请输入有效的数字' };
  if (num < 0) return { valid: false, message: '金额不能为负数' };
  if (!allowZero && num === 0) return { valid: false, message: '金额不能为零' };
  return { valid: true, message: '', amount: num };
}

function normalizeDepositRecords(records, gearList = gears.value, requestList = requests.value) {
  return records.map((record) => {
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
  });
}

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

function normalizeHandoverRecords(records, gearList = gears.value, requestList = requests.value) {
  return records.map((record) => {
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
  });
}

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

function normalizeTrips(storedTrips, gearList = gears.value, memberList = members.value) {
  const memberNames = memberList.map((m) => m.nickname);
  return storedTrips.map((trip) => ({
    ...trip,
    members: trip.members.filter((m) => memberNames.includes(m)),
    gears: trip.gears
      .map((g) => {
        const gear = gearList.find((gear) => gear.id === g.gearId);
        if (!gear) return null;
        return {
          ...g,
          gearName: gear.name,
          owner: gear.owner,
          deposit: gear.deposit
        };
      })
      .filter(Boolean)
  }));
}

function normalizeRequests(storedRequests, gearList = gears.value) {
  const today = new Date();
  const iso = (offset = 0) => {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  return storedRequests.map((req) => {
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
  });
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

onMounted(() => {
  const storedMembers = localStorage.getItem('zfl-3-members');
  const storedGears = localStorage.getItem('zfl-3-gears');
  const storedRequests = localStorage.getItem('zfl-3-requests');
  const storedMaintenance = localStorage.getItem('zfl-3-maintenance');
  const storedTrips = localStorage.getItem('zfl-3-trips');
  const storedHandovers = localStorage.getItem('zfl-3-handovers');
  const storedDeposits = localStorage.getItem('zfl-3-deposits');
  if (storedMembers) members.value = JSON.parse(storedMembers);
  if (storedGears) gears.value = JSON.parse(storedGears);
  requests.value = storedRequests
    ? normalizeRequests(JSON.parse(storedRequests), gears.value)
    : requests.value;
  maintenanceRecords.value = storedMaintenance
    ? normalizeMaintenanceRecords(JSON.parse(storedMaintenance), gears.value)
    : createDefaultMaintenanceRecords(gears.value);
  trips.value = storedTrips
    ? normalizeTrips(JSON.parse(storedTrips), gears.value, members.value)
    : createDefaultTrips(gears.value, members.value);
  handoverRecords.value = storedHandovers
    ? normalizeHandoverRecords(JSON.parse(storedHandovers), gears.value, requests.value)
    : [];
  depositRecords.value = storedDeposits
    ? normalizeDepositRecords(JSON.parse(storedDeposits), gears.value, requests.value)
    : [];
  if (trips.value.length > 0 && !selectedTripId.value) {
    selectedTripId.value = trips.value[0].id;
  }
});

watch(members, (value) => localStorage.setItem('zfl-3-members', JSON.stringify(value)), { deep: true });
watch(gears, (value) => localStorage.setItem('zfl-3-gears', JSON.stringify(value)), { deep: true });
watch(requests, (value) => localStorage.setItem('zfl-3-requests', JSON.stringify(value)), { deep: true });
watch(maintenanceRecords, (value) => localStorage.setItem('zfl-3-maintenance', JSON.stringify(value)), { deep: true });
watch(trips, (value) => localStorage.setItem('zfl-3-trips', JSON.stringify(value)), { deep: true });
watch(handoverRecords, (value) => localStorage.setItem('zfl-3-handovers', JSON.stringify(value)), { deep: true });
watch(depositRecords, (value) => localStorage.setItem('zfl-3-deposits', JSON.stringify(value)), { deep: true });

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
  const conflicts = findConflictingRequests(gear.id, requestForm.value.start, requestForm.value.end);
  if (conflicts.length > 0) {
    conflictDetails.value = conflicts;
    conflictWarning.value = `该装备在所选日期范围内存在 ${conflicts.length} 条冲突记录，请调整日期后再提交。`;
    return;
  }
  conflictWarning.value = '';
  conflictDetails.value = [];
  requests.value = [{ id: crypto.randomUUID(), gearId: gear.id, gearName: gear.name, owner: gear.owner, status: '待处理', damage: '', ...requestForm.value }, ...requests.value];
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
  if (gearCount > 0 || borrowCount > 0 || ownCount > 0 || maintenanceOwnerCount > 0 || maintenanceHandlerCount > 0 || tripMemberCount > 0 || tripGearOwnerCount > 0) {
    const reasons = [];
    if (gearCount > 0) reasons.push(`${gearCount}件登记装备`);
    if (ownCount > 0) reasons.push(`${ownCount}条作为出借人的申请`);
    if (borrowCount > 0) reasons.push(`${borrowCount}条作为借用人的申请`);
    if (maintenanceOwnerCount > 0) reasons.push(`${maintenanceOwnerCount}条装备保养记录`);
    if (maintenanceHandlerCount > 0) reasons.push(`${maintenanceHandlerCount}条作为处理人的保养记录`);
    if (tripMemberCount > 0) reasons.push(`${tripMemberCount}个出行计划的参与成员`);
    if (tripGearOwnerCount > 0) reasons.push(`${tripGearOwnerCount}个出行计划的装备主人`);
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
</script>

<template>
  <main>
    <header class="hero">
      <div>
        <p>露营装备共享社群</p>
        <h1>装备借用工作台</h1>
      </div>
      <label>
        当前成员
        <select v-model="currentUser">
          <option v-for="member in members" :key="member.id">{{ member.nickname }}</option>
        </select>
      </label>
    </header>

    <nav class="tabs">
      <button v-for="item in ['装备库','申请列表','借用日历','交接确认单','押金台账','保养记录','出行清单','成员资料','我的借出','我的借入']" :key="item" :class="{ active: tab === item }" @click="tab = item">{{ item }}</button>
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
      <article><strong>{{ members.length }}</strong><span>社群成员</span></article>
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
          <article v-for="gear in filteredGears" :key="gear.id">
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
          </article>
        </div>
      </div>
    </section>

    <section v-if="tab === '申请列表'" class="layout">
      <form class="panel" @submit.prevent="applyGear">
        <h2>发起借用</h2>
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
        <button>提交申请</button>

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
            <option>待处理</option>
            <option>已同意</option>
            <option>已拒绝</option>
            <option>已归还</option>
          </select>
        </div>
        <div class="requestList">
          <article v-for="item in requestList" :key="item.id">
            <div>
              <strong>{{ item.gearName }}</strong>
              <span>{{ item.borrower }}申请 · {{ item.start }}至{{ item.end }}</span>
            </div>
            <p>{{ item.status }} · 装备主人{{ item.owner }} · {{ item.reason }}</p>
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
            </div>
          </div>
        </div>
      </div>

      <div class="calendar-legend">
        <span class="legend-item"><span class="legend-dot 待处理"></span>待处理</span>
        <span class="legend-item"><span class="legend-dot 已同意"></span>已同意</span>
        <span class="legend-item"><span class="legend-dot 借出中"></span>借出中</span>
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

    <div v-if="showDepositModal" class="modal-overlay" @click.self="closeDepositModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>{{ depositModalMode === 'edit' ? '编辑押金记录' : '押金详情' }}</h3>
          <button class="ghost small" @click="closeDepositModal">关闭</button>
        </div>
        <div class="modal-body">
          <div class="handover-info">
            <div class="info-row">
              <span class="info-label">装备名称</span>
              <span class="info-value">{{ depositForm.gearName }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">出借人</span>
              <span class="info-value">{{ depositForm.owner }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">借用人</span>
              <span class="info-value">{{ depositForm.borrower }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">当前状态</span>
              <span :class="['info-value', 'deposit-status-badge', depositForm.status]">{{ depositForm.status }}</span>
            </div>
          </div>

          <div class="form-group">
            <label>押金应收（元）</label>
            <input v-model="depositForm.depositAmount" :disabled="depositModalMode !== 'edit'" type="number" min="0" placeholder="押金金额" />
          </div>

          <div class="form-group">
            <label>已收金额（元）</label>
            <input v-model="depositForm.receivedAmount" :disabled="depositModalMode !== 'edit'" type="number" min="0" placeholder="已收取的押金金额" />
          </div>

          <div class="form-group">
            <label>扣除金额（元）</label>
            <input v-model="depositForm.deductedAmount" :disabled="depositModalMode !== 'edit'" type="number" min="0" placeholder="因损耗扣除的金额" />
          </div>

          <div class="form-group">
            <label>退还金额（元）</label>
            <input v-model="depositForm.refundedAmount" :disabled="depositModalMode !== 'edit'" type="number" min="0" placeholder="已退还的金额" />
          </div>

          <div class="form-group">
            <label>扣除原因</label>
            <textarea v-model="depositForm.deductReason" :disabled="depositModalMode !== 'edit'" placeholder="扣除押金的原因"></textarea>
          </div>

          <div class="form-group">
            <label>备注</label>
            <textarea v-model="depositForm.notes" :disabled="depositModalMode !== 'edit'" placeholder="其他备注信息"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="ghost" @click="closeDepositModal">取消</button>
          <button v-if="depositModalMode === 'edit'" @click="saveDepositRecord">保存</button>
        </div>
      </div>
    </div>

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

    <div v-if="showHandoverModal" class="modal-overlay" @click.self="closeHandoverModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>{{ handoverModalMode }}交接确认单</h3>
          <button class="ghost small" @click="closeHandoverModal">关闭</button>
        </div>
        <div class="modal-body">
          <div class="handover-info">
            <div class="info-row">
              <span class="info-label">装备名称</span>
              <span class="info-value">{{ handoverForm.gearName }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">出借人</span>
              <span class="info-value">{{ handoverForm.owner }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">借用人</span>
              <span class="info-value">{{ handoverForm.borrower }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">交接日期</span>
              <span class="info-value">{{ handoverForm.createdAt || new Date().toISOString().slice(0, 10) }}</span>
            </div>
          </div>

          <div class="form-group">
            <label>装备状态</label>
            <textarea v-model="handoverForm.gearStatus" placeholder="描述装备当前状态，如：完好、有轻微划痕等"></textarea>
          </div>

          <div class="form-group">
            <label>押金（元）</label>
            <input v-model="handoverForm.deposit" placeholder="押金金额" />
          </div>

          <div class="form-group">
            <label>配件清单</label>
            <textarea v-model="handoverForm.accessories" placeholder="列出随装备交接的配件，如：地钉、防潮垫、收纳袋等"></textarea>
          </div>

          <div class="form-group">
            <label>交接备注</label>
            <textarea v-model="handoverForm.handoverNotes" placeholder="其他需要说明的事项"></textarea>
          </div>

          <div v-if="handoverModalMode === '归还'" class="form-group">
            <label>损耗记录</label>
            <textarea v-model="handoverForm.damageRecord" placeholder="记录归还时的损耗情况，没有则填写无"></textarea>
          </div>

          <div v-if="handoverModalMode === '归还'" class="form-group">
            <label>押金扣除金额（元）</label>
            <input v-model="handoverForm.deductAmount" type="number" min="0" placeholder="填写扣除金额，0表示不扣除" />
            <small class="muted">押金总额：¥{{ handoverForm.deposit || 0 }}</small>
          </div>

          <div v-if="handoverModalMode === '归还'" class="form-group">
            <label>扣除原因</label>
            <textarea v-model="handoverForm.deductReason" placeholder="说明扣除押金的原因，如装备损坏、配件丢失等"></textarea>
          </div>

          <div class="confirm-section">
            <h4>双方确认</h4>
            <div class="confirm-buttons">
              <button
                :class="['confirm-btn', { confirmed: handoverForm.ownerConfirmed }]"
                @click="toggleHandoverConfirm('owner')"
                type="button"
              >
                {{ handoverForm.ownerConfirmed ? '✓ 已确认' : '出借人确认' }}
              </button>
              <button
                :class="['confirm-btn', { confirmed: handoverForm.borrowerConfirmed }]"
                @click="toggleHandoverConfirm('borrower')"
                type="button"
              >
                {{ handoverForm.borrowerConfirmed ? '✓ 已确认' : '借用人确认' }}
              </button>
            </div>
            <p v-if="handoverForm.ownerConfirmed && handoverForm.borrowerConfirmed" class="confirm-success">
              双方已确认，交接完成！
            </p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="ghost" @click="closeHandoverModal">取消</button>
          <button @click="saveHandover">保存交接单</button>
        </div>
      </div>
    </div>
  </main>
</template>

<style>
* { box-sizing: border-box; }
body { margin: 0; background: #f2f4ed; color: #22251f; font-family: Inter, "PingFang SC", Arial, sans-serif; }
button, input, select, textarea { font: inherit; }
main { min-height: 100vh; padding: 28px; }
.hero { display: flex; justify-content: space-between; gap: 20px; align-items: end; padding: 30px; border-radius: 8px; color: #fff; background: linear-gradient(135deg, #263623, #84704f); }
.hero p { margin: 0 0 6px; opacity: .8; }
h1 { margin: 0; font-size: clamp(32px, 5vw, 56px); letter-spacing: 0; }
h2 { margin: 0; font-size: 18px; }
.hero label { display: grid; gap: 8px; min-width: 190px; }
.tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
.tabs button { background: #fff; color: #303427; border: 1px solid #d8dccf; }
.tabs .active { background: #2f4a2c; color: #fff; }
.metrics { display: grid; grid-template-columns: repeat(7, 1fr); gap: 12px; margin-bottom: 16px; }
.metrics article, .panel, .cards article, .requestList article { background: #fff; border: 1px solid #dfe3d5; border-radius: 8px; padding: 18px; box-shadow: 0 10px 28px rgb(33 42 27 / .07); }
.metrics strong { display: block; font-size: 28px; }
.metrics span, article span, p, small { color: #63705d; }
.layout { display: grid; grid-template-columns: 340px 1fr; gap: 16px; align-items: start; }
form.panel { display: flex; flex-direction: column; gap: 10px; }
input, select, textarea { width: 100%; border: 1px solid #cfd8ca; border-radius: 8px; padding: 11px 12px; background: #fff; color: #22251f; }
textarea { min-height: 96px; resize: vertical; }
button { border: 0; border-radius: 8px; padding: 11px 14px; background: #2f4a2c; color: #fff; cursor: pointer; }
.ghost { background: #edf1e8; color: #2c3527; }
.ghost.small { padding: 6px 12px; font-size: 13px; }
.ghost.danger { color: #9b2c2c; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.toolbar { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 14px; }
.toolbar select { max-width: 220px; }
.muted { color: #63705d; font-size: 14px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
article strong, article span { display: block; }
article span { margin-top: 5px; }
.requestList, .memberList { display: grid; gap: 10px; }
.warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; gap: 12px; color: #92400e; font-size: 14px; }
.member-card { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.member-info { flex: 1; }
.member-info small { display: block; margin-top: 6px; }
.actions { display: flex; gap: 8px; margin-top: 10px; }

.member-checkboxes, .gear-select-section { display: flex; flex-direction: column; gap: 6px; }
.checkbox-list { display: flex; flex-direction: column; gap: 6px; max-height: 120px; overflow-y: auto; border: 1px solid #cfd8ca; border-radius: 8px; padding: 8px; }
.checkbox-item { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 4px 6px; border-radius: 4px; }
.checkbox-item:hover { background: #edf1e8; }
.checkbox-item input { width: auto; margin: 0; }
.checkbox-item span { margin: 0; color: #22251f; }

.gear-checklist { display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; border: 1px solid #cfd8ca; border-radius: 8px; padding: 8px; }
.gear-checkbox-item { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; padding: 8px; border-radius: 6px; }
.gear-checkbox-item:hover { background: #edf1e8; }
.gear-checkbox-item input { width: auto; margin-top: 4px; }
.gear-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.gear-name { font-weight: 600; color: #22251f; }
.gear-meta { font-size: 12px; color: #63705d; }
.gear-status { font-size: 12px; padding: 2px 8px; border-radius: 4px; width: fit-content; }
.gear-status.available { background: #dcfce7; color: #166534; }
.gear-status.unavailable { background: #fee2e2; color: #991b1b; }

.trip-layout { display: grid; grid-template-columns: 280px 1fr; gap: 16px; align-items: start; }
.trip-list { display: flex; flex-direction: column; gap: 10px; }
.trip-card { background: #fff; border: 1px solid #dfe3d5; border-radius: 8px; padding: 14px; cursor: pointer; transition: all 0.2s; }
.trip-card:hover { border-color: #2f4a2c; }
.trip-card.active { border-color: #2f4a2c; background: #f6f8f2; }
.trip-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.trip-header strong { font-size: 15px; }
.trip-date { font-size: 12px; color: #63705d; white-space: nowrap; }
.trip-meta { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.trip-meta span { font-size: 12px; margin: 0; }
.trip-actions { display: flex; gap: 6px; }

.trip-detail { display: flex; flex-direction: column; gap: 16px; }
.trip-detail-header { background: #f6f8f2; border-radius: 8px; padding: 16px; }
.trip-detail-header h3 { margin: 0 0 8px; font-size: 20px; }
.trip-detail-header span { display: block; margin-top: 4px; }
.trip-notes { margin: 8px 0 0; padding: 10px; background: #fff; border-radius: 6px; border-left: 3px solid #2f4a2c; }

.trip-gear-sections { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.gear-section { display: flex; flex-direction: column; gap: 10px; }
.section-header h4 { margin: 0; font-size: 16px; color: #2f4a2c; }
.gear-list { display: flex; flex-direction: column; gap: 8px; }
.gear-list-item { background: #fff; border: 1px solid #dfe3d5; border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.gear-list-item.confirmed { border-left: 4px solid #16a34a; background: #f0fdf4; }
.gear-list-info { flex: 1; }
.gear-list-info strong { display: block; margin-bottom: 4px; }
.gear-list-info span { display: block; margin-top: 4px; font-size: 13px; }
.availability-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-top: 6px; }
.availability-badge.available { background: #dcfce7; color: #166534; }
.availability-badge.unavailable { background: #fee2e2; color: #991b1b; }
.gear-list-actions { display: flex; gap: 6px; flex-shrink: 0; }

.conflict-warning { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 12px; margin-top: 8px; }
.conflict-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; color: #991b1b; margin-bottom: 10px; }
.conflict-list { display: flex; flex-direction: column; gap: 8px; max-height: 200px; overflow-y: auto; }
.conflict-item { background: #fff; border: 1px solid #fecaca; border-radius: 6px; padding: 10px; }
.conflict-meta { font-size: 13px; color: #6b7280; margin-top: 3px; }
.conflict-status { display: inline-block; margin-top: 5px; font-size: 12px; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
.conflict-status.待处理 { background: #fef3c7; color: #92400e; }
.conflict-status.已同意 { background: #dcfce7; color: #166534; }
.conflict-status.借出中 { background: #dbeafe; color: #1e40af; }
.conflict-reason { font-size: 13px; color: #4b5563; margin-top: 5px; }

.calendar-panel { padding: 22px; }
.calendar-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
.calendar-title-group { display: flex; align-items: center; gap: 16px; }
.week-nav { display: flex; gap: 6px; }
.calendar-filters { display: flex; gap: 14px; align-items: end; flex-wrap: wrap; }
.calendar-filters label { display: grid; gap: 6px; min-width: 160px; font-size: 13px; color: #63705d; }
.calendar-filters select { margin: 0; }

.calendar-grid { border: 1px solid #e5e7db; border-radius: 8px; overflow: hidden; }
.calendar-header-row, .calendar-data-row { display: grid; grid-template-columns: 180px repeat(7, 1fr); }
.calendar-header-row { background: #2f4a2c; color: #fff; }
.calendar-corner { padding: 14px 12px; font-weight: 600; border-right: 1px solid #3f5a3c; background: #263e23; }
.calendar-date-header { padding: 10px 8px; text-align: center; border-right: 1px solid #3f5a3c; }
.calendar-date-header:last-child { border-right: 0; }
.calendar-date-header.today { background: #4a6b47; }
.date-label { font-size: 15px; font-weight: 600; }
.weekday-label { font-size: 12px; opacity: 0.85; margin-top: 2px; }

.calendar-data-row { border-top: 1px solid #e5e7db; min-height: 90px; }
.calendar-data-row:nth-child(even) .calendar-cell,
.calendar-data-row:nth-child(even) .calendar-row-label { background: #fafbf7; }
.calendar-row-label { padding: 12px 10px; border-right: 1px solid #e5e7db; display: flex; align-items: flex-start; }
.calendar-cell { padding: 6px; border-right: 1px solid #e5e7db; min-height: 90px; position: relative; }
.calendar-cell:last-child { border-right: 0; }
.calendar-cell.today { background: #fffbeb !important; }
.cell-requests { display: flex; flex-direction: column; gap: 4px; }
.cal-request { border-radius: 5px; padding: 5px 7px; font-size: 12px; cursor: pointer; border-left: 3px solid; }
.cal-request.待处理 { background: #fffbeb; border-left-color: #f59e0b; color: #92400e; }
.cal-request.已同意 { background: #f0fdf4; border-left-color: #22c55e; color: #166534; }
.cal-request.借出中 { background: #eff6ff; border-left-color: #3b82f6; color: #1e40af; }
.cal-req-name { font-weight: 600; line-height: 1.3; }
.cal-req-status { font-size: 11px; opacity: 0.8; margin-top: 1px; }

.calendar-legend { display: flex; gap: 20px; margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7db; flex-wrap: wrap; }
.legend-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #63705d; }
.legend-dot { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
.legend-dot.待处理 { background: #fffbeb; border: 2px solid #f59e0b; }
.legend-dot.已同意 { background: #f0fdf4; border: 2px solid #22c55e; }
.legend-dot.借出中 { background: #eff6ff; border: 2px solid #3b82f6; }

.filter-group { display: flex; gap: 8px; }
.filter-group select { max-width: 150px; }

.handover-list { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
.handover-card { background: #fff; border: 1px solid #dfe3d5; border-radius: 8px; padding: 16px; cursor: pointer; transition: all 0.2s; }
.handover-card:hover { border-color: #2f4a2c; box-shadow: 0 4px 12px rgba(47, 74, 44, 0.1); }
.handover-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.handover-header strong { font-size: 16px; }
.handover-type-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.handover-type-badge.借出 { background: #dbeafe; color: #1e40af; }
.handover-type-badge.归还 { background: #dcfce7; color: #166534; }
.handover-meta { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.handover-meta span { font-size: 13px; color: #63705d; margin: 0; }
.handover-status-row { display: flex; justify-content: space-between; align-items: center; }
.status-badge { padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; }
.status-badge.待确认 { background: #fef3c7; color: #92400e; }
.status-badge.部分确认 { background: #dbeafe; color: #1e40af; }
.status-badge.已完成 { background: #dcfce7; color: #166534; }
.confirm-states { display: flex; gap: 12px; }
.confirm-state { font-size: 12px; color: #9ca3af; }
.confirm-state.confirmed { color: #166534; font-weight: 600; }
.damage-note { margin-top: 10px; padding: 8px 12px; background: #fef2f2; border-radius: 6px; font-size: 13px; color: #991b1b; }

.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
.modal-content { background: #fff; border-radius: 12px; width: 100%; max-width: 560px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 22px; border-bottom: 1px solid #e5e7db; }
.modal-header h3 { margin: 0; font-size: 18px; }
.modal-body { flex: 1; overflow-y: auto; padding: 20px 22px; display: flex; flex-direction: column; gap: 16px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 22px; border-top: 1px solid #e5e7db; }

.handover-info { background: #f6f8f2; border-radius: 8px; padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
.info-row { display: flex; justify-content: space-between; gap: 12px; }
.info-label { color: #63705d; font-size: 13px; }
.info-value { font-weight: 500; color: #22251f; }

.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 13px; color: #63705d; font-weight: 500; }

.confirm-section { background: #f9faf7; border: 1px dashed #cfd8ca; border-radius: 8px; padding: 16px; }
.confirm-section h4 { margin: 0 0 12px; font-size: 15px; color: #2f4a2c; }
.confirm-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.confirm-btn { padding: 12px; border-radius: 8px; border: 2px solid #cfd8ca; background: #fff; color: #63705d; font-weight: 500; cursor: pointer; transition: all 0.2s; }
.confirm-btn:hover { border-color: #2f4a2c; color: #2f4a2c; }
.confirm-btn.confirmed { background: #dcfce7; border-color: #22c55e; color: #166534; }
.confirm-success { margin: 12px 0 0; text-align: center; color: #166534; font-weight: 600; font-size: 14px; }

.deposit-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
.deposit-summary-item { background: #f6f8f2; border-radius: 8px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
.deposit-summary-label { font-size: 13px; color: #63705d; }
.deposit-summary-value { font-size: 22px; font-weight: 700; color: #22251f; }
.deposit-summary-value.pending { color: #92400e; }
.deposit-summary-value.received { color: #166534; }
.deposit-summary-value.deducted { color: #991b1b; }

.deposit-list { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
.deposit-card { background: #fff; border: 1px solid #dfe3d5; border-radius: 8px; padding: 16px; cursor: pointer; transition: all 0.2s; }
.deposit-card:hover { border-color: #2f4a2c; box-shadow: 0 4px 12px rgba(47, 74, 44, 0.1); }
.deposit-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.deposit-header strong { font-size: 16px; }
.deposit-status-badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.deposit-status-badge.待收取 { background: #fef3c7; color: #92400e; }
.deposit-status-badge.已收取 { background: #dbeafe; color: #1e40af; }
.deposit-status-badge.部分扣除 { background: #fef3c7; color: #92400e; }
.deposit-status-badge.已扣除 { background: #fee2e2; color: #991b1b; }
.deposit-status-badge.已退还 { background: #dcfce7; color: #166534; }
.deposit-status-badge.异常 { background: #fee2e2; color: #991b1b; }
.deposit-meta { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.deposit-meta span { font-size: 13px; color: #63705d; margin: 0; }
.deposit-amounts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; background: #f6f8f2; border-radius: 6px; padding: 10px; margin-bottom: 10px; }
.amount-item { display: flex; flex-direction: column; gap: 4px; text-align: center; }
.amount-label { font-size: 11px; color: #63705d; }
.amount-value { font-size: 15px; font-weight: 600; color: #22251f; }
.amount-value.received { color: #1e40af; }
.amount-value.deducted { color: #991b1b; }
.amount-value.refunded { color: #166534; }
.deduct-reason { margin: 0; padding: 8px 12px; background: #fef2f2; border-radius: 6px; font-size: 13px; color: #991b1b; }
.deposit-notes { margin: 6px 0 0; font-size: 13px; color: #63705d; }
.deposit-actions { display: flex; justify-content: flex-end; margin-top: 10px; }

@media (max-width: 900px) { main { padding: 16px; } .hero, .toolbar { flex-direction: column; align-items: stretch; gap: 10px; } .metrics, .layout, .split, .trip-layout, .trip-gear-sections { grid-template-columns: 1fr; } .member-card { flex-direction: column; }
  .deposit-summary { grid-template-columns: repeat(2, 1fr); }
  .deposit-list { grid-template-columns: 1fr; }
  .deposit-amounts { grid-template-columns: repeat(2, 1fr); }
  .calendar-toolbar { flex-direction: column; align-items: stretch; }
  .calendar-title-group { justify-content: space-between; }
  .calendar-header-row, .calendar-data-row { grid-template-columns: 120px repeat(7, 1fr); overflow-x: auto; min-width: 700px; }
  .calendar-grid { overflow-x: auto; }
  .handover-list { grid-template-columns: 1fr; }
  .filter-group { flex-direction: row; flex-wrap: wrap; }
  .filter-group select { max-width: none; flex: 1; min-width: 120px; }
  .modal-overlay { padding: 0; }
  .modal-content { max-height: 100vh; border-radius: 0; }
  .confirm-buttons { grid-template-columns: 1fr; }
}
</style>
