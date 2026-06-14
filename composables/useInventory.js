import { computed } from 'vue';
import {
  createInventoryList,
  createInventoryItemFromGear,
  createAbnormalAction,
  getInventoryStats
} from '../utils/inventoryTransform.js';

function resolve(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object' && 'value' in val) return val.value;
  return val;
}

export function useInventory({ inventoryLists, gears, trips, members, currentUser }) {
  const lists = computed(() => {
    const raw = resolve(inventoryLists) || [];
    return raw.map((list) => {
      const safeItems = Array.isArray(list.items) ? list.items : [];
      return {
        ...list,
        items: safeItems.map((item) => refreshItemAbnormalFlag(item))
      };
    });
  });
  const gearList = computed(() => resolve(gears) || []);
  const tripList = computed(() => resolve(trips) || []);
  const memberList = computed(() => resolve(members) || []);
  const user = computed(() => resolve(currentUser) || '');

  const inventoryCount = computed(() => lists.value.length);
  const completedCount = computed(() => lists.value.filter((l) => l.status === '已完成').length);
  const pendingCount = computed(() => lists.value.filter((l) => l.status === '进行中').length);

  const lastInventoryByGear = computed(() => {
    const map = {};
    for (const list of lists.value) {
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

  function createList({ name, type, tripId = '', checker = '', notes = '' }) {
    const trip = tripList.value.find((t) => t.id === tripId);
    const defaultChecker = checker || user.value;
    const items = trip && trip.gears && trip.gears.length > 0
      ? trip.gears.map((g) => {
          const gear = gearList.value.find((x) => x.id === g.gearId);
          return gear ? createInventoryItemFromGear(gear, defaultChecker) : {
            id: crypto.randomUUID(),
            gearId: g.gearId || '',
            gearName: g.gearName || '未知装备',
            owner: g.owner || '',
            checkStatus: '待盘点',
            missingAccessories: '',
            notes: '',
            checker: defaultChecker
          };
        })
      : [];

    const newList = createInventoryList({
      name,
      type,
      tripId,
      tripName: trip ? trip.destination : '',
      checker: defaultChecker,
      notes,
      items
    });

    return newList;
  }

  function addGearToList(inventoryId, gearId) {
    const gear = gearList.value.find((g) => g.id === gearId);
    if (!gear) return null;
    const list = lists.value.find((l) => l.id === inventoryId);
    if (!list) return null;
    if (list.items.some((item) => item.gearId === gearId)) return null;
    const newItem = createInventoryItemFromGear(gear, user.value);
    return {
      ...list,
      items: [...list.items, newItem],
      updatedAt: new Date().toISOString()
    };
  }

  function removeItemFromList(inventoryId, itemId) {
    const list = lists.value.find((l) => l.id === inventoryId);
    if (!list) return null;
    return {
      ...list,
      items: list.items.filter((item) => item.id !== itemId),
      updatedAt: new Date().toISOString()
    };
  }

  function updateItemStatus(inventoryId, itemId, checkStatus) {
    const list = lists.value.find((l) => l.id === inventoryId);
    if (!list) return null;
    return {
      ...list,
      items: list.items.map((item) => {
        if (item.id !== itemId) return item;
        const updatedItem = {
          ...item,
          checkStatus,
          checker: checkStatus !== '待盘点' ? (item.checker || user.value) : item.checker
        };
        return refreshItemAbnormalFlag(updatedItem);
      }),
      updatedAt: new Date().toISOString()
    };
  }

  function updateItem(inventoryId, itemId, updates) {
    const list = lists.value.find((l) => l.id === inventoryId);
    if (!list) return null;
    return {
      ...list,
      items: list.items.map((item) => {
        if (item.id !== itemId) return item;
        const updatedItem = { ...item, ...updates };
        return refreshItemAbnormalFlag(updatedItem);
      }),
      updatedAt: new Date().toISOString()
    };
  }

  function updateListInfo(inventoryId, updates) {
    const list = lists.value.find((l) => l.id === inventoryId);
    if (!list) return null;
    return {
      ...list,
      ...updates,
      updatedAt: new Date().toISOString()
    };
  }

  function toggleItemStatus(inventoryId, itemId) {
    const list = lists.value.find((l) => l.id === inventoryId);
    if (!list) return null;
    const item = list.items.find((i) => i.id === itemId);
    if (!item) return null;
    const statusOrder = ['待盘点', '已盘点', '缺失'];
    const currentIdx = statusOrder.indexOf(item.checkStatus);
    const nextStatus = statusOrder[(currentIdx + 1) % statusOrder.length];
    return updateItemStatus(inventoryId, itemId, nextStatus);
  }

  function completeList(inventoryId) {
    return updateListInfo(inventoryId, { status: '已完成' });
  }

  function reopenList(inventoryId) {
    return updateListInfo(inventoryId, { status: '进行中' });
  }

  function addGearsFromTrip(inventoryId, tripId) {
    const list = lists.value.find((l) => l.id === inventoryId);
    const trip = tripList.value.find((t) => t.id === tripId);
    if (!list || !trip || !trip.gears) return null;

    const existingGearIds = new Set(list.items.map((i) => i.gearId).filter(Boolean));
    const defaultChecker = user.value;
    const newItems = trip.gears
      .filter((g) => g.gearId && !existingGearIds.has(g.gearId))
      .map((g) => {
        const gear = gearList.value.find((x) => x.id === g.gearId);
        return gear ? createInventoryItemFromGear(gear, defaultChecker) : {
          id: crypto.randomUUID(),
          gearId: g.gearId || '',
          gearName: g.gearName || '未知装备',
          owner: g.owner || '',
          checkStatus: '待盘点',
          missingAccessories: '',
          notes: '',
          checker: defaultChecker
        };
      });

    return {
      ...list,
      items: [...list.items, ...newItems],
      tripId,
      tripName: trip.destination,
      updatedAt: new Date().toISOString()
    };
  }

  function getStats(listId) {
    const list = lists.value.find((l) => l.id === listId);
    return getInventoryStats(list);
  }

  function getListById(listId) {
    return lists.value.find((l) => l.id === listId) || null;
  }

  function refreshItemAbnormalFlag(item) {
    const hasAbnormal =
      item.checkStatus === '缺失' ||
      !!(item.missingAccessories && item.missingAccessories.trim()) ||
      !!(item.notes && item.notes.trim()) ||
      (Array.isArray(item.abnormalActions) && item.abnormalActions.some((a) => a.status !== '已取消'));
    return { ...item, hasAbnormal };
  }

  function addAbnormalAction(inventoryId, itemId, actionData) {
    const list = lists.value.find((l) => l.id === inventoryId);
    if (!list) return null;
    const action = createAbnormalAction({
      type: actionData.type,
      description: actionData.description || '',
      amount: actionData.amount || '0',
      handler: actionData.handler || user.value,
      borrower: actionData.borrower || ''
    });
    return {
      ...list,
      items: list.items.map((item) => {
        if (item.id !== itemId) return item;
        const updatedItem = {
          ...item,
          abnormalActions: [...(item.abnormalActions || []), action]
        };
        return refreshItemAbnormalFlag(updatedItem);
      }),
      updatedAt: new Date().toISOString()
    };
  }

  function updateAbnormalAction(inventoryId, itemId, actionId, updates) {
    const list = lists.value.find((l) => l.id === inventoryId);
    if (!list) return null;
    return {
      ...list,
      items: list.items.map((item) => {
        if (item.id !== itemId) return item;
        const abnormalActions = (item.abnormalActions || []).map((a) =>
          a.id === actionId ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a
        );
        const updatedItem = { ...item, abnormalActions };
        return refreshItemAbnormalFlag(updatedItem);
      }),
      updatedAt: new Date().toISOString()
    };
  }

  function removeAbnormalAction(inventoryId, itemId, actionId) {
    const list = lists.value.find((l) => l.id === inventoryId);
    if (!list) return null;
    return {
      ...list,
      items: list.items.map((item) => {
        if (item.id !== itemId) return item;
        const abnormalActions = (item.abnormalActions || []).filter((a) => a.id !== actionId);
        const updatedItem = { ...item, abnormalActions };
        return refreshItemAbnormalFlag(updatedItem);
      }),
      updatedAt: new Date().toISOString()
    };
  }

  function getAbnormalActionsByGear(gearId) {
    const actions = [];
    for (const list of lists.value) {
      for (const item of list.items) {
        if (item.gearId !== gearId) continue;
        (item.abnormalActions || []).forEach((action) => {
          actions.push({
            ...action,
            inventoryId: list.id,
            inventoryName: list.name,
            inventoryDate: list.date,
            inventoryType: list.type,
            itemId: item.id
          });
        });
      }
    }
    return actions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function getPendingAbnormalActions() {
    const actions = [];
    for (const list of lists.value) {
      for (const item of list.items) {
        (item.abnormalActions || []).forEach((action) => {
          if (action.status === '待处理') {
            actions.push({
              ...action,
              inventoryId: list.id,
              inventoryName: list.name,
              inventoryDate: list.date,
              inventoryType: list.type,
              itemId: item.id,
              gearId: item.gearId,
              gearName: item.gearName,
              owner: item.owner
            });
          }
        });
      }
    }
    return actions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  return {
    lists,
    inventoryCount,
    completedCount,
    pendingCount,
    lastInventoryByGear,
    createList,
    addGearToList,
    removeItemFromList,
    updateItemStatus,
    updateItem,
    updateListInfo,
    toggleItemStatus,
    completeList,
    reopenList,
    addGearsFromTrip,
    getStats,
    getListById,
    addAbnormalAction,
    updateAbnormalAction,
    removeAbnormalAction,
    getAbnormalActionsByGear,
    getPendingAbnormalActions
  };
}
