import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createInventoryItemFromGear,
  createInventoryList,
  createAbnormalAction,
  getInventoryStats,
  getAbnormalItems,
  getPendingDepositDeductions,
  createDepositDeductionPayload,
  applyAbnormalDeductionToDeposit,
  INVENTORY_TYPES,
  INVENTORY_STATUSES,
  ITEM_CHECK_STATUSES,
  ABNORMAL_ACTION_TYPES,
  ABNORMAL_ACTION_STATUSES
} from '../../utils/inventoryTransform.js';
import { createMockGear, createMockRequest, iso } from '../testData.js';

describe('inventoryTransform - 常量定义', () => {
  it('盘点类型常量正确', () => {
    expect(INVENTORY_TYPES).toEqual(['出行前', '出行后']);
  });

  it('盘点状态常量正确', () => {
    expect(INVENTORY_STATUSES).toEqual(['进行中', '已完成']);
  });

  it('盘点项状态常量正确', () => {
    expect(ITEM_CHECK_STATUSES).toEqual(['待盘点', '已盘点', '缺失']);
  });

  it('异常动作类型常量正确', () => {
    expect(ABNORMAL_ACTION_TYPES).toEqual(['装备损耗', '保养记录', '押金扣除']);
  });

  it('异常动作状态常量正确', () => {
    expect(ABNORMAL_ACTION_STATUSES).toEqual(['待处理', '已处理', '已取消']);
  });
});

describe('inventoryTransform - 创建函数', () => {
  it('createInventoryItemFromGear 生成正确的盘点项', () => {
    const gear = createMockGear({ id: 'gear-001', name: '测试帐篷', owner: '张三' });
    const item = createInventoryItemFromGear(gear, '李四');

    expect(item.id).toBeDefined();
    expect(item.gearId).toBe('gear-001');
    expect(item.gearName).toBe('测试帐篷');
    expect(item.owner).toBe('张三');
    expect(item.checkStatus).toBe('待盘点');
    expect(item.missingAccessories).toBe('');
    expect(item.notes).toBe('');
    expect(item.checker).toBe('李四');
    expect(item.hasAbnormal).toBe(false);
    expect(item.abnormalActions).toEqual([]);
  });

  it('createInventoryList 生成正确的盘点单', () => {
    const items = [createInventoryItemFromGear(createMockGear())];
    const list = createInventoryList({
      name: '国庆出行盘点',
      type: '出行前',
      tripId: 'trip-001',
      tripName: '国庆露营',
      checker: '张三',
      notes: '注意检查帐篷',
      items
    });

    expect(list.id).toBeDefined();
    expect(list.name).toBe('国庆出行盘点');
    expect(list.type).toBe('出行前');
    expect(list.tripId).toBe('trip-001');
    expect(list.tripName).toBe('国庆露营');
    expect(list.status).toBe('进行中');
    expect(list.checker).toBe('张三');
    expect(list.notes).toBe('注意检查帐篷');
    expect(list.items).toHaveLength(1);
    expect(list.createdAt).toBeDefined();
    expect(list.updatedAt).toBeDefined();
  });

  it('createInventoryList 使用默认值', () => {
    const list = createInventoryList({});
    expect(list.name).toBe('未命名盘点');
    expect(list.type).toBe('出行前');
    expect(list.items).toEqual([]);
  });

  it('createAbnormalAction 生成正确的异常动作', () => {
    const action = createAbnormalAction({
      type: '押金扣除',
      description: '帐篷损坏',
      amount: '50',
      handler: '张三',
      borrower: '李四'
    });

    expect(action.id).toBeDefined();
    expect(action.type).toBe('押金扣除');
    expect(action.description).toBe('帐篷损坏');
    expect(action.amount).toBe('50');
    expect(action.handler).toBe('张三');
    expect(action.borrower).toBe('李四');
    expect(action.status).toBe('待处理');
    expect(action.relatedRecordId).toBe('');
    expect(action.createdAt).toBeDefined();
    expect(action.updatedAt).toBeDefined();
  });

  it('createAbnormalAction 金额转为字符串', () => {
    const action = createAbnormalAction({ type: '装备损耗', amount: 100 });
    expect(action.amount).toBe('100');
  });
});

