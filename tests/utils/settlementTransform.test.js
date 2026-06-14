import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSettlement,
  linkDepositsToSettlement,
  calculateSettlement,
  addExtraExpense,
  updateExtraExpense,
  removeExtraExpense,
  updateMemberDepositDeduct,
  updateMemberPayment,
  updateMemberNotes,
  syncDepositChanges,
  getSettlementStats,
  getSettlementWrapupStatus,
  refreshSettlementFromSources,
  markInventoryDeductionAsHandled,
  updateAllPaymentsToPaid,
  canFinalizeSettlement,
  finalizeSettlement,
  SETTLEMENT_STATUSES,
  PAYMENT_STATUSES
} from '../../utils/settlementTransform.js';
import { createMockGear, iso } from '../testData.js';

const createMockMember = (overrides = {}) => ({
  id: 'member-' + Math.random().toString(36).substring(2, 9),
  nickname: '测试成员',
  phone: '',
  area: '',
  notes: '',
  ...overrides
});

const createMockDeposit = (overrides = {}) => ({
  id: 'dep-' + Math.random().toString(36).substring(2, 9),
  requestId: '',
  gearId: 'gear-001',
  gearName: '测试帐篷',
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

describe('settlementTransform - 常量定义', () => {
  it('结算状态常量正确', () => {
    expect(SETTLEMENT_STATUSES).toEqual(['草稿', '已确认', '已结算']);
  });

  it('支付状态常量正确', () => {
    expect(PAYMENT_STATUSES).toEqual(['未支付', '部分支付', '已支付']);
  });
});

describe('settlementTransform - 创建结算单', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('createSettlement 生成正确的结算单', () => {
    const members = [
      createMockMember({ id: 'm1', nickname: '张三' }),
      createMockMember({ id: 'm2', nickname: '李四' })
    ];

    const settlement = createSettlement({
      tripId: 'trip-001',
      tripName: '国庆露营',
      members,
      name: '国庆露营结算单'
    });

    expect(settlement.id).toBeDefined();
    expect(settlement.tripId).toBe('trip-001');
    expect(settlement.tripName).toBe('国庆露营');
    expect(settlement.name).toBe('国庆露营结算单');
    expect(settlement.status).toBe('草稿');
    expect(settlement.members).toHaveLength(2);
    expect(settlement.members[0].nickname).toBe('张三');
    expect(settlement.members[0].depositItems).toEqual([]);
    expect(settlement.members[0].extraShare).toBe('0');
    expect(settlement.members[0].totalOwed).toBe('0');
    expect(settlement.members[0].paidAmount).toBe('0');
    expect(settlement.members[0].paymentStatus).toBe('未支付');
    expect(settlement.extraExpenses).toEqual([]);
    expect(settlement.totalDeposit).toBe('0');
    expect(settlement.totalDeducted).toBe('0');
    expect(settlement.totalExtraExpenses).toBe('0');
    expect(settlement.totalPerMember).toBe('0');
  });

  it('createSettlement 使用默认名称', () => {
    const settlement = createSettlement({ tripName: '海边露营', members: [] });
    expect(settlement.name).toBe('海边露营 结算单');
  });

  it('createSettlement 无出行时使用默认名称', () => {
    const settlement = createSettlement({ members: [] });
    expect(settlement.name).toBe('新结算单');
  });
});

describe('settlementTransform - 押金关联', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('linkDepositsToSettlement 关联成员押金记录', () => {
    const members = [
      { memberId: 'm1', nickname: '张三', depositItems: [], extraShare: '0', totalOwed: '0', paidAmount: '0', paymentStatus: '未支付', notes: '' },
      { memberId: 'm2', nickname: '李四', depositItems: [], extraShare: '0', totalOwed: '0', paidAmount: '0', paymentStatus: '未支付', notes: '' }
    ];
    const settlement = { id: 's1', members, extraExpenses: [], totalDeposit: '0', totalDeducted: '0', totalExtraExpenses: '0', totalPerMember: '0' };

    const depositRecords = [
      createMockDeposit({ id: 'dep-1', borrower: '李四', gearId: 'gear-001', gearName: '帐篷', depositAmount: '200', deductedAmount: '30' }),
      createMockDeposit({ id: 'dep-2', borrower: '李四', gearId: 'gear-002', gearName: '睡袋', depositAmount: '100' }),
      createMockDeposit({ id: 'dep-3', borrower: '王五', gearId: 'gear-003', gearName: '炉头', depositAmount: '50' })
    ];

    const result = linkDepositsToSettlement(settlement, depositRecords, ['张三', '李四'], [], null, []);

    expect(result.members[0].depositItems).toHaveLength(0);
    expect(result.members[1].depositItems).toHaveLength(2);
    expect(result.members[1].depositItems[0].depositId).toBe('dep-1');
    expect(result.members[1].depositItems[0].depositAmount).toBe('200');
    expect(result.members[1].depositItems[0].actualDeduct).toBe('30');
    expect(result.members[1].depositItems[0].source).toBe('deposit');
  });

  it('linkDepositsToSettlement 包含盘点押金扣除', () => {
    const members = [
      { memberId: 'm1', nickname: '李四', depositItems: [], extraShare: '0', totalOwed: '0', paidAmount: '0', paymentStatus: '未支付', notes: '' }
    ];
    const settlement = { id: 's1', members, extraExpenses: [], totalDeposit: '0', totalDeducted: '0', totalExtraExpenses: '0', totalPerMember: '0' };

    const inventoryLists = [
      {
        id: 'inv-1',
        name: '出行后盘点',
        type: '出行后',
        date: iso(0),
        items: [
          {
            id: 'item-1',
            gearId: 'gear-001',
            gearName: '测试帐篷',
            owner: '张三',
            abnormalActions: [
              {
                id: 'action-1',
                type: '押金扣除',
                amount: '50',
                description: '帐篷损坏',
                status: '待处理',
                borrower: '李四',
                handler: '管理员',
                createdAt: new Date().toISOString()
              }
            ]
          }
        ]
      }
    ];

    const result = linkDepositsToSettlement(settlement, [], ['李四'], [], null, inventoryLists);

    expect(result.members[0].depositItems).toHaveLength(1);
    expect(result.members[0].depositItems[0].source).toBe('inventory');
    expect(result.members[0].depositItems[0].deductedAmount).toBe('50');
    expect(result.members[0].depositItems[0].actualDeduct).toBe('0');
    expect(result.members[0].depositItems[0].pending).toBe(true);
    expect(result.members[0].depositItems[0].inventoryName).toBe('出行后盘点');
  });

  it('linkDepositsToSettlement 按 tripGears 过滤', () => {
    const members = [
      { memberId: 'm1', nickname: '李四', depositItems: [], extraShare: '0', totalOwed: '0', paidAmount: '0', paymentStatus: '未支付', notes: '' }
    ];
    const settlement = { id: 's1', members, extraExpenses: [], totalDeposit: '0', totalDeducted: '0', totalExtraExpenses: '0', totalPerMember: '0' };

    const depositRecords = [
      createMockDeposit({ id: 'dep-1', borrower: '李四', gearId: 'gear-001', gearName: '帐篷' }),
      createMockDeposit({ id: 'dep-2', borrower: '李四', gearId: 'gear-002', gearName: '睡袋' })
    ];

    const tripGears = [{ gearId: 'gear-001' }];

    const result = linkDepositsToSettlement(settlement, depositRecords, ['李四'], tripGears, null, []);

    expect(result.members[0].depositItems).toHaveLength(1);
    expect(result.members[0].depositItems[0].gearName).toBe('帐篷');
  });
});

