const iso = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

export function findGearByIdOrName(gearList, gearId, gearName, owner) {
  return gearList.find((gear) => gear.id === gearId)
    || gearList.find((gear) => gear.name === gearName && gear.owner === owner);
}

export function normalizeMembers(rawMembers) {
  const warnings = [];
  if (!Array.isArray(rawMembers)) {
    warnings.push('成员数据不是数组，已重置为空');
    return { data: [], warnings };
  }
  const data = rawMembers.filter((m, index) => {
    if (!m || typeof m !== 'object') {
      warnings.push(`成员第 ${index + 1} 条数据格式异常，已跳过`);
      return false;
    }
    if (!m.nickname) {
      warnings.push(`成员第 ${index + 1} 条缺少昵称，已跳过`);
      return false;
    }
    return true;
  }).map((m) => ({
    id: m.id || crypto.randomUUID(),
    nickname: m.nickname,
    phone: m.phone || '',
    area: m.area || '',
    notes: m.notes || ''
  }));
  return { data, warnings };
}

export function normalizeGears(rawGears) {
  const warnings = [];
  if (!Array.isArray(rawGears)) {
    warnings.push('装备数据不是数组，已重置为空');
    return { data: [], warnings };
  }
  const data = rawGears.filter((g, index) => {
    if (!g || typeof g !== 'object') {
      warnings.push(`装备第 ${index + 1} 条数据格式异常，已跳过`);
      return false;
    }
    if (!g.name) {
      warnings.push(`装备第 ${index + 1} 条缺少名称，已跳过`);
      return false;
    }
    return true;
  }).map((g) => ({
    id: g.id || crypto.randomUUID(),
    name: g.name,
    category: g.category || '其他',
    owner: g.owner || '未知',
    available: g.available || iso(0),
    deposit: g.deposit !== undefined ? String(g.deposit) : '0',
    status: g.status || '可借',
    notes: g.notes || '',
    damage: g.damage || ''
  }));
  return { data, warnings };
}

