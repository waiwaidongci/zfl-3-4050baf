import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useSettlement } from '../../composables/useSettlement.js';
import {
  createMockGear,
  iso
} from '../testData.js';

const createTestMember = (id, nickname) => ({
  id,
  nickname,
  phone: '',
  area: '',
  notes: ''
});

const createTestDeposit = (overrides = {}) => ({
  id: 'dep-' + Math.random().toString(36).substring(2, 9),
  requestId: '',
  gearId: 'gear-001',
  gearName: '帐篷',
  owner: '张三',
  borrower: '李四',
  depositAmount: '200',
  receivedAmount: '200',
  deductedAmount: '0',
  refundedAmount: '0',
  deductReason: '',
  status: '已收取',
  notes: '',
  createdAt: iso(0),
  updatedAt: iso(0),
  ...overrides
});

const createTestSettlement = (overrides = {}) => ({
  id: 'set-' + Math.random().toString(36).substring(2, 9),
  tripId: '',
  tripName: '',
  name: '测试结算单',
  status: '草稿',
  members: [],
  extraExpenses: [],
  totalDeposit: '0',
  totalDeducted: '0',
  totalExtraExpenses: '0',
  totalPerMember: '0',
  notes: '',
  createdAt: iso(0),
  updatedAt: iso(0),
  ...overrides
});

const createTestInventoryList = (overrides = {}) => ({
  id: 'inv-' + Math.random().toString(36).substring(2, 9),
  name: '出行后盘点',
  type: '出行后',
  tripId: '',
  tripName: '',
  date: iso(0),
  status: '已完成',
  checker: '张三',
  items: [],
  ...overrides
});

