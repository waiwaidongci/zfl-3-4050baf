const iso = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

export const INVENTORY_TYPES = ['出行前', '出行后'];
export const INVENTORY_STATUSES = ['进行中', '已完成'];
export const ITEM_CHECK_STATUSES = ['待盘点', '已盘点', '缺失'];
export const ABNORMAL_ACTION_TYPES = ['装备损耗', '保养记录', '押金扣除'];
export const ABNORMAL_ACTION_STATUSES = ['待处理', '已处理', '已取消'];

export function createInventoryItemFromGear(gear, checker = '') {
  return {
    id: crypto.randomUUID(),
    gearId: gear.id,
    gearName: gear.name,
    owner: gear.owner,
    checkStatus: '待盘点',
    missingAccessories: '',
    notes: '',
    checker,
    hasAbnormal: false,
    abnormalActions: []
  };
}

export function createInventoryList({ name, type, tripId = '', tripName = '', checker = '', notes = '', items = [] }) {
  return {
    id: crypto.randomUUID(),
    name: name || '未命名盘点',
    type: type || '出行前',
    tripId,
    tripName,
    date: iso(0),
    status: '进行中',
    checker,
    notes: notes || '',
    items: [...items],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function createAbnormalAction({ type, description = '', amount = '0', handler = '', borrower = '' }) {
  return {
    id: crypto.randomUUID(),
    type,
    description,
    amount: String(amount),
    handler,
    borrower,
    status: '待处理',
    relatedRecordId: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function getInventoryStats(inventoryList) {
  const items = inventoryList?.items || [];
  const total = items.length;
  const checked = items.filter((i) => i.checkStatus === '已盘点').length;
  const missing = items.filter((i) => i.checkStatus === '缺失').length;
  const pending = items.filter((i) => i.checkStatus === '待盘点').length;
  const progress = total > 0 ? Math.round((checked / total) * 100) : 0;
  return { total, checked, missing, pending, progress };
}

export function getAbnormalItems(inventoryList) {
  const items = inventoryList?.items || [];
  return items.filter((item) => item.hasAbnormal);
}

export function getPendingDepositDeductions(inventoryLists, tripId = null) {
  const actions = [];
  const lists = tripId
    ? inventoryLists.filter((l) => l.tripId === tripId && l.type === '出行后')
    : inventoryLists.filter((l) => l.type === '出行后');

  for (const list of lists) {
    const items = Array.isArray(list.items) ? list.items : [];
    for (const item of items) {
      (item.abnormalActions || []).forEach((action) => {
        if (action.type === '押金扣除' && action.status === '待处理') {
          const amount = Number(action.amount) || 0;
          if (amount > 0) {
            actions.push({
              ...action,
              itemId: item.id,
              gearId: item.gearId,
              gearName: item.gearName,
              owner: item.owner,
              inventoryId: list.id,
              inventoryName: list.name,
              inventoryDate: list.date
            });
          }
        }
      });
    }
  }
  return actions;
}

export function createDepositDeductionPayload(action, depositRecords, requestRecords) {
  const deposit = depositRecords.find((d) => d.borrower === action.borrower && d.gearId === action.gearId);
  const request = requestRecords.find((r) => r.borrower === action.borrower && r.gearId === action.gearId);

  const baseReason = '盘点异常扣除';
  const deductReason = action.description
    ? `${baseReason}：${action.description}`
    : baseReason;

  const payload = {
    gearId: action.gearId,
    gearName: action.gearName,
    owner: action.owner,
    borrower: action.borrower || action.owner,
    deductedAmount: action.amount,
    deductReason,
    requestId: request?.id || deposit?.requestId || '',
    relatedInventoryId: action.inventoryId,
    relatedInventoryActionId: action.id
  };

  return payload;
}

export function applyAbnormalDeductionToDeposit(abnormalAction, depositRecords, requestRecords) {
  const payload = createDepositDeductionPayload(abnormalAction, depositRecords, requestRecords);
  const deposit = depositRecords.find((d) =>
    (payload.requestId && d.requestId === payload.requestId) ||
    (d.borrower === payload.borrower && d.gearId === payload.gearId)
  );

  if (!deposit) {
    const newDeposit = {
      id: crypto.randomUUID(),
      requestId: payload.requestId,
      gearId: payload.gearId,
      gearName: payload.gearName,
      owner: payload.owner,
      borrower: payload.borrower,
      depositAmount: '0',
      receivedAmount: '0',
      deductedAmount: payload.deductedAmount,
      refundedAmount: '0',
      deductReason: payload.deductReason,
      status: '部分扣除',
      notes: `来自盘点异常：${abnormalAction.inventoryName || ''}`,
      createdAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString().slice(0, 10),
      _fromInventory: true
    };
    return { type: 'create', deposit: newDeposit, action: abnormalAction };
  }

  const existingDeduct = Number(deposit.deductedAmount) || 0;
  const newDeduct = existingDeduct + Number(payload.deductedAmount);
  const updatedDeposit = {
    ...deposit,
    deductedAmount: String(newDeduct),
    deductReason: deposit.deductReason
      ? `${deposit.deductReason}；${payload.deductReason}`
      : payload.deductReason,
    updatedAt: new Date().toISOString().slice(0, 10),
    _fromInventory: true
  };

  const depositAmt = Number(updatedDeposit.depositAmount) || 0;
  const received = Number(updatedDeposit.receivedAmount) || 0;
  const ded = newDeduct;
  const ref = Number(updatedDeposit.refundedAmount) || 0;
  if (received === 0) updatedDeposit.status = '待收取';
  else if (received < depositAmt) updatedDeposit.status = '异常';
  else if (ded > 0 && ref > 0 && ded + ref === received) updatedDeposit.status = ded < depositAmt ? '部分扣除' : '已扣除';
  else if (ded > 0 && ref === 0 && ded === received) updatedDeposit.status = ded < depositAmt ? '部分扣除' : '已扣除';
  else if (ref > 0 && ded === 0 && ref === received) updatedDeposit.status = '已退还';
  else if (received === depositAmt && ded === 0 && ref === 0) updatedDeposit.status = '已收取';
  else if (ded + ref > received) updatedDeposit.status = '异常';
  else updatedDeposit.status = '异常';

  return { type: 'update', deposit: updatedDeposit, action: abnormalAction };
}