describe('settlementTransform - 计算结算', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calculateSettlement 正确计算押金扣除和额外费用分摊', () => {
    const members = [
      {
        memberId: 'm1',
        nickname: '张三',
        depositItems: [
          { depositId: 'd1', gearName: '帐篷', depositAmount: '200', deductedAmount: '0', actualDeduct: '50', source: 'deposit' }
        ],
        extraShare: '0',
        totalOwed: '0',
        paidAmount: '0',
        paymentStatus: '未支付',
        notes: ''
      },
      {
        memberId: 'm2',
        nickname: '李四',
        depositItems: [
          { depositId: 'd2', gearName: '睡袋', depositAmount: '100', deductedAmount: '0', actualDeduct: '30', source: 'deposit' }
        ],
        extraShare: '0',
        totalOwed: '0',
        paidAmount: '0',
        paymentStatus: '未支付',
        notes: ''
      }
    ];

    const settlement = {
      id: 's1',
      members,
      extraExpenses: [
        { id: 'e1', name: '食材费', amount: '100', paidBy: '张三' }
      ],
      totalDeposit: '0',
      totalDeducted: '0',
      totalExtraExpenses: '0',
      totalPerMember: '0'
    };

    const result = calculateSettlement(settlement);

    expect(Number(result.totalDeposit)).toBe(300);
    expect(Number(result.totalDeducted)).toBe(80);
    expect(Number(result.totalExtraExpenses)).toBe(100);
    expect(Number(result.totalPerMember)).toBe(90);

    expect(Number(result.members[0].extraShare)).toBe(50);
    expect(Number(result.members[0].totalOwed)).toBe(100);
    expect(result.members[0].paymentStatus).toBe('未支付');

    expect(Number(result.members[1].extraShare)).toBe(50);
    expect(Number(result.members[1].totalOwed)).toBe(80);
  });

  it('calculateSettlement 支付状态判断正确', () => {
    const members = [
      { memberId: 'm1', nickname: '全额支付', depositItems: [], extraShare: '0', totalOwed: '0', paidAmount: '100', paymentStatus: '未支付', notes: '' },
      { memberId: 'm2', nickname: '部分支付', depositItems: [], extraShare: '0', totalOwed: '0', paidAmount: '50', paymentStatus: '未支付', notes: '' },
      { memberId: 'm3', nickname: '未支付', depositItems: [], extraShare: '0', totalOwed: '0', paidAmount: '0', paymentStatus: '未支付', notes: '' }
    ];

    const settlement = {
      id: 's1',
      members,
      extraExpenses: [
        { id: 'e1', name: '费用', amount: '300', paidBy: '' }
      ],
      totalDeposit: '0',
      totalDeducted: '0',
      totalExtraExpenses: '0',
      totalPerMember: '0'
    };

    const result = calculateSettlement(settlement);

    expect(result.members[0].paymentStatus).toBe('已支付');
    expect(result.members[1].paymentStatus).toBe('部分支付');
    expect(result.members[2].paymentStatus).toBe('未支付');
  });

  it('calculateSettlement 零欠款时支付状态为已支付', () => {
    const members = [
      { memberId: 'm1', nickname: '零欠款', depositItems: [], extraShare: '0', totalOwed: '0', paidAmount: '0', paymentStatus: '未支付', notes: '' }
    ];

    const settlement = {
      id: 's1',
      members,
      extraExpenses: [],
      totalDeposit: '0',
      totalDeducted: '0',
      totalExtraExpenses: '0',
      totalPerMember: '0'
    };

    const result = calculateSettlement(settlement);

    expect(result.members[0].paymentStatus).toBe('已支付');
    expect(Number(result.members[0].totalOwed)).toBe(0);
  });
});

