import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateAndNormalizeImportData } from '../../utils/dataTransform.js';
import { createReservation, validateActivation, createRequestFromReservation } from '../../utils/reservationTransform.js';
import { createInventoryList, createInventoryItemFromGear, createAbnormalAction, getPendingDepositDeductions } from '../../utils/inventoryTransform.js';
import { createSettlement, linkDepositsToSettlement, calculateSettlement, refreshSettlementFromSources, canFinalizeSettlement, finalizeSettlement, markInventoryDeductionAsHandled, updateAllPaymentsToPaid } from '../../utils/settlementTransform.js';

const iso = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

describe('冒烟测试 - 核心模块导入导出', () => {
  it('所有核心工具模块能正常导入', () => {
    expect(validateAndNormalizeImportData).toBeDefined();
    expect(typeof validateAndNormalizeImportData).toBe('function');
    expect(createReservation).toBeDefined();
    expect(createInventoryList).toBeDefined();
    expect(createSettlement).toBeDefined();
  });

  it('composables 能正常导入', async () => {
    const { useInventory } = await import('../../composables/useInventory.js');
    const { useReservation } = await import('../../composables/useReservation.js');
    const { useSettlement } = await import('../../composables/useSettlement.js');

    expect(useInventory).toBeDefined();
    expect(useReservation).toBeDefined();
    expect(useSettlement).toBeDefined();
    expect(typeof useInventory).toBe('function');
    expect(typeof useReservation).toBe('function');
    expect(typeof useSettlement).toBe('function');
  });

  it('数据导入导出核心函数可执行', () => {
    const result = validateAndNormalizeImportData({
      members: [{ nickname: '测试成员' }],
      gears: [{ name: '测试装备', owner: '测试人' }]
    });

    expect(result.valid).toBe(true);
    expect(result.data.members).toHaveLength(1);
    expect(result.data.gears).toHaveLength(1);
  });
});

describe('冒烟测试 - 候补预约链路', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('候补预约创建与验证流程正常', () => {
    const gear = { id: 'gear-001', name: '测试帐篷', owner: '张三', status: '可借' };
    const reservation = createReservation({
      gearId: 'gear-001',
      gearName: '测试帐篷',
      owner: '张三',
      borrower: '李四',
      start: iso(5),
      end: iso(7),
      reason: '装备借出中'
    });

    expect(reservation).toBeDefined();
    expect(reservation.status).toBe('候补中');
    expect(reservation.gearId).toBe('gear-001');

    const validation = validateActivation(reservation, {
      requests: [],
      gears: [gear]
    });

    expect(validation.ok).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('候补转正能生成申请', () => {
    const gear = { id: 'gear-001', name: '测试帐篷', owner: '张三' };
    const reservation = createReservation({
      gearId: 'gear-001',
      gearName: '测试帐篷',
      owner: '张三',
      borrower: '李四',
      start: iso(5),
      end: iso(7)
    });

    const request = createRequestFromReservation(reservation, gear);
    expect(request).toBeDefined();
    expect(request.gearId).toBe('gear-001');
    expect(request.status).toBe('待处理');
    expect(request.fromReservationId).toBe(reservation.id);
  });
});

describe('冒烟测试 - 盘点异常扣押金链路', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('盘点单创建与异常操作正常', () => {
    const gear = { id: 'gear-001', name: '测试帐篷', owner: '张三' };
    const item = createInventoryItemFromGear(gear, '盘点人');

    expect(item).toBeDefined();
    expect(item.checkStatus).toBe('待盘点');
    expect(item.hasAbnormal).toBe(false);

    const action = createAbnormalAction({
      type: '押金扣除',
      description: '损坏赔偿',
      amount: '50',
      handler: '盘点人',
      borrower: '李四'
    });

    expect(action).toBeDefined();
    expect(action.status).toBe('待处理');
    expect(action.amount).toBe('50');

    const list = createInventoryList({
      name: '测试盘点',
      type: '出行后',
      items: [{ ...item, abnormalActions: [action], hasAbnormal: true }]
    });

    expect(list.items).toHaveLength(1);
    expect(list.items[0].hasAbnormal).toBe(true);
  });

  it('待处理押金扣除查询正常', () => {
    const action = createAbnormalAction({
      type: '押金扣除',
      description: '脏污清洗',
      amount: '30',
      borrower: '李四'
    });

    const gear = { id: 'gear-001', name: '测试帐篷', owner: '张三' };
    const item = {
      ...createInventoryItemFromGear(gear, '张三'),
      abnormalActions: [action],
      hasAbnormal: true
    };

    const list = createInventoryList({
      name: '出行后盘点',
      type: '出行后',
      items: [item]
    });

    const pending = getPendingDepositDeductions([list]);
    expect(pending).toHaveLength(1);
    expect(pending[0].amount).toBe('30');
    expect(pending[0].type).toBe('押金扣除');
  });
});

