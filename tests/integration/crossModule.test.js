import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createReservation,
  activateReservation,
  createRequestFromReservation,
  validateActivation
} from '../../utils/reservationTransform.js';
import {
  createInventoryList,
  createInventoryItemFromGear,
  createAbnormalAction,
  getPendingDepositDeductions,
  applyAbnormalDeductionToDeposit
} from '../../utils/inventoryTransform.js';
import {
  createSettlement,
  linkDepositsToSettlement,
  calculateSettlement,
  refreshSettlementFromSources,
  markInventoryDeductionAsHandled,
  finalizeSettlement,
  canFinalizeSettlement
} from '../../utils/settlementTransform.js';
import {
  validateAndNormalizeImportData,
  buildImportPreviewResult,
  performMerge,
  analyzeMergeData
} from '../../utils/dataTransform.js';

const iso = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

const createTestGear = (id, name, owner, deposit = '200') => ({
  id,
  name,
  owner,
  category: '帐篷',
  status: '可借',
  deposit,
  notes: '',
  damage: '',
  maintenanceCycleDays: 30,
  nextMaintenanceDate: iso(30),
  maintenanceReminderLevel: '标准'
});

const createTestMember = (id, nickname) => ({
  id,
  nickname,
  phone: '',
  area: '',
  notes: ''
});