describe('settlementTransform - 额外费用管理', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('addExtraExpense 添加额外费用并重新计算', () => {
    const settlement = createSettlement({
      members: [createMockMember({ nickname: '张三' }), createMockMember({ nickname: '李四' })]
    });

    const result = addExtraExpense(settlement, { name: '食材费', amount: '200', paidBy: '张三' });

    expect(result.extraExpenses).toHaveLength(1);
    expect(result.extraExpenses[0].name).toBe('食材费');
    expect(Number(result.totalExtraExpenses)).toBe(200);
    expect(Number(result.members[0].extraShare)).toBe(100);
  });

  it('updateExtraExpense 更新额外费用', () => {
    let settlement = createSettlement({ members: [createMockMember({ nickname: '张三' })] });
    settlement = addExtraExpense(settlement, { name: '食材费', amount: '100' });

    const expenseId = settlement.extraExpenses[0].id;
    const result = updateExtraExpense(settlement, expenseId, { name: '更新后的费用', amount: '200' });

    expect(result.extraExpenses[0].name).toBe('更新后的费用');
    expect(Number(result.totalExtraExpenses)).toBe(200);
  });

  it('removeExtraExpense 删除额外费用', () => {
    let settlement = createSettlement({ members: [createMockMember({ nickname: '张三' })] });
    settlement = addExtraExpense(settlement, { name: '食材费', amount: '100' });

    const expenseId = settlement.extraExpenses[0].id;
    const result = removeExtraExpense(settlement, expenseId);

    expect(result.extraExpenses).toHaveLength(0);
    expect(Number(result.totalExtraExpenses)).toBe(0);
  });
});