describe('冒烟测试 - 结算刷新链路', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('结算单创建与计算正常', () => {
    const member = { memberId: 'm1', nickname: '李四' };
    let settlement = createSettlement({
      name: '测试结算单',
      members: [member]
    });

    expect(settlement).toBeDefined();
    expect(settlement.status).toBe('草稿');
    expect(settlement.members).toHaveLength(1);

    settlement = calculateSettlement(settlement);
    expect(Number(settlement.totalDeposit)).toBeGreaterThanOrEqual(0);
  });

  it('押金关联与结算刷新正常', () => {
    const member = { memberId: 'm1', nickname: '李四' };
    let settlement = createSettlement({
      name: '测试结算',
      members: [member]
    });

    const deposit = {
      id: 'dep-001',
      gearId: 'gear-001',
      gearName: '帐篷',
      owner: '张三',
      borrower: '李四',
      depositAmount: '200',
      receivedAmount: '200',
      deductedAmount: '0',
      refundedAmount: '0',
      status: '已收取'
    };

    settlement = linkDepositsToSettlement(
      settlement,
      [deposit],
      ['李四'],
      [{ gearId: 'gear-001' }],
      null,
      []
    );

    settlement = calculateSettlement(settlement);

    const memberData = settlement.members.find(m => m.nickname === '李四');
    expect(memberData.depositItems.length).toBeGreaterThanOrEqual(1);
  });

  it('盘点扣款联动结算正常', () => {
    const member = { memberId: 'm1', nickname: '李四' };
    let settlement = createSettlement({
      name: '测试结算',
      members: [member]
    });

    const deductionAction = {
      id: 'act-1',
      type: '押金扣除',
      status: '待处理',
      amount: '60',
      description: '帐篷损坏',
      borrower: '李四',
      createdAt: new Date().toISOString()
    };

    const inventoryList = {
      id: 'inv-1',
      name: '出行后盘点',
      type: '出行后',
      date: iso(0),
      items: [
        {
          id: 'item-1',
          gearId: 'gear-001',
          gearName: '帐篷',
          owner: '张三',
          abnormalActions: [deductionAction]
        }
      ]
    };

    settlement = refreshSettlementFromSources(
      settlement,
      [],
      [inventoryList],
      [{ gearId: 'gear-001' }],
      null
    );

    const memberData = settlement.members.find(m => m.nickname === '李四');
    const invItems = memberData.depositItems.filter(d => d.source === 'inventory');

    expect(invItems).toHaveLength(1);
    expect(invItems[0].pending).toBe(true);
    expect(Number(invItems[0].deductedAmount)).toBe(60);

    settlement = markInventoryDeductionAsHandled(settlement, 'act-1', true);
    const afterHandle = settlement.members.find(m => m.nickname === '李四');
    const afterInv = afterHandle.depositItems.find(d => d.source === 'inventory');
    expect(afterInv.pending).toBe(false);
    expect(Number(afterInv.actualDeduct)).toBe(60);
  });

  it('结算完结验证正常', () => {
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
    let settlement = createSettlement({
      name: '测试结算',
      members: [member]
    });
    settlement.status = '已确认';
    settlement = updateAllPaymentsToPaid(settlement);

    expect(canFinalizeSettlement(settlement)).toBe(true);

    const finalized = finalizeSettlement(settlement);
    expect(finalized.status).toBe('已结算');
  });
});