describe('inventoryTransform - 统计函数', () => {
  it('getInventoryStats 正确统计盘点状态', () => {
    const items = [
      { checkStatus: '已盘点' },
      { checkStatus: '已盘点' },
      { checkStatus: '待盘点' },
      { checkStatus: '缺失' }
    ];
    const list = { items };
    const stats = getInventoryStats(list);

    expect(stats.total).toBe(4);
    expect(stats.checked).toBe(2);
    expect(stats.missing).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.progress).toBe(50);
  });

  it('getInventoryStats 空列表返回 0', () => {
    const stats = getInventoryStats({ items: [] });
    expect(stats.total).toBe(0);
    expect(stats.progress).toBe(0);
  });

  it('getInventoryStats null 返回 0', () => {
    const stats = getInventoryStats(null);
    expect(stats.total).toBe(0);
  });

  it('getAbnormalItems 筛选异常项', () => {
    const items = [
      { id: '1', hasAbnormal: true },
      { id: '2', hasAbnormal: false },
      { id: '3', hasAbnormal: true }
    ];
    const list = { items };
    const abnormal = getAbnormalItems(list);
    expect(abnormal).toHaveLength(2);
    expect(abnormal[0].id).toBe('1');
  });
});

describe('inventoryTransform - 待处理押金扣除', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('getPendingDepositDeductions 获取出行后待处理押金扣除', () => {
    const deductionAction = createAbnormalAction({
      type: '押金扣除',
      description: '帐篷杆断裂',
      amount: '100',
      borrower: '李四'
    });

    const inventoryList = createInventoryList({
      name: '出行后盘点',
      type: '出行后',
      tripId: 'trip-001',
      items: [
        {
          id: 'item-1',
          gearId: 'gear-001',
          gearName: '测试帐篷',
          owner: '张三',
          checkStatus: '已盘点',
          abnormalActions: [deductionAction]
        }
      ]
    });

    const result = getPendingDepositDeductions([inventoryList]);
    expect(result).toHaveLength(1);
    expect(result[0].gearId).toBe('gear-001');
    expect(result[0].amount).toBe('100');
    expect(result[0].inventoryName).toBe('出行后盘点');
    expect(result[0].itemId).toBe('item-1');
  });

  it('getPendingDepositDeductions 过滤非押金扣除类型', () => {
    const damageAction = createAbnormalAction({
      type: '装备损耗',
      description: '轻微磨损',
      amount: '50'
    });

    const inventoryList = createInventoryList({
      name: '出行后盘点',
      type: '出行后',
      items: [
        {
          id: 'item-1',
          gearId: 'gear-001',
          gearName: '测试帐篷',
          owner: '张三',
          abnormalActions: [damageAction]
        }
      ]
    });

    const result = getPendingDepositDeductions([inventoryList]);
    expect(result).toHaveLength(0);
  });

  it('getPendingDepositDeductions 过滤已处理和已取消', () => {
    const handledAction = createAbnormalAction({ type: '押金扣除', amount: '50' });
    handledAction.status = '已处理';
    const cancelledAction = createAbnormalAction({ type: '押金扣除', amount: '30' });
    cancelledAction.status = '已取消';

    const inventoryList = createInventoryList({
      name: '出行后盘点',
      type: '出行后',
      items: [
        {
          id: 'item-1',
          gearId: 'gear-001',
          gearName: '测试帐篷',
          owner: '张三',
          abnormalActions: [handledAction, cancelledAction]
        }
      ]
    });

    const result = getPendingDepositDeductions([inventoryList]);
    expect(result).toHaveLength(0);
  });

  it('getPendingDepositDeductions 过滤金额为 0 的', () => {
    const zeroAction = createAbnormalAction({ type: '押金扣除', amount: '0' });

    const inventoryList = createInventoryList({
      name: '出行后盘点',
      type: '出行后',
      items: [
        {
          id: 'item-1',
          gearId: 'gear-001',
          gearName: '测试帐篷',
          owner: '张三',
          abnormalActions: [zeroAction]
        }
      ]
    });

    const result = getPendingDepositDeductions([inventoryList]);
    expect(result).toHaveLength(0);
  });

  it('getPendingDepositDeductions 只处理出行后盘点', () => {
    const deductionAction = createAbnormalAction({
      type: '押金扣除',
      amount: '100',
      borrower: '李四'
    });

    const beforeList = createInventoryList({
      name: '出行前盘点',
      type: '出行前',
      items: [
        {
          id: 'item-1',
          gearId: 'gear-001',
          gearName: '测试帐篷',
          owner: '张三',
          abnormalActions: [deductionAction]
        }
      ]
    });

    const result = getPendingDepositDeductions([beforeList]);
    expect(result).toHaveLength(0);
  });

  it('getPendingDepositDeductions 按 tripId 过滤', () => {
    const deductionAction = createAbnormalAction({
      type: '押金扣除',
      amount: '100',
      borrower: '李四'
    });

    const list1 = createInventoryList({
      name: '盘点1',
      type: '出行后',
      tripId: 'trip-001',
      items: [{ id: 'item-1', gearId: 'gear-001', gearName: '帐篷', owner: '张三', abnormalActions: [deductionAction] }]
    });

    const list2 = createInventoryList({
      name: '盘点2',
      type: '出行后',
      tripId: 'trip-002',
      items: [{ id: 'item-2', gearId: 'gear-002', gearName: '睡袋', owner: '王五', abnormalActions: [deductionAction] }]
    });

    const result = getPendingDepositDeductions([list1, list2], 'trip-001');
    expect(result).toHaveLength(1);
    expect(result[0].gearId).toBe('gear-001');
  });
});

