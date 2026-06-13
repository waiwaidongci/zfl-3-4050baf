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