describe('跨模块链路 - 候补预约到结算完整流程', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('完整链路：候补预约 → 转正 → 借出 → 盘点异常 → 扣押金 → 结算刷新 → 结算完成', () => {
    const gears = [
      createTestGear('gear-001', '高山帐篷', '张三', '300')
    ];
    const members = [
      createTestMember('m1', '张三'),
      createTestMember('m2', '李四')
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
    expect(reservation.status).toBe('候补中');
    expect(reservation.priorityScore).toBe(0);

    const validation = validateActivation(reservation, { requests: [], gears });
    expect(validation.ok).toBe(true);

    const activated = activateReservation(reservation, '');
    expect(activated.status).toBe('已转正');

    const request = createRequestFromReservation(reservation, gears[0]);
    expect(request.status).toBe('待处理');
    expect(request.fromReservationId).toBe(reservation.id);
    expect(request.gearName).toBe('高山帐篷');

    const activeRequest = { ...request, status: '借出中' };

    const deposit = {
      id: 'dep-001',
      requestId: activeRequest.id,
      gearId: 'gear-001',
      gearName: '高山帐篷',
      owner: '张三',
      borrower: '李四',
      depositAmount: '300',
      receivedAmount: '300',
      deductedAmount: '0',
      refundedAmount: '0',
      deductReason: '',
      status: '已收取',
      notes: '',
      createdAt: iso(5),
      updatedAt: iso(5)
    };

    const trip = {
      id: 'trip-001',
      destination: '武功山露营',
      startDate: iso(5),
      members: ['张三', '李四'],
      gears: [
        { gearId: 'gear-001', gearName: '高山帐篷', owner: '张三', deposit: '300', status: '已借' }
      ]
    };

    const inventoryItem = createInventoryItemFromGear(gears[0], '张三');
    const inventoryList = createInventoryList({
      name: '武功山出行后盘点',
      type: '出行后',
      tripId: 'trip-001',
      tripName: '武功山露营',
      checker: '张三',
      items: [inventoryItem]
    });

    const deductionAction = createAbnormalAction({
      type: '押金扣除',
      description: '帐篷杆断裂，需赔偿',
      amount: '100',
      handler: '张三',
      borrower: '李四'
    });

    const updatedInventoryList = {
      ...inventoryList,
      items: inventoryList.items.map(item =>
        item.gearId === 'gear-001'
          ? { ...item, abnormalActions: [deductionAction], hasAbnormal: true }
          : item
      )
    };

    const pendingDeductions = getPendingDepositDeductions([updatedInventoryList]);
    expect(pendingDeductions).toHaveLength(1);
    expect(pendingDeductions[0].amount).toBe('100');
    expect(pendingDeductions[0].borrower).toBe('李四');

    const deductionResult = applyAbnormalDeductionToDeposit(
      { ...pendingDeductions[0], borrower: '李四' },
      [deposit],
      [activeRequest]
    );
    expect(deductionResult.type).toBe('update');
    expect(Number(deductionResult.deposit.deductedAmount)).toBe(100);
    expect(deductionResult.deposit.deductReason).toContain('帐篷杆断裂');

    const updatedDeposit = deductionResult.deposit;

    const settlementMembers = members.map(m => ({
      memberId: m.id,
      nickname: m.nickname,
      depositItems: [],
      extraShare: '0',
      totalOwed: '0',
      paidAmount: '0',
      paymentStatus: '未支付',
      notes: ''
    }));

    let settlement = createSettlement({
      tripId: 'trip-001',
      tripName: '武功山露营',
      members: settlementMembers,
      name: '武功山露营 结算单'
    });

    settlement = linkDepositsToSettlement(
      settlement,
      [updatedDeposit],
      ['张三', '李四'],
      trip.gears,
      [activeRequest.id],
      [updatedInventoryList]
    );

    settlement = calculateSettlement(settlement);

    const lisiMember = settlement.members.find(m => m.nickname === '李四');
    expect(lisiMember).toBeDefined();
    expect(lisiMember.depositItems.length).toBeGreaterThanOrEqual(1);

    const depositItems = lisiMember.depositItems.filter(d => d.source === 'deposit');
    expect(depositItems).toHaveLength(1);
    expect(Number(depositItems[0].actualDeduct)).toBe(100);

    const inventoryItems = lisiMember.depositItems.filter(d => d.source === 'inventory');
    expect(inventoryItems).toHaveLength(1);
    expect(inventoryItems[0].pending).toBe(true);

    settlement = markInventoryDeductionAsHandled(
      settlement,
      deductionAction.id,
      true
    );

    const lisiAfter = settlement.members.find(m => m.nickname === '李四');
    const invAfter = lisiAfter.depositItems.find(d => d.source === 'inventory');
    expect(invAfter.pending).toBe(false);
    expect(Number(invAfter.actualDeduct)).toBe(100);

    const totalDeducted = lisiAfter.depositItems.reduce(
      (sum, d) => sum + Number(d.actualDeduct), 0
    );
    expect(totalDeducted).toBe(200);

    expect(canFinalizeSettlement(settlement)).toBe(false);

    settlement.members = settlement.members.map(m => ({
      ...m,
      paidAmount: m.totalOwed,
      paymentStatus: '已支付'
    }));
    settlement = calculateSettlement(settlement);

    expect(canFinalizeSettlement(settlement)).toBe(true);

    const finalized = finalizeSettlement(settlement);
    expect(finalized.status).toBe('已结算');
  });

  it('候补预约转正失败场景：装备不可借', () => {
    const gears = [createTestGear('gear-001', '帐篷', '张三', '200')];
    gears[0].status = '不可借';

    const reservation = createReservation({
      gearId: 'gear-001',
      gearName: '帐篷',
      owner: '张三',
      borrower: '李四',
      start: iso(5),
      end: iso(7)
    });

    const validation = validateActivation(reservation, { requests: [], gears });
    expect(validation.ok).toBe(false);
    expect(validation.errors.some(e => e.code === 'gear_unavailable')).toBe(true);
  });
});