describe('settlementTransform - 成员押金与支付', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updateMemberDepositDeduct 更新实际扣除金额', () => {
    const members = [
      {
        memberId: 'm1',
        nickname: '张三',
        depositItems: [
          { depositId: 'd1', gearName: '帐篷', depositAmount: '200', deductedAmount: '0', actualDeduct: '0', source: 'deposit' }
        ],
        extraShare: '0',
        totalOwed: '0',
        paidAmount: '0',
        paymentStatus: '未支付',
        notes: ''
      }
    ];
    const settlement = { id: 's1', members, extraExpenses: [], totalDeposit: '0', totalDeducted: '0', totalExtraExpenses: '0', totalPerMember: '0' };

    const result = updateMemberDepositDeduct(settlement, 0, 0, '50');

    expect(result.members[0].depositItems[0].actualDeduct).toBe('50');
    expect(Number(result.totalDeducted)).toBe(50);
    expect(Number(result.members[0].totalOwed)).toBe(50);
  });

  it('updateMemberPayment 更新支付金额', () => {
    const members = [
      {
        memberId: 'm1',
        nickname: '张三',
        depositItems: [
          { depositId: 'd1', gearName: '帐篷', depositAmount: '200', deductedAmount: '100', actualDeduct: '100', source: 'deposit' }
        ],
        extraShare: '0',
        totalOwed: '0',
        paidAmount: '0',
        paymentStatus: '未支付',
        notes: ''
      }
    ];
    const settlement = { id: 's1', members, extraExpenses: [], totalDeposit: '0', totalDeducted: '0', totalExtraExpenses: '0', totalPerMember: '0' };

    const result = updateMemberPayment(settlement, 0, '80');

    expect(result.members[0].paidAmount).toBe('80');
    expect(Number(result.members[0].totalOwed)).toBe(100);
    expect(result.members[0].paymentStatus).toBe('部分支付');
  });

  it('updateMemberNotes 更新备注', () => {
    const members = [
      { memberId: 'm1', nickname: '张三', depositItems: [], extraShare: '0', totalOwed: '0', paidAmount: '0', paymentStatus: '未支付', notes: '' }
    ];
    const settlement = { id: 's1', members, extraExpenses: [], totalDeposit: '0', totalDeducted: '0', totalExtraExpenses: '0', totalPerMember: '0' };

    const result = updateMemberNotes(settlement, 0, '已确认费用');

    expect(result.members[0].notes).toBe('已确认费用');
  });
});

