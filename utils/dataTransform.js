const iso = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

import { normalizeReservations as _normalizeReservations } from './reservationTransform.js';
const normalizeReservations = _normalizeReservations;

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

export function getDefaultMaintenancePlan(gear) {
  const defaultCycle = 30;
  const defaultReminder = '标准';
  const cycle = Number(gear?.maintenanceCycleDays) || defaultCycle;
  const nextDate = gear?.nextMaintenanceDate || iso(cycle);
  const reminder = gear?.maintenanceReminderLevel || defaultReminder;
  return {
    maintenanceCycleDays: cycle,
    nextMaintenanceDate: nextDate,
    maintenanceReminderLevel: reminder
  };
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
  }).map((g) => {
    const plan = getDefaultMaintenancePlan(g);
    return {
      id: g.id || crypto.randomUUID(),
      name: g.name,
      category: g.category || '其他',
      owner: g.owner || '未知',
      available: g.available || iso(0),
      deposit: g.deposit !== undefined ? String(g.deposit) : '0',
      status: g.status || '可借',
      notes: g.notes || '',
      damage: g.damage || '',
      maintenanceCycleDays: plan.maintenanceCycleDays,
      nextMaintenanceDate: plan.nextMaintenanceDate,
      maintenanceReminderLevel: plan.maintenanceReminderLevel
    };
  });
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
      damage: req.damage || '',
      fromReservationId: req.fromReservationId || ''
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
    const abnormalActions = Array.isArray(item.abnormalActions)
      ? item.abnormalActions.map((a) => ({
          id: a.id || crypto.randomUUID(),
          type: a.type || '',
          description: a.description || '',
          amount: a.amount !== undefined ? String(a.amount) : '0',
          handler: a.handler || '',
          borrower: a.borrower || '',
          status: a.status || '待处理',
          relatedRecordId: a.relatedRecordId || '',
          createdAt: a.createdAt || new Date().toISOString(),
          updatedAt: a.updatedAt || new Date().toISOString()
        }))
      : [];
    const hasAbnormal = item.checkStatus === '缺失' || !!(item.notes && item.notes.trim()) || !!(item.missingAccessories && item.missingAccessories.trim()) || abnormalActions.some((a) => a.status !== '已取消');
    return {
      id: item.id || crypto.randomUUID(),
      gearId: gear ? gear.id : (item.gearId || ''),
      gearName: gear ? gear.name : (item.gearName || '未知装备'),
      owner: gear ? gear.owner : (item.owner || ''),
      checkStatus,
      missingAccessories: item.missingAccessories || '',
      notes: item.notes || '',
      checker,
      hasAbnormal: item.hasAbnormal !== undefined ? item.hasAbnormal : hasAbnormal,
      abnormalActions
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
                const source = d.source === 'inventory' ? 'inventory' : 'deposit';
                if (source !== 'inventory' && d.depositId && !depositIds.has(d.depositId)) {
                  warnings.push(`结算单「${record.name || '未命名'}」成员「${nickname}」的押金记录「${d.gearName || ''}」未匹配到押金台账，保留数据`);
                }
                return {
                  depositId: d.depositId || '',
                  gearName: d.gearName || '未知装备',
                  depositAmount: d.depositAmount !== undefined ? String(d.depositAmount) : '0',
                  deductedAmount: d.deductedAmount !== undefined ? String(d.deductedAmount) : '0',
                  actualDeduct: d.actualDeduct !== undefined ? String(d.actualDeduct) : '0',
                  source,
                  inventoryId: d.inventoryId || '',
                  inventoryName: d.inventoryName || '',
                  inventoryDate: d.inventoryDate || '',
                  description: d.description || '',
                  pending: !!d.pending
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
    reservations: rawData.reservations !== undefined,
    eventLogs: rawData.eventLogs !== undefined
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
    reservations: rawData.reservations || [],
    eventLogs: rawData.eventLogs || []
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

  if (entityPresence.eventLogs) {
    const eventLogResult = normalizeEventLogs(source.eventLogs);
    allWarnings.push(...eventLogResult.warnings);
    normalizedData.eventLogs = eventLogResult.data.map((e) => ({ ...e, isImported: true }));
    summary.eventLogs = eventLogResult.data.length;
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

export function normalizeEventLogs(rawLogs) {
  const warnings = [];
  if (!Array.isArray(rawLogs)) {
    warnings.push('事件日志数据不是数组，已重置为空');
    return { data: [], warnings };
  }
  const data = rawLogs.filter((log, index) => {
    if (!log || typeof log !== 'object') {
      warnings.push(`事件日志第 ${index + 1} 条数据格式异常，已跳过`);
      return false;
    }
    if (!log.entityType || !log.action) {
      warnings.push(`事件日志第 ${index + 1} 条缺少必要字段，已跳过`);
      return false;
    }
    return true;
  }).map((log) => ({
    id: log.id || crypto.randomUUID(),
    timestamp: log.timestamp || new Date().toISOString(),
    entityType: log.entityType,
    entityId: log.entityId || '',
    entityName: log.entityName || '',
    action: log.action,
    actor: log.actor || '',
    beforeState: log.beforeState || '',
    afterState: log.afterState || '',
    changes: Array.isArray(log.changes) ? log.changes : [],
    sourcePage: log.sourcePage || '',
    notes: log.notes || '',
    relatedEntityType: log.relatedEntityType || '',
    relatedEntityId: log.relatedEntityId || '',
    relatedEntityName: log.relatedEntityName || '',
    isImported: log.isImported || false
  }));
  return { data, warnings };
}

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
  reservations: '候补预约',
  eventLogs: '操作日志'
};

export const DATA_ENTITIES = Object.keys(ENTITY_LABELS);

export function matchMember(existingMembers, imported) {
  return existingMembers.find((m) => m.nickname === imported.nickname);
}

export function matchGear(existingGears, imported) {
  return existingGears.find((g) => g.name === imported.name && g.owner === imported.owner);
}

export function matchRequest(existingRequests, imported) {
  return existingRequests.find((r) =>
    r.gearName === imported.gearName &&
    r.owner === imported.owner &&
    r.borrower === imported.borrower &&
    r.start === imported.start &&
    r.end === imported.end
  );
}

export function matchMaintenanceRecord(existingRecords, imported) {
  return existingRecords.find((r) =>
    r.gearName === imported.gearName &&
    r.owner === imported.owner &&
    r.date === imported.date &&
    r.type === imported.type
  );
}

export function matchTrip(existingTrips, imported) {
  return existingTrips.find((t) =>
    t.destination === imported.destination &&
    t.startDate === imported.startDate
  );
}

export function matchHandoverRecord(existingRecords, imported) {
  if (imported.requestId) {
    const byRequest = existingRecords.find((r) => r.requestId === imported.requestId && r.type === imported.type);
    if (byRequest) return byRequest;
  }
  return existingRecords.find((r) =>
    r.gearName === imported.gearName &&
    r.owner === imported.owner &&
    r.borrower === imported.borrower &&
    r.type === imported.type &&
    r.createdAt === imported.createdAt
  );
}

export function matchDepositRecord(existingRecords, imported) {
  return existingRecords.find((r) =>
    r.gearName === imported.gearName &&
    r.owner === imported.owner &&
    r.borrower === imported.borrower
  );
}

export function matchInventoryList(existingLists, imported) {
  return existingLists.find((l) =>
    l.name === imported.name &&
    l.date === imported.date &&
    l.type === imported.type
  );
}

export function matchSettlementRecord(existingRecords, imported) {
  return existingRecords.find((r) =>
    r.name === imported.name &&
    r.createdAt === imported.createdAt
  );
}

export function matchReservation(existingReservations, imported) {
  return existingReservations.find((r) =>
    r.gearName === imported.gearName &&
    r.owner === imported.owner &&
    r.borrower === imported.borrower &&
    r.start === imported.start &&
    r.end === imported.end
  );
}

export function matchEventLog(existingLogs, imported) {
  if (imported.id) {
    return existingLogs.find((l) => l.id === imported.id);
  }
  return existingLogs.find((l) =>
    l.timestamp === imported.timestamp &&
    l.entityType === imported.entityType &&
    l.entityId === imported.entityId &&
    l.action === imported.action &&
    l.actor === imported.actor
  );
}

const MATCHERS = {
  members: matchMember,
  gears: matchGear,
  requests: matchRequest,
  maintenanceRecords: matchMaintenanceRecord,
  trips: matchTrip,
  handoverRecords: matchHandoverRecord,
  depositRecords: matchDepositRecord,
  inventoryLists: matchInventoryList,
  settlementRecords: matchSettlementRecord,
  reservations: matchReservation,
  eventLogs: matchEventLog
};

function updateItemWithImported(existing, imported, preserveId = true) {
  const result = { ...imported };
  if (preserveId && existing.id) {
    result.id = existing.id;
  }
  return result;
}

function reconnectRelationalFields(item, idMap) {
  if (!item || typeof item !== 'object') return item;

  const result = { ...item };

  if (typeof item.memberId === 'string' && item.memberId && idMap.members && idMap.members[item.memberId]) {
    result.memberId = idMap.members[item.memberId];
  }
  if (typeof item.gearId === 'string' && item.gearId && idMap.gears && idMap.gears[item.gearId]) {
    result.gearId = idMap.gears[item.gearId];
  }
  if (typeof item.requestId === 'string' && item.requestId && idMap.requests && idMap.requests[item.requestId]) {
    result.requestId = idMap.requests[item.requestId];
  }
  if (typeof item.tripId === 'string' && item.tripId && idMap.trips && idMap.trips[item.tripId]) {
    result.tripId = idMap.trips[item.tripId];
  }
  if (typeof item.fromReservationId === 'string' && item.fromReservationId && idMap.reservations && idMap.reservations[item.fromReservationId]) {
    result.fromReservationId = idMap.reservations[item.fromReservationId];
  }
  if (typeof item.generatedRequestId === 'string' && item.generatedRequestId && idMap.requests && idMap.requests[item.generatedRequestId]) {
    result.generatedRequestId = idMap.requests[item.generatedRequestId];
  }
  if (typeof item.requestId === 'string' && item.requestId && idMap.requests && idMap.requests[item.requestId]) {
    result.requestId = idMap.requests[item.requestId];
  }
  if (typeof item.inventoryId === 'string' && item.inventoryId && idMap.inventoryLists && idMap.inventoryLists[item.inventoryId]) {
    result.inventoryId = idMap.inventoryLists[item.inventoryId];
  }

  if (Array.isArray(item.members)) {
    result.members = item.members.map((m) => {
      if (typeof m === 'string') return m;
      if (!m || typeof m !== 'object') return m;
      const nm = { ...m };
      if (typeof m.memberId === 'string' && m.memberId && idMap.members && idMap.members[m.memberId]) {
        nm.memberId = idMap.members[m.memberId];
      }
      if (Array.isArray(m.depositItems)) {
        nm.depositItems = m.depositItems.map((d) => {
          if (!d || typeof d !== 'object') return d;
          const nd = { ...d };
          if (typeof d.depositId === 'string' && d.depositId && idMap.depositRecords && idMap.depositRecords[d.depositId]) {
            nd.depositId = idMap.depositRecords[d.depositId];
          }
          if (typeof d.inventoryId === 'string' && d.inventoryId && idMap.inventoryLists && idMap.inventoryLists[d.inventoryId]) {
            nd.inventoryId = idMap.inventoryLists[d.inventoryId];
          }
          return nd;
        });
      }
      return nm;
    });
  }

  if (Array.isArray(item.gears)) {
    result.gears = item.gears.map((g) => {
      if (!g || typeof g !== 'object') return g;
      const ng = { ...g };
      if (typeof g.gearId === 'string' && g.gearId && idMap.gears && idMap.gears[g.gearId]) {
        ng.gearId = idMap.gears[g.gearId];
      }
      return ng;
    });
  }

  if (Array.isArray(item.items)) {
    result.items = item.items.map((it) => reconnectRelationalFields(it, idMap));
  }

  if (Array.isArray(item.abnormalActions)) {
    result.abnormalActions = item.abnormalActions.map((a) => {
      if (!a || typeof a !== 'object') return a;
      const na = { ...a };
      if (typeof a.relatedRecordId === 'string' && a.relatedRecordId) {
        if (idMap.handoverRecords && idMap.handoverRecords[a.relatedRecordId]) {
          na.relatedRecordId = idMap.handoverRecords[a.relatedRecordId];
        } else if (idMap.depositRecords && idMap.depositRecords[a.relatedRecordId]) {
          na.relatedRecordId = idMap.depositRecords[a.relatedRecordId];
        }
      }
      return na;
    });
  }

  if (Array.isArray(item.extraExpenses)) {
    result.extraExpenses = item.extraExpenses.map((e) => (e && typeof e === 'object' ? { ...e } : e));
  }

  return result;
}

function deepCompareForEquivalence(a, b, ignoredKeys = ['id', 'createdAt', 'updatedAt']) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;

  const keysA = Object.keys(a).filter((k) => !ignoredKeys.includes(k));
  const keysB = Object.keys(b).filter((k) => !ignoredKeys.includes(k));
  if (keysA.length !== keysB.length) {
    const setA = new Set(keysA);
    const setB = new Set(keysB);
    for (const k of setA) if (!setB.has(k)) {
      const av = a[k];
      if (av !== undefined && av !== null && av !== '' && !(Array.isArray(av) && av.length === 0)) return false;
    }
    for (const k of setB) if (!setA.has(k)) {
      const bv = b[k];
      if (bv !== undefined && bv !== null && bv !== '' && !(Array.isArray(bv) && bv.length === 0)) return false;
    }
  }

  for (const k of keysA) {
    if (ignoredKeys.includes(k)) continue;
    const av = a[k];
    const bv = b[k];

    if (Array.isArray(av) && Array.isArray(bv)) {
      if (av.length !== bv.length) return false;
      for (let i = 0; i < av.length; i++) {
        if (!deepCompareForEquivalence(av[i], bv[i], ignoredKeys)) return false;
      }
    } else if (av && bv && typeof av === 'object' && typeof bv === 'object') {
      if (!deepCompareForEquivalence(av, bv, ignoredKeys)) return false;
    } else {
      if (av !== bv) {
        if ((av === undefined || av === '' || av === null) &&
            (bv === undefined || bv === '' || bv === null)) continue;
        return false;
      }
    }
  }
  return true;
}

const MERGE_PROCESS_ORDER = [
  'members',
  'gears',
  'maintenanceRecords',
  'trips',
  'requests',
  'reservations',
  'handoverRecords',
  'depositRecords',
  'inventoryLists',
  'settlementRecords',
  'eventLogs'
];

export function analyzeMergeData(currentData, importedData) {
  const safeCurrent = currentData && typeof currentData === 'object' ? currentData : {};
  const safeImported = importedData && typeof importedData === 'object' ? importedData : {};

  const analysis = {};
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
    reservations: Object.create(null),
    eventLogs: Object.create(null)
  };

  MERGE_PROCESS_ORDER.forEach((entityKey) => {
    if (safeImported[entityKey] === undefined) {
      return;
    }

    const existing = Array.isArray(safeCurrent[entityKey]) ? safeCurrent[entityKey] : [];
    const importedList = Array.isArray(safeImported[entityKey]) ? safeImported[entityKey] : [];
    const matcher = MATCHERS[entityKey];

    const stats = {
      entity: entityKey,
      label: ENTITY_LABELS[entityKey],
      total: importedList.length,
      added: 0,
      updated: 0,
      skipped: 0,
      unmatched: 0,
      addedItems: [],
      updatedItems: [],
      skippedItems: [],
      unmatchedItems: []
    };

    for (let i = 0; i < importedList.length; i++) {
      const item = importedList[i];
      if (!item || typeof item !== 'object') {
        stats.unmatched++;
        stats.unmatchedItems.push(item);
        continue;
      }

      const importId = item.id;
      const itemForMatch = reconnectRelationalFields(item, idMap);
      const matched = typeof matcher === 'function' ? matcher(existing, itemForMatch) : null;

      if (matched && matched.id) {
        const isIdentical = deepCompareForEquivalence(itemForMatch, matched);

        if (importId && typeof importId === 'string') {
          idMap[entityKey][importId] = matched.id;
        }

        if (isIdentical) {
          stats.skipped++;
          stats.skippedItems.push(item);
        } else {
          stats.updated++;
          stats.updatedItems.push({ old: { ...matched }, new: itemForMatch });
        }
      } else {
        let isUnmatched = false;

        if (entityKey === 'requests' || entityKey === 'handoverRecords' ||
            entityKey === 'depositRecords' || entityKey === 'reservations') {
          const gearOk = item.gearName && String(item.gearName).trim() && item.owner !== undefined && String(item.owner).trim();
          const borrowerOk = item.borrower !== undefined && String(item.borrower).trim();
          if (!gearOk || !borrowerOk) {
            isUnmatched = true;
          }
        }

        if (entityKey === 'settlementRecords') {
          if (!item.name || !String(item.name).trim()) {
            isUnmatched = true;
          }
        }

        if (entityKey === 'inventoryLists') {
          if (!item.name || !String(item.name).trim()) {
            isUnmatched = true;
          }
        }

        if (isUnmatched) {
          stats.unmatched++;
          stats.unmatchedItems.push(item);
          continue;
        }

        stats.added++;
        stats.addedItems.push(item);

        if (importId && typeof importId === 'string') {
          idMap[entityKey][importId] = importId;
        }
      }
    }

    analysis[entityKey] = stats;
  });

  const summary = {
    totalAdded: 0,
    totalUpdated: 0,
    totalSkipped: 0,
    totalUnmatched: 0
  };

  for (const k of Object.keys(analysis)) {
    const s = analysis[k];
    summary.totalAdded += s.added || 0;
    summary.totalUpdated += s.updated || 0;
    summary.totalSkipped += s.skipped || 0;
    summary.totalUnmatched += s.unmatched || 0;
  }

  return { analysis, summary, idMap };
}

