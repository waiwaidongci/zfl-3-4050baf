export const EVENT_ENTITY_TYPES = {
  member: '成员',
  gear: '装备',
  request: '申请',
  handover: '交接',
  deposit: '押金',
  settlement: '结算',
  inventory: '盘点',
  reservation: '候补',
  trip: '出行',
  maintenance: '保养',
  space: '空间'
};

export const EVENT_ACTIONS = {
  create: '创建',
  update: '更新',
  delete: '删除',
  rename: '改名',
  confirm: '确认',
  approve: '同意',
  reject: '拒绝',
  activate: '转正',
  cancel: '取消',
  complete: '完成',
  settle: '结算',
  deduct: '扣除',
  refund: '退还',
  borrow: '借出',
  return: '归还',
  import: '导入',
  export: '导出',
  reset: '重置'
};

export function createEvent({ entityType, entityId, entityName, action, actor, beforeState = null, afterState = null, changes = [], sourcePage = '', notes = '', relatedEntityType = '', relatedEntityId = '', relatedEntityName = '' }) {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    entityType,
    entityId,
    entityName: entityName || '',
    action,
    actor: actor || '',
    beforeState,
    afterState,
    changes: Array.isArray(changes) ? changes : [],
    sourcePage: sourcePage || '',
    notes: notes || '',
    relatedEntityType: relatedEntityType || '',
    relatedEntityId: relatedEntityId || '',
    relatedEntityName: relatedEntityName || ''
  };
}

function summarizeObject(obj, maxFields = 5) {
  if (!obj || typeof obj !== 'object') return '';
  const keys = Object.keys(obj).slice(0, maxFields);
  const parts = keys.map((k) => {
    const val = obj[k];
    if (val === undefined || val === null || val === '') return '';
    const strVal = typeof val === 'string' ? val : String(val);
    const display = strVal.length > 30 ? strVal.slice(0, 30) + '...' : strVal;
    return `${k}: ${display}`;
  }).filter(Boolean);
  return parts.join('; ');
}

function computeChanges(beforeObj, afterObj, fieldLabels = {}) {
  if (!beforeObj || !afterObj || typeof beforeObj !== 'object' || typeof afterObj !== 'object') {
    return [];
  }
  const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
  const changes = [];
  for (const key of allKeys) {
    const beforeVal = beforeObj[key];
    const afterVal = afterObj[key];
    const beforeStr = beforeVal === undefined || beforeVal === null ? '' : String(beforeVal);
    const afterStr = afterVal === undefined || afterVal === null ? '' : String(afterVal);
    if (beforeStr !== afterStr) {
      const label = fieldLabels[key] || key;
      const beforeDisplay = beforeStr.length > 50 ? beforeStr.slice(0, 50) + '...' : beforeStr;
      const afterDisplay = afterStr.length > 50 ? afterStr.slice(0, 50) + '...' : afterStr;
      changes.push({
        field: key,
        label,
        before: beforeDisplay,
        after: afterDisplay
      });
    }
  }
  return changes;
}

function shallowPick(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  const result = {};
  for (const k of keys) {
    if (obj[k] !== undefined) {
      result[k] = obj[k];
    }
  }
  return result;
}

const MEMBER_SUMMARY_FIELDS = ['nickname', 'phone', 'area'];
const GEAR_SUMMARY_FIELDS = ['name', 'category', 'owner', 'status', 'deposit'];
const REQUEST_SUMMARY_FIELDS = ['gearName', 'borrower', 'start', 'end', 'status'];
const DEPOSIT_SUMMARY_FIELDS = ['gearName', 'borrower', 'depositAmount', 'receivedAmount', 'deductedAmount', 'status'];
const HANDOVER_SUMMARY_FIELDS = ['type', 'gearName', 'borrower', 'ownerConfirmed', 'borrowerConfirmed'];
const SETTLEMENT_SUMMARY_FIELDS = ['name', 'status', 'totalDeposit', 'totalDeducted'];
const INVENTORY_SUMMARY_FIELDS = ['name', 'type', 'date', 'status', 'checker'];
const RESERVATION_SUMMARY_FIELDS = ['gearName', 'borrower', 'start', 'end', 'status'];
const TRIP_SUMMARY_FIELDS = ['destination', 'startDate', 'members'];
const MAINTENANCE_SUMMARY_FIELDS = ['gearName', 'type', 'date', 'handler'];

export function getSummaryFields(entityType) {
  switch (entityType) {
    case 'member': return MEMBER_SUMMARY_FIELDS;
    case 'gear': return GEAR_SUMMARY_FIELDS;
    case 'request': return REQUEST_SUMMARY_FIELDS;
    case 'deposit': return DEPOSIT_SUMMARY_FIELDS;
    case 'handover': return HANDOVER_SUMMARY_FIELDS;
    case 'settlement': return SETTLEMENT_SUMMARY_FIELDS;
    case 'inventory': return INVENTORY_SUMMARY_FIELDS;
    case 'reservation': return RESERVATION_SUMMARY_FIELDS;
    case 'trip': return TRIP_SUMMARY_FIELDS;
    case 'maintenance': return MAINTENANCE_SUMMARY_FIELDS;
    default: return [];
  }
}