describe('settlementTransform - 结算刷新', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('syncDepositChanges 同步押金变更', () => {
    const members = [
      { memberId: 'm1', nickname: '李四', depositItems: [], extraShare: '0', totalOwed: '0', paidAmount: '0', paymentStatus: '未支付', notes: '' }
    ];
    const settlement = { id: 's1', tripId: 'trip-1', members, extraExpenses: [], totalDeposit: '0', totalDeducted: '0', totalExtraExpenses: '0', totalPerMember: '0' };

    const depositRecords = [
      createMockDeposit({ id: 'dep-1', borrower: '李四', gearId: 'gear-001', gearName: '帐篷', depositAmount: '200', deductedAmount: '30' })
    ];

    const result = syncDepositChanges(settlement, depositRecords, [], null, []);

    expect(result.members[0].depositItems).toHaveLength(1);
    expect(result.members[0].depositItems[0].depositId).toBe('dep-1');
    expect(Number(result.totalDeposit)).toBe(200);
  });

  it('refreshSettlementFromSources 从多源刷新结算', () => {
    const members = [
      { memberId: 'm1', nickname: '李四', depositItems: [], extraShare: '0', totalOwed: '0', paidAmount: '0', paymentStatus: '未支付', notes: '' }
    ];
    const settlement = { id: 's1', members, extraExpenses: [], totalDeposit: '0', totalDeducted: '0', totalExtraExpenses: '0', totalPerMember: '0' };

    const depositRecords = [
      createMockDeposit({ id: 'dep-1', borrower: '李四', gearId: 'gear-001', gearName: '帐篷', depositAmount: '200' })
    ];

    const inventoryLists = [
      {
        id: 'inv-1',
        name: '出行后盘点',
        type: '出行后',
        date: iso(0),
        items: [
          {
            id: 'item-1',
            gearId: 'gear-002',
            gearName: '睡袋',
            owner: '张三',
            abnormalActions: [
              { id: 'act-1', type: '押金扣除', amount: '50', description: '脏污', status: '已处理', borrower: '李四', handler: '管理员', createdAt: new Date().toISOString() }
            ]
          }
        ]
      }
    ];

    const result = refreshSettlementFromSources(settlement, depositRecords, inventoryLists, [], null);

    expect(result.members[0].depositItems.length).toBeGreaterThan(0);
    expect(Number(result.totalDeposit)).toBeGreaterThan(0);
  });

  it('markInventoryDeductionAsHandled 标记盘点扣除为已处理', () => {
    const members = [
      {
        memberId: 'm1',
        nickname: '李四',
        depositItems: [
          {
            depositId: 'inv-action-1',
            gearName: '帐篷',
            depositAmount: '0',
            deductedAmount: '100',
            actualDeduct: '0',
            source: 'inventory',
            inventoryId: 'inv-1',
            inventoryName: '出行后盘点',
            inventoryDate: iso(0),
            description: '帐篷损坏',
            pending: true
          }
        ],
        extraShare: '0',
        totalOwed: '0',
        paidAmount: '0',
        paymentStatus: '未支付',
        notes: ''
      }
    ];
    const settlement = { id: 's1', members, extraExpenses: [], totalDeposit: '0', totalDeducted: '0', totalExtraExpenses: '0', totalPerMember: '0' };

    const result = markInventoryDeductionAsHandled(settlement, 'action-1', true);

    const invItem = result.members[0].depositItems.find(d => d.source === 'inventory');
    expect(invItem.pending).toBe(false);
  });

  it('updateAllPaymentsToPaid 一键标记全部已支付', () => {
    const members = [
      {
        memberId: 'm1',
        nickname: '张三',
        depositItems: [
          { depositId: 'd1', gearName: '帐篷', depositAmount: '200', deductedAmount: '100', actualDeduct: '100', source: 'deposit' }
        ],
        extraShare: '0',
        totalOwed: '0',
        paidAmount: '0',
        paymentStatus: '未支付',
        notes: ''
      },
      {
        memberId: 'm2',
        nickname: '李四',
        depositItems: [
          { depositId: 'd2', gearName: '睡袋', depositAmount: '100', deductedAmount: '50', actualDeduct: '50', source: 'deposit' }
        ],
        extraShare: '0',
        totalOwed: '0',
        paidAmount: '20',
        paymentStatus: '部分支付',
        notes: ''
      }
    ];
    const settlement = { id: 's1', members, extraExpenses: [], totalDeposit: '0', totalDeducted: '0', totalExtraExpenses: '0', totalPerMember: '0' };

    const result = updateAllPaymentsToPaid(settlement);

    expect(result.members[0].paymentStatus).toBe('已支付');
    expect(result.members[1].paymentStatus).toBe('已支付');
    expect(Number(result.members[0].paidAmount)).toBe(100);
    expect(Number(result.members[1].paidAmount)).toBe(50);
  });
});