describe('useSettlement - 基础统计与状态', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('settlementCount/draftCount/confirmedCount/settledCount: 正确统计各状态数量', () => {
    const records = [
      createTestSettlement({ id: 's1', status: '草稿' }),
      createTestSettlement({ id: 's2', status: '已确认' }),
      createTestSettlement({ id: 's3', status: '已结算' }),
      createTestSettlement({ id: 's4', status: '草稿' })
    ];

    const settlementRecords = ref(records);
    const { settlementCount, draftCount, confirmedCount, settledCount } = useSettlement({
      settlementRecords,
      trips: ref([]),
      members: ref([]),
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    expect(settlementCount.value).toBe(4);
    expect(draftCount.value).toBe(2);
    expect(confirmedCount.value).toBe(1);
    expect(settledCount.value).toBe(1);
  });

  it('getById: 获取指定结算单', () => {
    const record = createTestSettlement({ id: 's1', name: '测试单' });
    const settlementRecords = ref([record]);

    const { getById } = useSettlement({
      settlementRecords,
      trips: ref([]),
      members: ref([]),
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    expect(getById('s1').name).toBe('测试单');
    expect(getById('nonexistent')).toBeNull();
  });

  it('updateStatus: 更新结算单状态', () => {
    const record = createTestSettlement({ id: 's1', status: '草稿' });
    const settlementRecords = ref([record]);

    const { updateStatus } = useSettlement({
      settlementRecords,
      trips: ref([]),
      members: ref([]),
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    const updated = updateStatus('s1', '已确认');
    expect(updated.status).toBe('已确认');
    expect(updated.updatedAt).toBeDefined();
  });

  it('updateStatus: 无效状态返回null', () => {
    const record = createTestSettlement({ id: 's1', status: '草稿' });
    const settlementRecords = ref([record]);

    const { updateStatus } = useSettlement({
      settlementRecords,
      trips: ref([]),
      members: ref([]),
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    expect(updateStatus('s1', '无效状态')).toBeNull();
  });
});

describe('useSettlement - 费用管理', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('addExpense: 添加额外费用', () => {
    const record = createTestSettlement({ id: 's1' });
    const settlementRecords = ref([record]);

    const { addExpense, recalcSettlement } = useSettlement({
      settlementRecords,
      trips: ref([]),
      members: ref([]),
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    const updated = addExpense('s1', { name: '食材费', amount: '150', paidBy: '张三' });
    expect(updated.extraExpenses).toHaveLength(1);
    expect(updated.extraExpenses[0].name).toBe('食材费');
    expect(updated.extraExpenses[0].amount).toBe('150');
  });

  it('editExpense: 编辑额外费用', () => {
    const expense = { id: 'exp-1', name: '食材费', amount: '100', paidBy: '张三' };
    const record = createTestSettlement({ id: 's1', extraExpenses: [expense] });
    const settlementRecords = ref([record]);

    const { editExpense } = useSettlement({
      settlementRecords,
      trips: ref([]),
      members: ref([]),
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    const updated = editExpense('s1', 'exp-1', { amount: '200' });
    expect(updated.extraExpenses[0].amount).toBe('200');
  });

  it('deleteExpense: 删除额外费用', () => {
    const expense = { id: 'exp-1', name: '食材费', amount: '100', paidBy: '张三' };
    const record = createTestSettlement({ id: 's1', extraExpenses: [expense] });
    const settlementRecords = ref([record]);

    const { deleteExpense } = useSettlement({
      settlementRecords,
      trips: ref([]),
      members: ref([]),
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    const updated = deleteExpense('s1', 'exp-1');
    expect(updated.extraExpenses).toHaveLength(0);
  });
});

describe('useSettlement - 成员押金与支付', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('setMemberPayment: 设置成员支付金额', () => {
    const member = {
      memberId: 'm1',
      nickname: '李四',
      depositItems: [],
      extraShare: '0',
      totalOwed: '100',
      paidAmount: '0',
      paymentStatus: '未支付',
      notes: ''
    };
    const record = createTestSettlement({ id: 's1', members: [member] });
    const settlementRecords = ref([record]);

    const { setMemberPayment } = useSettlement({
      settlementRecords,
      trips: ref([]),
      members: ref([]),
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    const updated = setMemberPayment('s1', 0, '50');
    expect(updated.members[0].paidAmount).toBe('50');
  });

  it('setMemberNotes: 设置成员备注', () => {
    const member = {
      memberId: 'm1',
      nickname: '李四',
      depositItems: [],
      extraShare: '0',
      totalOwed: '0',
      paidAmount: '0',
      paymentStatus: '未支付',
      notes: ''
    };
    const record = createTestSettlement({ id: 's1', members: [member] });
    const settlementRecords = ref([record]);

    const { setMemberNotes } = useSettlement({
      settlementRecords,
      trips: ref([]),
      members: ref([]),
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    const updated = setMemberNotes('s1', 0, '已转账');
    expect(updated.members[0].notes).toBe('已转账');
  });

  it('markAllPaid: 标记所有成员已支付', () => {
    const members = [
      { memberId: 'm1', nickname: '张三', depositItems: [], extraShare: '0', totalOwed: '100', paidAmount: '0', paymentStatus: '未支付', notes: '' },
      { memberId: 'm2', nickname: '李四', depositItems: [], extraShare: '0', totalOwed: '100', paidAmount: '50', paymentStatus: '部分支付', notes: '' }
    ];
    const record = createTestSettlement({ id: 's1', members });
    const settlementRecords = ref([record]);

    const { markAllPaid } = useSettlement({
      settlementRecords,
      trips: ref([]),
      members: ref([]),
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    const updated = markAllPaid('s1');
    expect(updated.members[0].paymentStatus).toBe('已支付');
    expect(updated.members[1].paymentStatus).toBe('已支付');
  });

  it('setMemberDeduct: 设置成员押金实际扣除金额', () => {
    const depositItem = {
      depositId: 'dep-1',
      gearName: '帐篷',
      depositAmount: '200',
      deductedAmount: '0',
      actualDeduct: '0',
      source: 'deposit'
    };
    const member = {
      memberId: 'm1',
      nickname: '李四',
      depositItems: [depositItem],
      extraShare: '0',
      totalOwed: '0',
      paidAmount: '0',
      paymentStatus: '未支付',
      notes: ''
    };
    const record = createTestSettlement({ id: 's1', members: [member] });
    const settlementRecords = ref([record]);

    const { setMemberDeduct } = useSettlement({
      settlementRecords,
      trips: ref([]),
      members: ref([]),
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    const updated = setMemberDeduct('s1', 0, 0, '50');
    expect(updated.members[0].depositItems[0].actualDeduct).toBe('50');
  });
});

describe('useSettlement - 结算刷新与盘点联动', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshFromDeposits: 从押金记录刷新结算', () => {
    const member = {
      memberId: 'm1',
      nickname: '李四',
      depositItems: [],
      extraShare: '0',
      totalOwed: '0',
      paidAmount: '0',
      paymentStatus: '未支付',
      notes: ''
    };
    const record = createTestSettlement({
      id: 's1',
      tripId: 'trip-1',
      members: [member]
    });
    const deposit = createTestDeposit({
      id: 'dep-1',
      borrower: '李四',
      gearId: 'gear-001',
      depositAmount: '200',
      deductedAmount: '50'
    });
    const trip = {
      id: 'trip-1',
      destination: '海边露营',
      members: ['李四'],
      gears: [{ gearId: 'gear-001' }]
    };

    const settlementRecords = ref([record]);
    const depositRecords = ref([deposit]);
    const trips = ref([trip]);
    const gears = ref([createMockGear({ id: 'gear-001' })]);

    const { refreshFromDeposits } = useSettlement({
      settlementRecords,
      trips,
      members: ref([]),
      depositRecords,
      gears,
      requests: ref([]),
      inventoryLists: ref([])
    });

    const updated = refreshFromDeposits('s1');
    expect(updated).not.toBeNull();
    const memberData = updated.members.find(m => m.nickname === '李四');
    expect(memberData.depositItems.length).toBeGreaterThanOrEqual(1);
  });

  it('refreshFromAllSources: 从所有来源刷新（押金+盘点）', () => {
    const member = {
      memberId: 'm1',
      nickname: '李四',
      depositItems: [],
      extraShare: '0',
      totalOwed: '0',
      paidAmount: '0',
      paymentStatus: '未支付',
      notes: ''
    };
    const record = createTestSettlement({
      id: 's1',
      tripId: 'trip-1',
      members: [member]
    });
    const deposit = createTestDeposit({
      id: 'dep-1',
      borrower: '李四',
      gearId: 'gear-001',
      depositAmount: '200'
    });
    const trip = {
      id: 'trip-1',
      destination: '海边露营',
      members: ['李四'],
      gears: [{ gearId: 'gear-001' }]
    };

    const deductionAction = {
      id: 'act-1',
      type: '押金扣除',
      status: '待处理',
      amount: '80',
      description: '帐篷损坏',
      borrower: '李四',
      createdAt: new Date().toISOString()
    };

    const inventoryList = createTestInventoryList({
      id: 'inv-1',
      tripId: 'trip-1',
      type: '出行后',
      items: [
        {
          id: 'item-1',
          gearId: 'gear-001',
          gearName: '帐篷',
          owner: '张三',
          abnormalActions: [deductionAction]
        }
      ]
    });

    const settlementRecords = ref([record]);
    const depositRecords = ref([deposit]);
    const trips = ref([trip]);
    const gears = ref([createMockGear({ id: 'gear-001' })]);
    const inventoryLists = ref([inventoryList]);

    const { refreshFromAllSources } = useSettlement({
      settlementRecords,
      trips,
      members: ref([]),
      depositRecords,
      gears,
      requests: ref([]),
      inventoryLists
    });

    const updated = refreshFromAllSources('s1');
    expect(updated).not.toBeNull();
    const memberData = updated.members.find(m => m.nickname === '李四');

    const depositItems = memberData.depositItems.filter(d => d.source === 'deposit');
    expect(depositItems.length).toBeGreaterThanOrEqual(1);

    const inventoryItems = memberData.depositItems.filter(d => d.source === 'inventory');
    expect(inventoryItems.length).toBeGreaterThanOrEqual(1);
    expect(inventoryItems[0].pending).toBe(true);
    expect(Number(inventoryItems[0].deductedAmount)).toBe(80);
  });

  it('handleInventoryDeduction: 处理盘点扣款（确认/取消）', () => {
    const deductionAction = {
      id: 'act-1',
      type: '押金扣除',
      status: '待处理',
      amount: '60',
      borrower: '李四',
      createdAt: new Date().toISOString()
    };

    const depositItem = {
      depositId: 'inv-act-1',
      gearName: '帐篷',
      depositAmount: '0',
      deductedAmount: '60',
      actualDeduct: '0',
      source: 'inventory',
      inventoryId: 'inv-1',
      pending: true,
      description: '脏污清洗费'
    };

    const member = {
      memberId: 'm1',
      nickname: '李四',
      depositItems: [depositItem],
      extraShare: '0',
      totalOwed: '0',
      paidAmount: '0',
      paymentStatus: '未支付',
      notes: ''
    };

    const record = createTestSettlement({ id: 's1', members: [member] });
    const settlementRecords = ref([record]);

    const { handleInventoryDeduction } = useSettlement({
      settlementRecords,
      trips: ref([]),
      members: ref([]),
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    const confirmed = handleInventoryDeduction('s1', 'act-1', true);
    const confirmedItem = confirmed.members[0].depositItems.find(d => d.source === 'inventory');
    expect(confirmedItem.pending).toBe(false);
    expect(Number(confirmedItem.actualDeduct)).toBe(60);

    const cancelled = handleInventoryDeduction('s1', 'act-1', false);
    const cancelledItem = cancelled.members[0].depositItems.find(d => d.source === 'inventory');
    expect(cancelledItem.pending).toBe(false);
    expect(Number(cancelledItem.actualDeduct)).toBe(0);
  });
});

describe('useSettlement - 结算创建与完结', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('createManual: 创建手工结算单', () => {
    const members = [
      createTestMember('m1', '张三'),
      createTestMember('m2', '李四')
    ];

    const settlementRecords = ref([]);
    const membersRef = ref(members);

    const { createManual } = useSettlement({
      settlementRecords,
      trips: ref([]),
      members: membersRef,
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    const newSettlement = createManual('手工结算单', ['m1', 'm2']);
    expect(newSettlement.name).toBe('手工结算单');
    expect(newSettlement.status).toBe('草稿');
    expect(newSettlement.members).toHaveLength(2);
  });

  it('createForTrip: 基于出行创建结算单', () => {
    const members = [
      createTestMember('m1', '张三'),
      createTestMember('m2', '李四')
    ];
    const trip = {
      id: 'trip-1',
      destination: '武功山露营',
      members: ['张三', '李四'],
      gears: [
        { gearId: 'gear-001', gearName: '帐篷', owner: '张三', deposit: '200' }
      ]
    };

    const settlementRecords = ref([]);
    const tripsRef = ref([trip]);
    const membersRef = ref(members);

    const { createForTrip } = useSettlement({
      settlementRecords,
      trips: tripsRef,
      members: membersRef,
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    const newSettlement = createForTrip('trip-1');
    expect(newSettlement).not.toBeNull();
    expect(newSettlement.tripId).toBe('trip-1');
    expect(newSettlement.tripName).toBe('武功山露营');
    expect(newSettlement.members).toHaveLength(2);
    expect(newSettlement.name).toContain('武功山露营');
  });

  it('canFinalize: 检查是否可以完结结算', () => {
    const member = {
      memberId: 'm1',
      nickname: '张三',
      depositItems: [],
      extraShare: '0',
      totalOwed: '100',
      paidAmount: '100',
      paymentStatus: '已支付',
      notes: ''
    };
    const record = createTestSettlement({
      id: 's1',
      status: '已确认',
      members: [member]
    });

    const settlementRecords = ref([record]);

    const { canFinalize } = useSettlement({
      settlementRecords,
      trips: ref([]),
      members: ref([]),
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    expect(canFinalize('s1')).toBe(true);
  });

  it('canFinalize: 未全部支付时不能完结', () => {
    const member = {
      memberId: 'm1',
      nickname: '张三',
      depositItems: [],
      extraShare: '0',
      totalOwed: '100',
      paidAmount: '50',
      paymentStatus: '部分支付',
      notes: ''
    };
    const record = createTestSettlement({
      id: 's1',
      status: '已确认',
      members: [member]
    });

    const settlementRecords = ref([record]);

    const { canFinalize } = useSettlement({
      settlementRecords,
      trips: ref([]),
      members: ref([]),
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    expect(canFinalize('s1')).toBe(false);
  });

  it('finalize: 完结结算单', () => {
    const member = {
      memberId: 'm1',
      nickname: '张三',
      depositItems: [],
      extraShare: '0',
      totalOwed: '100',
      paidAmount: '100',
      paymentStatus: '已支付',
      notes: ''
    };
    const record = createTestSettlement({
      id: 's1',
      status: '已确认',
      members: [member]
    });

    const settlementRecords = ref([record]);

    const { finalize, canFinalize } = useSettlement({
      settlementRecords,
      trips: ref([]),
      members: ref([]),
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    expect(canFinalize('s1')).toBe(true);
    const finalized = finalize('s1');
    expect(finalized.status).toBe('已结算');
  });

  it('finalize: 不能完结时返回null', () => {
    const member = {
      memberId: 'm1',
      nickname: '张三',
      depositItems: [],
      extraShare: '0',
      totalOwed: '100',
      paidAmount: '0',
      paymentStatus: '未支付',
      notes: ''
    };
    const record = createTestSettlement({
      id: 's1',
      status: '草稿',
      members: [member]
    });

    const settlementRecords = ref([record]);

    const { finalize } = useSettlement({
      settlementRecords,
      trips: ref([]),
      members: ref([]),
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    expect(finalize('s1')).toBeNull();
  });
});

describe('useSettlement - 统计信息', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('getStats: 获取结算统计信息', () => {
    const member1 = {
      memberId: 'm1',
      nickname: '张三',
      depositItems: [
        { depositId: 'd1', gearName: '帐篷', depositAmount: '200', deductedAmount: '0', actualDeduct: '0', source: 'deposit' }
      ],
      extraShare: '50',
      totalOwed: '50',
      paidAmount: '50',
      paymentStatus: '已支付',
      notes: ''
    };
    const member2 = {
      memberId: 'm2',
      nickname: '李四',
      depositItems: [
        { depositId: 'd2', gearName: '睡袋', depositAmount: '100', deductedAmount: '30', actualDeduct: '30', source: 'deposit' }
      ],
      extraShare: '50',
      totalOwed: '80',
      paidAmount: '0',
      paymentStatus: '未支付',
      notes: ''
    };

    const record = createTestSettlement({
      id: 's1',
      members: [member1, member2],
      totalDeposit: '300',
      totalDeducted: '30',
      totalExtraExpenses: '100'
    });

    const settlementRecords = ref([record]);

    const { getStats } = useSettlement({
      settlementRecords,
      trips: ref([]),
      members: ref([]),
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    const stats = getStats('s1');
    expect(stats).toBeDefined();
    expect(stats.memberCount).toBe(2);
    expect(typeof stats.totalOwed).toBe('number');
    expect(Number(stats.totalPaid)).toBeGreaterThanOrEqual(0);
  });

  it('getWrapupStatus: 获取收尾状态', () => {
    const member = {
      memberId: 'm1',
      nickname: '张三',
      depositItems: [],
      extraShare: '0',
      totalOwed: '0',
      paidAmount: '0',
      paymentStatus: '未支付',
      notes: ''
    };
    const record = createTestSettlement({
      id: 's1',
      status: '草稿',
      members: [member]
    });

    const settlementRecords = ref([record]);

    const { getWrapupStatus } = useSettlement({
      settlementRecords,
      trips: ref([]),
      members: ref([]),
      depositRecords: ref([]),
      gears: ref([]),
      requests: ref([]),
      inventoryLists: ref([])
    });

    const status = getWrapupStatus('s1');
    expect(status).toBeDefined();
    expect(typeof status.canFinalize).toBe('boolean');
  });
});