const FIELD_LABELS = {
  member: { nickname: '昵称', phone: '电话', area: '地区', notes: '备注' },
  gear: { name: '名称', category: '分类', owner: '主人', status: '状态', deposit: '押金', notes: '备注', damage: '损耗情况', available: '可借日期', maintenanceCycleDays: '保养周期', nextMaintenanceDate: '下次保养', maintenanceReminderLevel: '提醒级别' },
  request: { gearName: '装备', borrower: '借用人', start: '开始日期', end: '结束日期', status: '状态', reason: '原因', damage: '损坏情况' },
  deposit: { gearName: '装备', borrower: '借用人', depositAmount: '押金金额', receivedAmount: '已收金额', deductedAmount: '扣除金额', refundedAmount: '退还金额', status: '状态', deductReason: '扣除原因', notes: '备注' },
  handover: { type: '类型', gearName: '装备', borrower: '借用人', gearStatus: '装备状态', deposit: '押金', accessories: '配件', handoverNotes: '交接备注', damageRecord: '损坏记录', deductAmount: '扣除金额', deductReason: '扣除原因', ownerConfirmed: '主人确认', borrowerConfirmed: '借用人确认' },
  settlement: { name: '名称', status: '状态', totalDeposit: '押金总额', totalDeducted: '扣款总额', totalExtraExpenses: '额外费用', notes: '备注' },
  inventory: { name: '名称', type: '类型', date: '日期', status: '状态', checker: '盘点人', notes: '备注' },
  reservation: { gearName: '装备', borrower: '借用人', start: '开始日期', end: '结束日期', status: '状态', reason: '原因', notes: '备注', priorityScore: '优先级', queuePosition: '队列位置' },
  trip: { destination: '目的地', startDate: '出发日期', members: '成员', notes: '备注' },
  maintenance: { gearName: '装备', type: '类型', date: '日期', description: '描述', handler: '处理人' }
};

export function getFieldLabels(entityType) {
  return FIELD_LABELS[entityType] || {};
}

export function recordEvent(eventLogsRef, { entityType, entityId, entityName, action, actor, beforeState = null, afterState = null, sourcePage = '', notes = '', relatedEntityType = '', relatedEntityId = '', relatedEntityName = '', customChanges = null }) {
  if (!eventLogsRef) return null;

  const summaryFields = getSummaryFields(entityType);
  const fieldLabels = getFieldLabels(entityType);

  const beforeSummary = beforeState ? shallowPick(beforeState, summaryFields) : null;
  const afterSummary = afterState ? shallowPick(afterState, summaryFields) : null;

  const changes = customChanges !== null
    ? customChanges
    : computeChanges(beforeSummary, afterSummary, fieldLabels);

  const event = createEvent({
    entityType,
    entityId,
    entityName,
    action,
    actor,
    beforeState: beforeSummary ? summarizeObject(beforeSummary) : '',
    afterState: afterSummary ? summarizeObject(afterSummary) : '',
    changes,
    sourcePage,
    notes,
    relatedEntityType,
    relatedEntityId,
    relatedEntityName
  });

  if (Array.isArray(eventLogsRef.value)) {
    eventLogsRef.value = [event, ...eventLogsRef.value];
  }

  return event;
}

export function useEventLog({ eventLogs, currentUser }) {
  const logs = eventLogs;

  function record(params) {
    const actor = currentUser?.value || '';
    return recordEvent(logs, { ...params, actor });
  }

  function getEventsByEntity(entityType, entityId) {
    if (!logs?.value) return [];
    return logs.value.filter((e) =>
      e.entityType === entityType && (entityId ? e.entityId === entityId : true)
    ).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  function getEventsByActor(actor) {
    if (!logs?.value) return [];
    return logs.value.filter((e) => e.actor === actor)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  function getEventsByDateRange(startDate, endDate) {
    if (!logs?.value) return [];
    return logs.value.filter((e) => {
      const ts = new Date(e.timestamp);
      return ts >= new Date(startDate) && ts <= new Date(endDate);
    }).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  function getRecentEvents(limit = 50) {
    if (!logs?.value) return [];
    return [...logs.value]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  function filterEvents({ entityTypes = [], actions = [], actor = '', searchText = '', startDate = '', endDate = '' }) {
    if (!logs?.value) return [];
    let result = [...logs.value];

    if (entityTypes.length > 0) {
      result = result.filter((e) => entityTypes.includes(e.entityType));
    }
    if (actions.length > 0) {
      result = result.filter((e) => actions.includes(e.action));
    }
    if (actor) {
      result = result.filter((e) => e.actor === actor);
    }
    if (searchText) {
      const lower = searchText.toLowerCase();
      result = result.filter((e) =>
        (e.entityName && e.entityName.toLowerCase().includes(lower)) ||
        (e.notes && e.notes.toLowerCase().includes(lower)) ||
        (e.relatedEntityName && e.relatedEntityName.toLowerCase().includes(lower)) ||
        (e.actor && e.actor.toLowerCase().includes(lower)) ||
        (e.beforeState && e.beforeState.toLowerCase().includes(lower)) ||
        (e.afterState && e.afterState.toLowerCase().includes(lower))
      );
    }
    if (startDate) {
      result = result.filter((e) => e.timestamp >= startDate);
    }
    if (endDate) {
      result = result.filter((e) => e.timestamp <= endDate + 'T23:59:59.999Z');
    }

    return result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  function getEventStats() {
    if (!logs?.value) {
      return { total: 0, byEntity: {}, byAction: {}, byActor: {} };
    }
    const all = logs.value;
    const byEntity = {};
    const byAction = {};
    const byActor = {};

    for (const e of all) {
      byEntity[e.entityType] = (byEntity[e.entityType] || 0) + 1;
      byAction[e.action] = (byAction[e.action] || 0) + 1;
      if (e.actor) {
        byActor[e.actor] = (byActor[e.actor] || 0) + 1;
      }
    }

    return {
      total: all.length,
      byEntity,
      byAction,
      byActor
    };
  }

  return {
    logs,
    record,
    getEventsByEntity,
    getEventsByActor,
    getEventsByDateRange,
    getRecentEvents,
    filterEvents,
    getEventStats
  };
}