describe('inventoryTransform - 押金扣除载荷与应用', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('createDepositDeductionPayload 生成正确载荷', () => {
    const action = {
      id: 'action-1',
      gearId: 'gear-001',
      gearName: '测试帐篷',
      owner: '张三',
      borrower: '李四',
      amount: '100',
      description: '帐篷损坏',
      inventoryId: 'inv-001'
    };

    const depositRecords = [
      { id: 'dep-1', gearId: 'gear-001', borrower: '李四', requestId: 'req-1' }
    ];
    const requestRecords = [
      { id: 'req-1', gearId: 'gear-001', borrower: '李四' }
    ];

    const payload = createDepositDeductionPayload(action, depositRecords, requestRecords);
    expect(payload.gearId).toBe('gear-001');
    expect(payload.deductedAmount).toBe('100');
    expect(payload.deductReason).toContain('帐篷损坏');
    expect(payload.requestId).toBe('req-1');
    expect(payload.relatedInventoryId).toBe('inv-001');
    expect(payload.relatedInventoryActionId).toBe('action-1');
  });

  it('applyAbnormalDeductionToDeposit 无匹配押金时创建新记录', () => {
    const action = {
      id: 'action-1',
      gearId: 'gear-001',
      gearName: '测试帐篷',
      owner: '张三',
      borrower: '李四',
      amount: '100',
      description: '帐篷损坏',
      inventoryId: 'inv-001',
      inventoryName: '出行后盘点'
    };

    const result = applyAbnormalDeductionToDeposit(action, [], []);
    expect(result.type).toBe('create');
    expect(result.deposit.deductedAmount).toBe('100');
    expect(result.deposit._fromInventory).toBe(true);
    expect(result.deposit.deductReason).toContain('盘点异常扣除');
  });

  it('applyAbnormalDeductionToDeposit 有匹配押金时累加扣除', () => {
    const action = {
      id: 'action-1',
      gearId: 'gear-001',
      gearName: '测试帐篷',
      owner: '张三',
      borrower: '李四',
      amount: '50',
      description: '帐篷杆断了',
      inventoryId: 'inv-001',
      inventoryName: '出行后盘点'
    };

    const depositRecords = [
      {
        id: 'dep-1',
        gearId: 'gear-001',
        gearName: '测试帐篷',
        owner: '张三',
        borrower: '李四',
        depositAmount: '200',
        receivedAmount: '200',
        deductedAmount: '30',
        refundedAmount: '0',
        deductReason: '之前的磨损',
        status: '部分扣除',
        requestId: 'req-1'
      }
    ];

    const requestRecords = [
      { id: 'req-1', gearId: 'gear-001', borrower: '李四' }
    ];

    const result = applyAbnormalDeductionToDeposit(action, depositRecords, requestRecords);
    expect(result.type).toBe('update');
    expect(Number(result.deposit.deductedAmount)).toBe(80);
    expect(result.deposit.deductReason).toContain('之前的磨损');
    expect(result.deposit.deductReason).toContain('盘点异常扣除');
  });

  it('applyAbnormalDeductionToDeposit 按 requestId 匹配押金', () => {
    const action = {
      id: 'action-1',
      gearId: 'gear-001',
      gearName: '测试帐篷',
      owner: '张三',
      borrower: '李四',
      amount: '50',
      description: '损坏',
      inventoryId: 'inv-001',
      inventoryName: '盘点'
    };

    const depositRecords = [
      {
        id: 'dep-1',
        requestId: 'req-match',
        gearId: 'gear-001',
        gearName: '测试帐篷',
        owner: '张三',
        borrower: '李四',
        depositAmount: '200',
        receivedAmount: '200',
        deductedAmount: '0',
        refundedAmount: '0',
        status: '已收取'
      }
    ];

    const requestRecords = [
      { id: 'req-match', gearId: 'gear-001', borrower: '李四' }
    ];

    const result = applyAbnormalDeductionToDeposit(action, depositRecords, requestRecords);
    expect(result.type).toBe('update');
    expect(Number(result.deposit.deductedAmount)).toBe(50);
  });
});