export function normalizeRequests(rawRequests, gearList) {
  const warnings = [];
  if (!Array.isArray(rawRequests)) {
    warnings.push('申请数据不是数组，已重置为空');
    return { data: [], warnings };
  }
  const data = rawRequests.map((req, index) => {
    if (!req || typeof req !== 'object') {
      warnings.push(`申请第 ${index + 1} 条数据格式异常，已跳过`);
      return null;
    }
    const gear = findGearByIdOrName(gearList, req.gearId, req.gearName, req.owner);
    if (!gear && !req.gearName) {
      warnings.push(`申请第 ${index + 1} 条无法匹配装备且无装备名，已标记为未知装备`);
    }
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
  return { data, warnings };
}

export function normalizeMaintenanceRecords(rawRecords, gearList) {
  const warnings = [];
  if (!Array.isArray(rawRecords)) {
    warnings.push('保养记录数据不是数组，已重置为空');
    return { data: [], warnings };
  }
  const data = rawRecords.map((record, index) => {
    if (!record || typeof record !== 'object') {
      warnings.push(`保养记录第 ${index + 1} 条数据格式异常，已跳过`);
      return null;
    }
    const gear = findGearByIdOrName(gearList, record.gearId, record.gearName, record.owner);
    if (!gear && !record.gearName) {
      warnings.push(`保养记录第 ${index + 1} 条无法匹配装备，已跳过`);
      return null;
    }
    return {
      id: record.id || crypto.randomUUID(),
      gearId: gear ? gear.id : (record.gearId || ''),
      gearName: gear ? gear.name : (record.gearName || '未知装备'),
      owner: gear ? gear.owner : (record.owner || ''),
      date: record.date || iso(0),
      type: record.type || '检查',
      description: record.description || '',
      handler: record.handler || ''
    };
  }).filter(Boolean);
  return { data, warnings };
}

export function normalizeTrips(rawTrips, gearList, memberList) {
  const warnings = [];
  if (!Array.isArray(rawTrips)) {
    warnings.push('出行数据不是数组，已重置为空');
    return { data: [], warnings };
  }
  const memberNames = memberList.map((m) => m.nickname);
  const data = rawTrips.map((trip, index) => {
    if (!trip || typeof trip !== 'object') {
      warnings.push(`出行第 ${index + 1} 条数据格式异常，已跳过`);
      return null;
    }
    const validMembers = Array.isArray(trip.members)
      ? trip.members.filter((m) => {
          if (typeof m !== 'string') return false;
          if (!memberNames.includes(m)) {
            warnings.push(`出行「${trip.destination || '未命名'}」中成员「${m}」不存在于成员列表，已跳过`);
            return false;
          }
          return true;
        })
      : [];
    const validGears = Array.isArray(trip.gears)
      ? trip.gears.map((g) => {
          if (!g || typeof g !== 'object') return null;
          const gear = gearList.find((gear) => gear.id === g.gearId);
          if (gear) {
            return {
              gearId: gear.id,
              gearName: gear.name,
              owner: gear.owner,
              deposit: gear.deposit,
              status: g.status || '待借'
            };
          }
          if (g.gearName) {
            warnings.push(`出行「${trip.destination || '未命名'}」中装备「${g.gearName}」未匹配到现有装备，保留导入数据`);
            return g;
          }
          return null;
        }).filter(Boolean)
      : [];
    return {
      id: trip.id || crypto.randomUUID(),
      destination: trip.destination || '未命名出行',
      startDate: trip.startDate || iso(7),
      members: validMembers,
      gears: validGears,
      notes: trip.notes || ''
    };
  }).filter(Boolean);
  return { data, warnings };
}

export function normalizeHandoverRecords(rawRecords, gearList, requestList) {
  const warnings = [];
  if (!Array.isArray(rawRecords)) {
    warnings.push('交接记录数据不是数组，已重置为空');
    return { data: [], warnings };
  }
  const data = rawRecords.map((record, index) => {
    if (!record || typeof record !== 'object') {
      warnings.push(`交接记录第 ${index + 1} 条数据格式异常，已跳过`);
      return null;
    }
    const gear = findGearByIdOrName(gearList, record.gearId, record.gearName, record.owner);
    const req = requestList.find((r) => r.id === record.requestId);
    return {
      id: record.id || crypto.randomUUID(),
      type: record.type || '借出',
      requestId: record.requestId || (req ? req.id : ''),
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
  return { data, warnings };
}

export function normalizeDepositRecords(rawRecords, gearList, requestList) {
  const warnings = [];
  if (!Array.isArray(rawRecords)) {
    warnings.push('押金记录数据不是数组，已重置为空');
    return { data: [], warnings };
  }
  const data = rawRecords.map((record, index) => {
    if (!record || typeof record !== 'object') {
      warnings.push(`押金记录第 ${index + 1} 条数据格式异常，已跳过`);
      return null;
    }
    const gear = findGearByIdOrName(gearList, record.gearId, record.gearName, record.owner);
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
  return { data, warnings };
}

const INVENTORY_TYPES = ['出行前', '出行后'];
const INVENTORY_STATUSES = ['进行中', '已完成'];
const ITEM_CHECK_STATUSES = ['待盘点', '已盘点', '缺失'];

export function normalizeInventoryItems(rawItems, gearList, memberList = []) {
  const warnings = [];
  if (!Array.isArray(rawItems)) {
    warnings.push('盘点项数据不是数组，已重置为空');
    return { data: [], warnings };
  }
  const memberNames = memberList.map((m) => m.nickname);
  const data = rawItems.map((item, index) => {
    if (!item || typeof item !== 'object') {
      warnings.push(`盘点项第 ${index + 1} 条数据格式异常，已跳过`);
      return null;
    }
    const gear = findGearByIdOrName(gearList, item.gearId, item.gearName, item.owner);
    if (!gear && !item.gearName) {
      warnings.push(`盘点项第 ${index + 1} 条无法匹配装备且无装备名，已标记为未知装备`);
    }
    const checkStatus = ITEM_CHECK_STATUSES.includes(item.checkStatus)
      ? item.checkStatus
      : '待盘点';
    const checker = memberNames.includes(item.checker) ? item.checker : (item.checker || '');
    return {
      id: item.id || crypto.randomUUID(),
      gearId: gear ? gear.id : (item.gearId || ''),
      gearName: gear ? gear.name : (item.gearName || '未知装备'),
      owner: gear ? gear.owner : (item.owner || ''),
      checkStatus,
      missingAccessories: item.missingAccessories || '',
      notes: item.notes || '',
      checker
    };
  }).filter(Boolean);
  return { data, warnings };
}

export function normalizeInventoryLists(rawLists, gearList, tripList, memberList) {
  const warnings = [];
  if (!Array.isArray(rawLists)) {
    warnings.push('盘点单数据不是数组，已重置为空');
    return { data: [], warnings };
  }
  const memberNames = memberList.map((m) => m.nickname);
  const data = rawLists.map((list, index) => {
    if (!list || typeof list !== 'object') {
      warnings.push(`盘点单第 ${index + 1} 条数据格式异常，已跳过`);
      return null;
    }
    const trip = tripList.find((t) => t.id === list.tripId);
    const type = INVENTORY_TYPES.includes(list.type) ? list.type : '出行前';
    const status = INVENTORY_STATUSES.includes(list.status) ? list.status : '进行中';
    const checker = memberNames.includes(list.checker) ? list.checker : (list.checker || '');
    const itemsResult = normalizeInventoryItems(list.items || [], gearList, memberList);
    warnings.push(...itemsResult.warnings.map((w) => `盘点单「${list.name || '未命名'}」：${w}`));
    return {
      id: list.id || crypto.randomUUID(),
      name: list.name || '未命名盘点',
      type,
      tripId: trip ? trip.id : (list.tripId || ''),
      tripName: trip ? trip.destination : (list.tripName || ''),
      date: list.date || iso(0),
      status,
      checker,
      notes: list.notes || '',
      items: itemsResult.data,
      createdAt: list.createdAt || new Date().toISOString(),
      updatedAt: list.updatedAt || new Date().toISOString()
    };
  }).filter(Boolean);
  return { data, warnings };
}

export function normalizeSettlementRecords(rawRecords, gearList, memberList, depositRecords) {
  const warnings = [];
  if (!Array.isArray(rawRecords)) {
    warnings.push('结算单数据不是数组，已重置为空');
    return { data: [], warnings };
  }
  const memberNames = new Set(memberList.map((m) => m.nickname));
  const depositIds = new Set(depositRecords.map((d) => d.id));
  const data = rawRecords.map((record, index) => {
    if (!record || typeof record !== 'object') {
      warnings.push(`结算单第 ${index + 1} 条数据格式异常，已跳过`);
      return null;
    }
    const members = Array.isArray(record.members)
      ? record.members.map((sm) => {
          if (!sm || typeof sm !== 'object') return null;
          const nickname = sm.nickname || '';
          if (nickname && !memberNames.has(nickname)) {
            warnings.push(`结算单「${record.name || '未命名'}」中成员「${nickname}」不存在于成员列表，保留数据`);
          }
          const depositItems = Array.isArray(sm.depositItems)
            ? sm.depositItems.map((d) => {
                if (!d || typeof d !== 'object') return null;
                if (d.depositId && !depositIds.has(d.depositId)) {
                  warnings.push(`结算单「${record.name || '未命名'}」成员「${nickname}」的押金记录「${d.gearName || ''}」未匹配到押金台账，保留数据`);
                }
                return {
                  depositId: d.depositId || '',
                  gearName: d.gearName || '未知装备',
                  depositAmount: d.depositAmount !== undefined ? String(d.depositAmount) : '0',
                  deductedAmount: d.deductedAmount !== undefined ? String(d.deductedAmount) : '0',
                  actualDeduct: d.actualDeduct !== undefined ? String(d.actualDeduct) : '0'
                };
              }).filter(Boolean)
            : [];
          return {
            memberId: sm.memberId || '',
            nickname,
            depositItems,
            extraShare: sm.extraShare !== undefined ? String(sm.extraShare) : '0',
            totalOwed: sm.totalOwed !== undefined ? String(sm.totalOwed) : '0',
            paidAmount: sm.paidAmount !== undefined ? String(sm.paidAmount) : '0',
            paymentStatus: ['未支付', '部分支付', '已支付'].includes(sm.paymentStatus) ? sm.paymentStatus : '未支付',
            notes: sm.notes || ''
          };
        }).filter(Boolean)
      : [];
    const extraExpenses = Array.isArray(record.extraExpenses)
      ? record.extraExpenses.map((e) => {
          if (!e || typeof e !== 'object') return null;
          return {
            id: e.id || crypto.randomUUID(),
            name: e.name || '',
            amount: e.amount !== undefined ? String(e.amount) : '0',
            paidBy: e.paidBy || ''
          };
        }).filter(Boolean)
      : [];
    return {
      id: record.id || crypto.randomUUID(),
      tripId: record.tripId || '',
      tripName: record.tripName || '',
      name: record.name || '未命名结算单',
      status: ['草稿', '已确认', '已结算'].includes(record.status) ? record.status : '草稿',
      members,
      extraExpenses,
      totalDeposit: record.totalDeposit !== undefined ? String(record.totalDeposit) : '0',
      totalDeducted: record.totalDeducted !== undefined ? String(record.totalDeducted) : '0',
      totalExtraExpenses: record.totalExtraExpenses !== undefined ? String(record.totalExtraExpenses) : '0',
      totalPerMember: record.totalPerMember !== undefined ? String(record.totalPerMember) : '0',
      notes: record.notes || '',
      createdAt: record.createdAt || new Date().toISOString().slice(0, 10),
      updatedAt: record.updatedAt || new Date().toISOString().slice(0, 10)
    };
  }).filter(Boolean);
  return { data, warnings };
}

export function validateAndNormalizeImportData(rawData) {
  const allWarnings = [];
  const errors = [];

  if (!rawData || typeof rawData !== 'object') {
    errors.push('导入文件格式错误：根数据不是对象');
    return { valid: false, errors, warnings: allWarnings, data: null, summary: {} };
  }

  const isLegacyFormat = !rawData._exportVersion && (
    rawData.members !== undefined || rawData.gears !== undefined || rawData.requests !== undefined ||
    rawData.maintenance !== undefined || rawData.trips !== undefined || rawData.handovers !== undefined || rawData.deposits !== undefined
  );

  const entityPresence = {
    members: rawData.members !== undefined,
    gears: rawData.gears !== undefined,
    requests: rawData.requests !== undefined,
    maintenanceRecords: rawData.maintenanceRecords !== undefined || rawData.maintenance !== undefined,
    trips: rawData.trips !== undefined,
    handoverRecords: rawData.handoverRecords !== undefined || rawData.handovers !== undefined,
    depositRecords: rawData.depositRecords !== undefined || rawData.deposits !== undefined,
    inventoryLists: rawData.inventoryLists !== undefined,
    settlementRecords: rawData.settlementRecords !== undefined,
    reservations: rawData.reservations !== undefined
  };

  const source = {
    members: rawData.members || [],
    gears: rawData.gears || [],
    requests: rawData.requests || [],
    maintenanceRecords: rawData.maintenanceRecords || rawData.maintenance || [],
    trips: rawData.trips || [],
    handoverRecords: rawData.handoverRecords || rawData.handovers || [],
    depositRecords: rawData.depositRecords || rawData.deposits || [],
    inventoryLists: rawData.inventoryLists || [],
    settlementRecords: rawData.settlementRecords || [],
    reservations: rawData.reservations || []
  };

  if (isLegacyFormat) {
    allWarnings.push('检测到旧版数据格式，已自动兼容');
  }

  const normalizedData = {};
  const summary = {
    totalWarnings: 0,
    hasLegacyFormat: isLegacyFormat
  };

  const membersResult = normalizeMembers(source.members);
  allWarnings.push(...membersResult.warnings);
  if (entityPresence.members) {
    normalizedData.members = membersResult.data;
    summary.members = membersResult.data.length;
  }

  const gearsResult = normalizeGears(source.gears);
  allWarnings.push(...gearsResult.warnings);
  if (entityPresence.gears) {
    normalizedData.gears = gearsResult.data;
    summary.gears = gearsResult.data.length;
  }

  const requestsResult = normalizeRequests(source.requests, gearsResult.data);
  allWarnings.push(...requestsResult.warnings);
  if (entityPresence.requests) {
    normalizedData.requests = requestsResult.data;
    summary.requests = requestsResult.data.length;
  }

  const maintenanceResult = normalizeMaintenanceRecords(source.maintenanceRecords, gearsResult.data);
  allWarnings.push(...maintenanceResult.warnings);
  if (entityPresence.maintenanceRecords) {
    normalizedData.maintenanceRecords = maintenanceResult.data;
    summary.maintenanceRecords = maintenanceResult.data.length;
  }

  const tripsResult = normalizeTrips(source.trips, gearsResult.data, membersResult.data);
  allWarnings.push(...tripsResult.warnings);
  if (entityPresence.trips) {
    normalizedData.trips = tripsResult.data;
    summary.trips = tripsResult.data.length;
  }

  const handoverResult = normalizeHandoverRecords(source.handoverRecords, gearsResult.data, requestsResult.data);
  allWarnings.push(...handoverResult.warnings);
  if (entityPresence.handoverRecords) {
    normalizedData.handoverRecords = handoverResult.data;
    summary.handoverRecords = handoverResult.data.length;
  }

  const depositResult = normalizeDepositRecords(source.depositRecords, gearsResult.data, requestsResult.data);
  allWarnings.push(...depositResult.warnings);
  if (entityPresence.depositRecords) {
    normalizedData.depositRecords = depositResult.data;
    summary.depositRecords = depositResult.data.length;
  }

  const inventoryResult = normalizeInventoryLists(
    source.inventoryLists,
    gearsResult.data,
    tripsResult.data,
    membersResult.data
  );
  allWarnings.push(...inventoryResult.warnings);
  if (entityPresence.inventoryLists) {
    normalizedData.inventoryLists = inventoryResult.data;
    summary.inventoryLists = inventoryResult.data.length;
  }

  const settlementResult = normalizeSettlementRecords(
    source.settlementRecords,
    gearsResult.data,
    membersResult.data,
    depositResult.data
  );
  allWarnings.push(...settlementResult.warnings);
  if (entityPresence.settlementRecords) {
    normalizedData.settlementRecords = settlementResult.data;
    summary.settlementRecords = settlementResult.data.length;
  }

  const reservationResult = normalizeReservations(
    source.reservations,
    gearsResult.data,
    membersResult.data
  );
  allWarnings.push(...reservationResult.warnings);
  if (entityPresence.reservations) {
    normalizedData.reservations = reservationResult.data;
    summary.reservations = reservationResult.data.length;
  }

  summary.totalWarnings = allWarnings.length;

  return {
    valid: errors.length === 0,
    errors,
    warnings: allWarnings,
    data: normalizedData,
    summary
  };
}

export { normalizeReservations } from './reservationTransform.js';

export const ENTITY_LABELS = {
  members: '成员',
  gears: '装备',
  requests: '申请',
  maintenanceRecords: '保养记录',
  trips: '出行',
  handoverRecords: '交接',
  depositRecords: '押金',
  inventoryLists: '盘点单',
  settlementRecords: '费用结算',
  reservations: '候补预约'
};

export const DATA_ENTITIES = Object.keys(ENTITY_LABELS);