describe('跨模块链路 - 数据导入导出回归', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('导入导出数据完整性：导出 → 归一化 → 再导入 → 对比', () => {
    const exportData = {
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
          tripName: '海边露营',
          date: iso(5),
          status: '已完成',
          checker: '张三',
          items: [
            { id: 'item1', gearId: 'g1', gearName: '高山帐篷', owner: '张三', checkStatus: '已盘点', missingAccessories: '', notes: '', hasAbnormal: false }
          ]
        }
      ],
      settlementRecords: [
        {
          id: 's1',
          tripId: 't1',
          tripName: '海边露营',
          name: '海边露营 结算单',
          status: '草稿',
          members: [
            { memberId: 'm1', nickname: '张三', depositItems: [], extraShare: '0', totalOwed: '0', paidAmount: '0', paymentStatus: '未支付', notes: '' },
            { memberId: 'm2', nickname: '李四', depositItems: [], extraShare: '0', totalOwed: '0', paidAmount: '0', paymentStatus: '未支付', notes: '' }
          ],
          extraExpenses: []
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
          status: '候补中',
          reason: '装备借出中',
          priorityScore: 50,
          queuePosition: 1
        }
      ]
    };

    const normalized = validateAndNormalizeImportData(exportData);
    expect(normalized.valid).toBe(true);
    expect(normalized.summary.members).toBe(2);
    expect(normalized.summary.gears).toBe(2);
    expect(normalized.summary.requests).toBe(1);
    expect(normalized.summary.trips).toBe(1);
    expect(normalized.summary.depositRecords).toBe(1);
    expect(normalized.summary.inventoryLists).toBe(1);
    expect(normalized.summary.settlementRecords).toBe(1);
    expect(normalized.summary.reservations).toBe(1);

    expect(normalized.data.members[0].nickname).toBe('张三');
    expect(normalized.data.gears[0].deposit).toBe('300');
    expect(normalized.data.requests[0].status).toBe('借出中');
    expect(normalized.data.inventoryLists[0].items[0].checkStatus).toBe('已盘点');
    expect(normalized.data.reservations[0].status).toBe('候补中');

    const preview = buildImportPreviewResult(exportData, {});
    expect(preview.valid).toBe(true);
    expect(preview.mergeAnalysis).toBeDefined();
    expect(preview.mergeAnalysis.summary.totalAdded).toBeGreaterThan(0);

    const currentData = {
      members: [{ id: 'm0', nickname: '现有成员' }],
      gears: []
    };
    const mergeAnalysis = analyzeMergeData(currentData, normalized.data);
    const merged = performMerge(currentData, normalized.data, mergeAnalysis);

    expect(merged.members).toHaveLength(3);
    expect(merged.gears).toHaveLength(2);
  });

  it('数据导入鲁棒性：格式异常数据能正常处理', () => {
    const badData = {
      members: [
        { nickname: '有效成员' },
        null,
        { phone: '123456' },
        'not an object'
      ],
      gears: [
        { name: '有效装备', owner: '张三' },
        { owner: '无名装备' },
        null
      ],
      requests: ['invalid', { gearName: '帐篷', borrower: '李四' }],
      trips: [
        { destination: '有效出行', members: ['张三', '不存在的人'], gears: [] }
      ]
    };

    const result = validateAndNormalizeImportData(badData);
    expect(result.valid).toBe(true);
    expect(result.data.members).toHaveLength(1);
    expect(result.data.gears).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('跨模块链路 - 盘点异常与结算联动', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('新增盘点异常后，结算刷新能正确反映', () => {
    const gear = createTestGear('gear-001', '帐篷', '张三', '200');
    const member = createTestMember('m1', '李四');

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

    let settlement = createSettlement({
      members: [member],
      name: '测试结算单'
    });
    settlement = linkDepositsToSettlement(settlement, [deposit], ['李四'], [{ gearId: 'gear-001' }], null, []);
    settlement = calculateSettlement(settlement);

    const initialTotalDeduct = Number(settlement.totalDeducted);
    expect(initialTotalDeduct).toBe(0);

    const deductionAction = createAbnormalAction({
      type: '押金扣除',
      description: '脏污需清洗',
      amount: '50',
      borrower: '李四'
    });

    const inventoryList = {
      id: 'inv-001',
      name: '出行后盘点',
      type: '出行后',
      date: iso(0),
      items: [
        {
          id: 'item-001',
          gearId: 'gear-001',
          gearName: '帐篷',
          owner: '张三',
          abnormalActions: [deductionAction]
        }
      ]
    };

    settlement = refreshSettlementFromSources(
      settlement,
      [deposit],
      [inventoryList],
      [{ gearId: 'gear-001' }],
      null
    );

    const memberData = settlement.members.find(m => m.nickname === '李四');
    const invDeduction = memberData.depositItems.find(d => d.source === 'inventory');
    expect(invDeduction).toBeDefined();
    expect(Number(invDeduction.deductedAmount)).toBe(50);
    expect(invDeduction.pending).toBe(true);

    settlement = markInventoryDeductionAsHandled(settlement, deductionAction.id, true);
    const afterHandle = settlement.members.find(m => m.nickname === '李四');
    const invAfter = afterHandle.depositItems.find(d => d.source === 'inventory');
    expect(invAfter.pending).toBe(false);
    expect(Number(invAfter.actualDeduct)).toBe(50);
  });
});