describe('settlementTransform - 统计与状态', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('getSettlementStats 正确统计结算状态', () => {
    const members = [
      { memberId: 'm1', nickname: '张三', depositItems: [], extraShare: '0', totalOwed: '100', paidAmount: '100', paymentStatus: '已支付', notes: '' },
      { memberId: 'm2', nickname: '李四', depositItems: [], extraShare: '0', totalOwed: '50', paidAmount: '30', paymentStatus: '部分支付', notes: '' },
      { memberId: 'm3', nickname: '王五', depositItems: [], extraShare: '0', totalOwed: '80', paidAmount: '0', paymentStatus: '未支付', notes: '' }
    ];
    const settlement = { id: 's1', members, extraExpenses: [], totalDeposit: '0', totalDeducted: '0', totalExtraExpenses: '0', totalPerMember: '0' };

    const stats = getSettlementStats(settlement);

    expect(stats.memberCount).toBe(3);
    expect(stats.totalOwed).toBe(230);
    expect(stats.totalPaid).toBe(130);
    expect(stats.totalUnpaid).toBe(100);
    expect(stats.paidMembers).toBe(1);
    expect(stats.unpaidMembers).toBe(1);
    expect(stats.partialMembers).toBe(1);
  });

  it('getSettlementStats null 返回 null', () => {
    expect(getSettlementStats(null)).toBeNull();
  });

  it('getSettlementWrapupStatus 返回汇总状态', () => {
    const members = [
      { memberId: 'm1', nickname: '张三', depositItems: [{ depositId: 'd1', actualDeduct: '50' }], extraShare: '0', totalOwed: '50', paidAmount: '50', paymentStatus: '已支付', notes: '' },
      { memberId: 'm2', nickname: '李四', depositItems: [], extraShare: '0', totalOwed: '0', paidAmount: '0', paymentStatus: '未支付', notes: '' }
    ];
    const settlement = {
      id: 's1',
      status: '草稿',
      members,
      extraExpenses: [{ id: 'e1', name: '费用', amount: '100' }]
    };

    const status = getSettlementWrapupStatus(settlement);

    expect(status.hasSettlement).toBe(true);
    expect(status.status).toBe('草稿');
    expect(status.allPaid).toBe(false);
    expect(status.hasUnpaid).toBe(true);
    expect(status.hasExpenses).toBe(true);
    expect(status.hasDepositDeductions).toBe(true);
  });

  it('canFinalizeSettlement 全部支付后可结算', () => {
    const members = [
      { memberId: 'm1', nickname: '张三', depositItems: [], extraShare: '0', totalOwed: '100', paidAmount: '100', paymentStatus: '已支付', notes: '' },
      { memberId: 'm2', nickname: '李四', depositItems: [], extraShare: '0', totalOwed: '50', paidAmount: '50', paymentStatus: '已支付', notes: '' }
    ];
    const settlement = { id: 's1', status: '草稿', members, extraExpenses: [] };

    expect(canFinalizeSettlement(settlement)).toBe(true);
  });

  it('canFinalizeSettlement 已结算的不可再次结算', () => {
    const settlement = { id: 's1', status: '已结算', members: [], extraExpenses: [] };
    expect(canFinalizeSettlement(settlement)).toBe(false);
  });

  it('finalizeSettlement 标记为已结算', () => {
    const settlement = { id: 's1', status: '草稿', members: [], extraExpenses: [], updatedAt: iso(-1) };
    const result = finalizeSettlement(settlement);
    expect(result.status).toBe('已结算');
    expect(result.updatedAt).not.toBe(settlement.updatedAt);
  });
});
