import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useInventory } from '../../composables/useInventory.js';
import {
  createMockGear,
  iso
} from '../testData.js';

const createMockInventoryList = (overrides = {}) => ({
  id: 'inv-' + Math.random().toString(36).substring(2, 9),
  name: '测试盘点单',
  type: '出行前',
  tripId: '',
  tripName: '',
  date: iso(0),
  status: '进行中',
  checker: '张三',
  notes: '',
  items: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides
});

const createMockInventoryItem = (overrides = {}) => ({
  id: 'item-' + Math.random().toString(36).substring(2, 9),
  gearId: 'gear-001',
  gearName: '测试帐篷',
  owner: '张三',
  checkStatus: '待盘点',
  missingAccessories: '',
  notes: '',
  checker: '',
  hasAbnormal: false,
  abnormalActions: [],
  ...overrides
});

describe('useInventory - 异常标记刷新', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshItemAbnormalFlag: 状态为缺失时标记异常', () => {
    const item = createMockInventoryItem({ checkStatus: '缺失' });
    const inventoryLists = ref([createMockInventoryList({ items: [item] })]);

    const { lists } = useInventory({
      inventoryLists,
      gears: ref([]),
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    const listItem = lists.value[0].items[0];
    expect(listItem.hasAbnormal).toBe(true);
  });

  it('refreshItemAbnormalFlag: 有缺失配件时标记异常', () => {
    const item = createMockInventoryItem({ missingAccessories: '地钉 x2' });
    const inventoryLists = ref([createMockInventoryList({ items: [item] })]);

    const { lists } = useInventory({
      inventoryLists,
      gears: ref([]),
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    expect(lists.value[0].items[0].hasAbnormal).toBe(true);
  });

  it('refreshItemAbnormalFlag: 有备注时标记异常', () => {
    const item = createMockInventoryItem({ notes: '有轻微磨损' });
    const inventoryLists = ref([createMockInventoryList({ items: [item] })]);

    const { lists } = useInventory({
      inventoryLists,
      gears: ref([]),
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    expect(lists.value[0].items[0].hasAbnormal).toBe(true);
  });

  it('refreshItemAbnormalFlag: 有待处理异常操作时标记异常', () => {
    const item = createMockInventoryItem({
      abnormalActions: [
        { id: 'act-1', type: '押金扣除', status: '待处理', amount: '100' }
      ]
    });
    const inventoryLists = ref([createMockInventoryList({ items: [item] })]);

    const { lists } = useInventory({
      inventoryLists,
      gears: ref([]),
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    expect(lists.value[0].items[0].hasAbnormal).toBe(true);
  });

  it('refreshItemAbnormalFlag: 已取消的异常操作不触发异常标记', () => {
    const item = createMockInventoryItem({
      abnormalActions: [
        { id: 'act-1', type: '押金扣除', status: '已取消', amount: '100' }
      ]
    });
    const inventoryLists = ref([createMockInventoryList({ items: [item] })]);

    const { lists } = useInventory({
      inventoryLists,
      gears: ref([]),
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    expect(lists.value[0].items[0].hasAbnormal).toBe(false);
  });

  it('refreshItemAbnormalFlag: 空字符串的配件和备注不触发异常', () => {
    const item = createMockInventoryItem({
      missingAccessories: '',
      notes: '   ',
      checkStatus: '已盘点'
    });
    const inventoryLists = ref([createMockInventoryList({ items: [item] })]);

    const { lists } = useInventory({
      inventoryLists,
      gears: ref([]),
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    expect(lists.value[0].items[0].hasAbnormal).toBe(false);
  });
});

describe('useInventory - 异常操作管理', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('addAbnormalAction: 成功添加异常操作并更新异常标记', () => {
    const item = createMockInventoryItem({ id: 'item-1', checkStatus: '已盘点' });
    const list = createMockInventoryList({ id: 'inv-1', items: [item] });
    const inventoryLists = ref([list]);

    const { addAbnormalAction } = useInventory({
      inventoryLists,
      gears: ref([]),
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    const result = addAbnormalAction('inv-1', 'item-1', {
      type: '押金扣除',
      description: '帐篷损坏需赔偿',
      amount: '150',
      borrower: '李四'
    });

    expect(result).not.toBeNull();
    expect(result.items[0].abnormalActions).toHaveLength(1);
    expect(result.items[0].abnormalActions[0].type).toBe('押金扣除');
    expect(result.items[0].abnormalActions[0].amount).toBe('150');
    expect(result.items[0].abnormalActions[0].status).toBe('待处理');
    expect(result.items[0].hasAbnormal).toBe(true);
  });

  it('addAbnormalAction: 盘点单不存在时返回null', () => {
    const inventoryLists = ref([]);

    const { addAbnormalAction } = useInventory({
      inventoryLists,
      gears: ref([]),
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    const result = addAbnormalAction('nonexistent', 'item-1', { type: '押金扣除' });
    expect(result).toBeNull();
  });

  it('updateAbnormalAction: 更新异常操作状态', () => {
    const action = { id: 'act-1', type: '押金扣除', status: '待处理', amount: '100' };
    const item = createMockInventoryItem({ id: 'item-1', abnormalActions: [action], hasAbnormal: true });
    const list = createMockInventoryList({ id: 'inv-1', items: [item] });
    const inventoryLists = ref([list]);

    const { updateAbnormalAction } = useInventory({
      inventoryLists,
      gears: ref([]),
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    const result = updateAbnormalAction('inv-1', 'item-1', 'act-1', { status: '已处理' });

    expect(result).not.toBeNull();
    const updatedAction = result.items[0].abnormalActions.find(a => a.id === 'act-1');
    expect(updatedAction.status).toBe('已处理');
    expect(updatedAction.updatedAt).toBeDefined();
  });

  it('updateAbnormalAction: 取消异常操作后异常标记可能消失', () => {
    const action = { id: 'act-1', type: '押金扣除', status: '待处理', amount: '100' };
    const item = createMockInventoryItem({
      id: 'item-1',
      checkStatus: '已盘点',
      abnormalActions: [action],
      hasAbnormal: true
    });
    const list = createMockInventoryList({ id: 'inv-1', items: [item] });
    const inventoryLists = ref([list]);

    const { updateAbnormalAction } = useInventory({
      inventoryLists,
      gears: ref([]),
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    const result = updateAbnormalAction('inv-1', 'item-1', 'act-1', { status: '已取消' });
    expect(result.items[0].hasAbnormal).toBe(false);
  });

  it('removeAbnormalAction: 移除异常操作', () => {
    const action = { id: 'act-1', type: '押金扣除', status: '待处理', amount: '100' };
    const item = createMockInventoryItem({ id: 'item-1', abnormalActions: [action] });
    const list = createMockInventoryList({ id: 'inv-1', items: [item] });
    const inventoryLists = ref([list]);

    const { removeAbnormalAction } = useInventory({
      inventoryLists,
      gears: ref([]),
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    const result = removeAbnormalAction('inv-1', 'item-1', 'act-1');
    expect(result).not.toBeNull();
    expect(result.items[0].abnormalActions).toHaveLength(0);
  });
});

describe('useInventory - 待处理异常查询', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('getPendingAbnormalActions: 获取所有待处理异常', () => {
    const action1 = { id: 'act-1', type: '押金扣除', status: '待处理', amount: '100', createdAt: '2026-06-10T10:00:00Z' };
    const action2 = { id: 'act-2', type: '保养记录', status: '已处理', amount: '0', createdAt: '2026-06-11T10:00:00Z' };
    const action3 = { id: 'act-3', type: '押金扣除', status: '待处理', amount: '50', createdAt: '2026-06-12T10:00:00Z' };

    const item1 = createMockInventoryItem({ id: 'item-1', gearId: 'gear-001', gearName: '帐篷', owner: '张三', abnormalActions: [action1, action2] });
    const item2 = createMockInventoryItem({ id: 'item-2', gearId: 'gear-002', gearName: '睡袋', owner: '李四', abnormalActions: [action3] });

    const list1 = createMockInventoryList({ id: 'inv-1', name: '盘点单1', date: iso(-5), type: '出行后', items: [item1] });
    const list2 = createMockInventoryList({ id: 'inv-2', name: '盘点单2', date: iso(-2), type: '出行后', items: [item2] });

    const inventoryLists = ref([list1, list2]);

    const { getPendingAbnormalActions } = useInventory({
      inventoryLists,
      gears: ref([]),
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    const pending = getPendingAbnormalActions();
    expect(pending).toHaveLength(2);
    expect(pending[0].id).toBe('act-1');
    expect(pending[1].id).toBe('act-3');
    expect(pending[0].inventoryName).toBe('盘点单1');
    expect(pending[1].inventoryName).toBe('盘点单2');
  });

  it('getAbnormalActionsByGear: 按装备获取异常操作历史', () => {
    const action1 = { id: 'act-1', type: '押金扣除', status: '待处理', amount: '100', createdAt: '2026-06-10T10:00:00Z' };
    const action2 = { id: 'act-2', type: '保养记录', status: '已处理', amount: '0', createdAt: '2026-06-08T10:00:00Z' };

    const item1 = createMockInventoryItem({ id: 'item-1', gearId: 'gear-001', abnormalActions: [action1] });
    const item2 = createMockInventoryItem({ id: 'item-2', gearId: 'gear-001', abnormalActions: [action2] });

    const list1 = createMockInventoryList({ id: 'inv-1', name: '盘点单1', date: iso(-5), items: [item1] });
    const list2 = createMockInventoryList({ id: 'inv-2', name: '盘点单2', date: iso(-10), items: [item2] });

    const inventoryLists = ref([list1, list2]);

    const { getAbnormalActionsByGear } = useInventory({
      inventoryLists,
      gears: ref([]),
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    const actions = getAbnormalActionsByGear('gear-001');
    expect(actions).toHaveLength(2);
    expect(actions[0].createdAt > actions[1].createdAt).toBe(true);
  });
});

describe('useInventory - 盘点统计与状态', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('getStats: 正确统计盘点进度', () => {
    const items = [
      createMockInventoryItem({ id: 'i1', checkStatus: '已盘点' }),
      createMockInventoryItem({ id: 'i2', checkStatus: '已盘点' }),
      createMockInventoryItem({ id: 'i3', checkStatus: '待盘点' }),
      createMockInventoryItem({ id: 'i4', checkStatus: '缺失' })
    ];
    const list = createMockInventoryList({ id: 'inv-1', items });
    const inventoryLists = ref([list]);

    const { getStats } = useInventory({
      inventoryLists,
      gears: ref([]),
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    const stats = getStats('inv-1');
    expect(stats.total).toBe(4);
    expect(stats.checked).toBe(2);
    expect(stats.pending).toBe(1);
    expect(stats.missing).toBe(1);
    expect(stats.progress).toBe(50);
  });

  it('inventoryCount/completedCount/pendingCount: 正确统计盘点单状态', () => {
    const lists = [
      createMockInventoryList({ id: 'inv-1', status: '进行中' }),
      createMockInventoryList({ id: 'inv-2', status: '已完成' }),
      createMockInventoryList({ id: 'inv-3', status: '进行中' })
    ];
    const inventoryLists = ref(lists);

    const { inventoryCount, completedCount, pendingCount } = useInventory({
      inventoryLists,
      gears: ref([]),
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    expect(inventoryCount.value).toBe(3);
    expect(completedCount.value).toBe(1);
    expect(pendingCount.value).toBe(2);
  });

  it('completeList/reopenList: 切换盘点单状态', () => {
    const list = createMockInventoryList({ id: 'inv-1', status: '进行中' });
    const inventoryLists = ref([list]);

    const { completeList, reopenList } = useInventory({
      inventoryLists,
      gears: ref([]),
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    const completed = completeList('inv-1');
    expect(completed.status).toBe('已完成');

    const reopened = reopenList('inv-1');
    expect(reopened.status).toBe('进行中');
  });
});

describe('useInventory - 盘点项状态更新', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updateItemStatus: 更新盘点状态并刷新异常标记', () => {
    const item = createMockInventoryItem({ id: 'item-1', checkStatus: '待盘点' });
    const list = createMockInventoryList({ id: 'inv-1', items: [item] });
    const inventoryLists = ref([list]);

    const { updateItemStatus } = useInventory({
      inventoryLists,
      gears: ref([]),
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    const result = updateItemStatus('inv-1', 'item-1', '缺失');
    expect(result.items[0].checkStatus).toBe('缺失');
    expect(result.items[0].hasAbnormal).toBe(true);
    expect(result.items[0].checker).toBe('张三');
  });

  it('toggleItemStatus: 循环切换盘点状态', () => {
    const item = createMockInventoryItem({ id: 'item-1', checkStatus: '待盘点' });
    const list = createMockInventoryList({ id: 'inv-1', items: [item] });
    const inventoryLists = ref([list]);

    const { toggleItemStatus } = useInventory({
      inventoryLists,
      gears: ref([]),
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    let result = toggleItemStatus('inv-1', 'item-1');
    expect(result.items[0].checkStatus).toBe('已盘点');
    inventoryLists.value = [result];

    result = toggleItemStatus('inv-1', 'item-1');
    expect(result.items[0].checkStatus).toBe('缺失');
    inventoryLists.value = [result];

    result = toggleItemStatus('inv-1', 'item-1');
    expect(result.items[0].checkStatus).toBe('待盘点');
  });

  it('updateItem: 更新盘点项并刷新异常标记', () => {
    const item = createMockInventoryItem({ id: 'item-1', checkStatus: '已盘点', missingAccessories: '' });
    const list = createMockInventoryList({ id: 'inv-1', items: [item] });
    const inventoryLists = ref([list]);

    const { updateItem } = useInventory({
      inventoryLists,
      gears: ref([]),
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    const result = updateItem('inv-1', 'item-1', { missingAccessories: '地钉 x3' });
    expect(result.items[0].missingAccessories).toBe('地钉 x3');
    expect(result.items[0].hasAbnormal).toBe(true);
  });
});

describe('useInventory - 创建盘点单', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('createList: 创建空白盘点单', () => {
    const inventoryLists = ref([]);
    const gears = ref([]);
    const trips = ref([]);

    const { createList } = useInventory({
      inventoryLists,
      gears,
      trips,
      members: ref([]),
      currentUser: ref('张三')
    });

    const newList = createList({ name: '新盘点单', type: '出行前' });
    expect(newList).toBeDefined();
    expect(newList.name).toBe('新盘点单');
    expect(newList.type).toBe('出行前');
    expect(newList.status).toBe('进行中');
    expect(newList.checker).toBe('张三');
    expect(newList.items).toHaveLength(0);
  });

  it('createList: 基于出行创建盘点单时自动生成盘点项', () => {
    const gears = [
      createMockGear({ id: 'gear-001', name: '帐篷', owner: '张三' }),
      createMockGear({ id: 'gear-002', name: '睡袋', owner: '李四' })
    ];
    const trip = {
      id: 'trip-1',
      destination: '海边露营',
      gears: [
        { gearId: 'gear-001', gearName: '帐篷', owner: '张三' },
        { gearId: 'gear-002', gearName: '睡袋', owner: '李四' }
      ]
    };

    const inventoryLists = ref([]);
    const gearsRef = ref(gears);
    const tripsRef = ref([trip]);

    const { createList } = useInventory({
      inventoryLists,
      gears: gearsRef,
      trips: tripsRef,
      members: ref([]),
      currentUser: ref('张三')
    });

    const newList = createList({
      name: '海边露营盘点',
      type: '出行前',
      tripId: 'trip-1'
    });

    expect(newList.items).toHaveLength(2);
    expect(newList.items[0].gearId).toBe('gear-001');
    expect(newList.items[1].gearId).toBe('gear-002');
    expect(newList.tripName).toBe('海边露营');
  });

  it('addGearToList: 向盘点单添加装备', () => {
    const gear = createMockGear({ id: 'gear-001', name: '帐篷', owner: '张三' });
    const list = createMockInventoryList({ id: 'inv-1', items: [] });

    const inventoryLists = ref([list]);
    const gearsRef = ref([gear]);

    const { addGearToList } = useInventory({
      inventoryLists,
      gears: gearsRef,
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    const result = addGearToList('inv-1', 'gear-001');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].gearName).toBe('帐篷');
  });

  it('addGearToList: 重复添加同一装备返回null', () => {
    const gear = createMockGear({ id: 'gear-001', name: '帐篷' });
    const item = createMockInventoryItem({ gearId: 'gear-001' });
    const list = createMockInventoryList({ id: 'inv-1', items: [item] });

    const inventoryLists = ref([list]);
    const gearsRef = ref([gear]);

    const { addGearToList } = useInventory({
      inventoryLists,
      gears: gearsRef,
      trips: ref([]),
      members: ref([]),
      currentUser: ref('张三')
    });

    const result = addGearToList('inv-1', 'gear-001');
    expect(result).toBeNull();
  });
});
