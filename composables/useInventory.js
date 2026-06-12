import { computed } from 'vue';
import {
  createInventoryList,
  createInventoryItemFromGear,
  getInventoryStats
} from '../utils/inventoryTransform.js';

function resolve(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object' && 'value' in val) return val.value;
  return val;
}

export function useInventory({ inventoryLists, gears, trips, members, currentUser }) {
  const lists = computed(() => resolve(inventoryLists) || []);
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
      items: list.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              checkStatus,
              checker: checkStatus !== '待盘点' ? (item.checker || user.value) : item.checker
            }
          : item
      ),
      updatedAt: new Date().toISOString()
    };
  }

  function updateItem(inventoryId, itemId, updates) {
    const list = lists.value.find((l) => l.id === inventoryId);
    if (!list) return null;
    return {
      ...list,
      items: list.items.map((item) =>
        item.id === itemId ? { ...item, ...updates } : item
      ),
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
    getListById
  };
}