export function performMerge(currentData, importedData, mergeAnalysis) {
  if (!currentData || typeof currentData !== 'object') {
    currentData = {};
  }
  if (!importedData || typeof importedData !== 'object') {
    return { ...currentData };
  }
  if (!mergeAnalysis || typeof mergeAnalysis !== 'object') {
    return { ...currentData };
  }

  const result = { ...currentData };
  const { idMap, analysis } = mergeAnalysis;

  if (!analysis || typeof analysis !== 'object') {
    return result;
  }
  if (!idMap || typeof idMap !== 'object') {
    return result;
  }

  for (let oi = 0; oi < MERGE_PROCESS_ORDER.length; oi++) {
    const entityKey = MERGE_PROCESS_ORDER[oi];

    if (importedData[entityKey] === undefined) {
      continue;
    }

    const entityAnalysis = analysis[entityKey];
    if (!entityAnalysis || typeof entityAnalysis !== 'object') {
      continue;
    }

    const existingArr = Array.isArray(currentData[entityKey]) ? currentData[entityKey] : [];
    const merged = [...existingArr];

    if (Array.isArray(entityAnalysis.addedItems) && entityAnalysis.addedItems.length > 0) {
      for (let ai = 0; ai < entityAnalysis.addedItems.length; ai++) {
        const rawItem = entityAnalysis.addedItems[ai];
        if (!rawItem || typeof rawItem !== 'object') continue;
        const reconnected = reconnectRelationalFields({ ...rawItem }, idMap);
        merged.push(reconnected);
      }
    }

    if (Array.isArray(entityAnalysis.updatedItems) && entityAnalysis.updatedItems.length > 0) {
      for (let ui = 0; ui < entityAnalysis.updatedItems.length; ui++) {
        const updatePair = entityAnalysis.updatedItems[ui];
        if (!updatePair || typeof updatePair !== 'object') continue;
        const oldItem = updatePair.old;
        const newItem = updatePair.new;
        if (!oldItem || !newItem || typeof oldItem !== 'object' || typeof newItem !== 'object') continue;
        if (!oldItem.id) continue;

        const idx = merged.findIndex((m) => m && m.id === oldItem.id);
        if (idx === -1) continue;

        const mergedWithCurrent = { ...merged[idx] };
        Object.keys(newItem).forEach((k) => {
          if (k === 'id') return;
          const nv = newItem[k];
          if (nv !== undefined) {
            mergedWithCurrent[k] = nv;
          }
        });
        mergedWithCurrent.id = oldItem.id;

        const reconnected = reconnectRelationalFields(mergedWithCurrent, idMap);
        merged[idx] = reconnected;
      }
    }

    result[entityKey] = merged;
  }

  return result;
}

export function validateAndNormalizeForMerge(rawData, currentData) {
  const normalizeResult = validateAndNormalizeImportData(rawData);

  if (!normalizeResult || !normalizeResult.valid) {
    return normalizeResult || {
      valid: false,
      errors: ['数据格式无效'],
      warnings: [],
      data: null,
      summary: { totalWarnings: 0, hasLegacyFormat: false }
    };
  }

  const safeCurrent = currentData && typeof currentData === 'object' ? currentData : {};
  const safeData = normalizeResult.data && typeof normalizeResult.data === 'object' ? normalizeResult.data : {};

  const mergeAnalysis = analyzeMergeData(safeCurrent, safeData);

  return {
    ...normalizeResult,
    mergeAnalysis
  };
}