describe('冒烟测试 - 数据导入导出回归', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('完整数据导入后结构完整', () => {
    const testData = {
      _exportVersion: '1.0',
      members: [
        { id: 'm1', nickname: '张三', phone: '13800138000' },
        { id: 'm2', nickname: '李四' }
      ],
      gears: [
        { id: 'g1', name: '高山帐篷', owner: '张三', category: '帐篷', deposit: 300, status: '可借' },
        { id: 'g2', name: '睡袋', owner: '李四', category: '睡袋', deposit: 100, status: '可借' }
      ],
      requests: [
        { id: 'r1', gearId: 'g1', gearName: '高山帐篷', owner: '张三', borrower: '李四', start: iso(5), end: iso(7), status: '借出中' }
      ],
      trips: [
        {
          id: 't1',
          destination: '海边露营',
          startDate: iso(5),
          members: ['张三', '李四'],
          gears: [{ gearId: 'g1', gearName: '高山帐篷', owner: '张三', deposit: '300', status: '已借' }]
        }
      ],
      depositRecords: [
        {
          id: 'd1',
          requestId: 'r1',
          gearId: 'g1',
          gearName: '高山帐篷',
          owner: '张三',
          borrower: '李四',
          depositAmount: 300,
          receivedAmount: 300,
          deductedAmount: 0,
          refundedAmount: 0,
          status: '已收取'
        }
      ],
      inventoryLists: [
        {
          id: 'inv1',
          name: '出行前盘点',
          type: '出行前',
          tripId: 't1',
          date: iso(5),
          status: '已完成',
          checker: '张三',
          items: [
            { id: 'item1', gearId: 'g1', gearName: '高山帐篷', owner: '张三', checkStatus: '已盘点' }
          ]
        }
      ],
      settlementRecords: [
        {
          id: 's1',
          tripId: 't1',
          name: '海边露营 结算单',
          status: '草稿',
          members: [
            { memberId: 'm1', nickname: '张三', depositItems: [] },
            { memberId: 'm2', nickname: '李四', depositItems: [] }
          ]
        }
      ],
      reservations: [
        {
          id: 'res1',
          gearId: 'g2',
          gearName: '睡袋',
          owner: '李四',
          borrower: '王五',
          start: iso(10),
          end: iso(12),
          status: '候补中'
        }
      ]
    };

    const result = validateAndNormalizeImportData(testData);
    expect(result.valid).toBe(true);

    expect(result.data.members).toHaveLength(2);
    expect(result.data.gears).toHaveLength(2);
    expect(result.data.requests).toHaveLength(1);
    expect(result.data.trips).toHaveLength(1);
    expect(result.data.depositRecords).toHaveLength(1);
    expect(result.data.inventoryLists).toHaveLength(1);
    expect(result.data.settlementRecords).toHaveLength(1);
    expect(result.data.reservations).toHaveLength(1);

    expect(result.summary.members).toBe(2);
    expect(result.summary.gears).toBe(2);
    expect(result.summary.requests).toBe(1);
    expect(result.summary.trips).toBe(1);
    expect(result.summary.depositRecords).toBe(1);
    expect(result.summary.inventoryLists).toBe(1);
    expect(result.summary.settlementRecords).toBe(1);
    expect(result.summary.reservations).toBe(1);
  });

  it('异常数据导入有警告但不崩溃', () => {
    const badData = {
      members: [
        { nickname: '有效成员' },
        null,
        { phone: '123456' },
        'not an object'
      ],
      gears: [
        { name: '有效装备', owner: '张三' },
        { owner: '无名装备' }
      ],
      requests: ['invalid']
    };

    const result = validateAndNormalizeImportData(badData);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.data.members).toHaveLength(1);
    expect(result.data.gears).toHaveLength(1);
  });

  it('空数据导入不崩溃', () => {
    const result = validateAndNormalizeImportData({});
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('完全无效数据返回错误', () => {
    const result = validateAndNormalizeImportData(null);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('冒烟测试 - 跨模块集成验证', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('端到端：候补 → 盘点异常 → 扣押金 → 结算完整流程', () => {
    const gears = [
      { id: 'gear-001', name: '高山帐篷', owner: '张三', status: '可借', deposit: '300' }
    ];

    const reservation = createReservation({
      gearId: 'gear-001',
      gearName: '高山帐篷',
      owner: '张三',
      borrower: '李四',
      start: iso(5),
      end: iso(7),
      reason: '装备借出中'
    });

    const validation = validateActivation(reservation, { requests: [], gears });
    expect(validation.ok).toBe(true);

    const request = createRequestFromReservation(reservation, gears[0]);
    expect(request.status).toBe('待处理');
    expect(request.fromReservationId).toBe(reservation.id);

    const deposit = {
      id: 'dep-001',
      requestId: request.id,
      gearId: 'gear-001',
      gearName: '高山帐篷',
      owner: '张三',
      borrower: '李四',
      depositAmount: '300',
      receivedAmount: '300',
      deductedAmount: '0',
      refundedAmount: '0',
      status: '已收取'
    };

    const trip = {
      id: 'trip-001',
      destination: '武功山露营',
      startDate: iso(5),
      members: ['张三', '李四'],
      gears: [{ gearId: 'gear-001', gearName: '高山帐篷', owner: '张三', deposit: '300' }]
    };

    const deductionAction = createAbnormalAction({
      type: '押金扣除',
      description: '帐篷杆断裂，需赔偿',
      amount: '100',
      handler: '张三',
      borrower: '李四'
    });

    const inventoryItem = createInventoryItemFromGear(gears[0], '张三');
    const inventoryList = createInventoryList({
      name: '武功山出行后盘点',
      type: '出行后',
      tripId: 'trip-001',
      tripName: '武功山露营',
      checker: '张三',
      items: [{ ...inventoryItem, abnormalActions: [deductionAction], hasAbnormal: true }]
    });

    const pendingDeductions = getPendingDepositDeductions([inventoryList]);
    expect(pendingDeductions).toHaveLength(1);
    expect(pendingDeductions[0].amount).toBe('100');

    const member = { memberId: 'm1', nickname: '李四' };
    let settlement = createSettlement({
      tripId: 'trip-001',
      tripName: '武功山露营',
      members: [member],
      name: '武功山露营 结算单'
    });

    settlement = linkDepositsToSettlement(
      settlement,
      [deposit],
      ['李四'],
      trip.gears,
      [request.id],
      [inventoryList]
    );
    settlement = calculateSettlement(settlement);

    const memberData = settlement.members.find(m => m.nickname === '李四');
    expect(memberData.depositItems.length).toBeGreaterThanOrEqual(2);

    const invDeduction = memberData.depositItems.find(d => d.source === 'inventory');
    expect(invDeduction).toBeDefined();
    expect(invDeduction.pending).toBe(true);

    settlement = markInventoryDeductionAsHandled(settlement, deductionAction.id, true);
    const afterHandle = settlement.members.find(m => m.nickname === '李四');
    const afterInv = afterHandle.depositItems.find(d => d.source === 'inventory');
    expect(afterInv.pending).toBe(false);
    expect(Number(afterInv.actualDeduct)).toBe(100);

    expect(canFinalizeSettlement(settlement)).toBe(false);
  });
});
